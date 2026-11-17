import { describe, expect, it } from "vitest";
import {
  allowedMovementActions,
  allowedVersionActions,
  canRecordMovement,
  DEBT_STATUSES,
  isStatusValidForMode,
  movementStatusAfter,
  otherRole,
  statusAfterBalanceChange,
} from "@/domain/lifecycle";
import {
  amendmentViolations,
  canonicalJSON,
  canonicalTerms,
  diffTerms,
  openingBalanceMinor,
  validateTerms,
  type TermsSnapshot,
} from "@/domain/terms";

const today = "2026-11-16";

function terms(overrides: Partial<TermsSnapshot> = {}): TermsSnapshot {
  return {
    v: 1,
    concept: "Préstamo",
    currency: "MXN",
    principalMinor: "300000",
    originDate: "2026-10-01",
    dueDate: "2027-01-01",
    balanceAsOf: null,
    scheduleType: "CUSTOM",
    installments: [
      { sequence: 1, dueDate: "2026-12-01", amountMinor: "100000" },
      { sequence: 2, dueDate: "2027-01-01", amountMinor: "200000" },
    ],
    plannedMethod: "BANK_TRANSFER",
    sharedNotes: null,
    historicalPayments: [],
    ...overrides,
  };
}

describe("terms of an agreement", () => {
  it("accepts well-formed terms", () => {
    expect(validateTerms(terms(), { today })).toEqual([]);
  });

  it("rejects anything that is not exactly the expected shape", () => {
    expect(validateTerms({ ...terms(), extra: true }, { today })).toEqual(["malformed"]);
    expect(validateTerms({ ...terms(), principalMinor: 300000 }, { today })).toEqual(["malformed"]);
    expect(validateTerms({ ...terms(), principalMinor: "3000.00" }, { today })).toEqual(["malformed"]);
    expect(validateTerms({ ...terms(), principalMinor: "0" }, { today })).toEqual(["malformed"]);
    expect(validateTerms({ ...terms(), currency: "XXX1" }, { today })).toEqual(["malformed"]);
    expect(validateTerms(null, { today })).toEqual(["malformed"]);
  });

  it("requires the schedule to add up to the amount and to end on the due date", () => {
    const short = terms({ installments: [{ sequence: 1, dueDate: "2027-01-01", amountMinor: "100000" }] });
    expect(validateTerms(short, { today }).some((error) => error.startsWith("schedule_"))).toBe(true);
    expect(validateTerms(terms({ dueDate: "2027-02-01" }), { today })).toContain("due_date_mismatch");
  });

  it("keeps dates coherent", () => {
    expect(validateTerms(terms({ originDate: "2026-11-18" }), { today })).toContain("origin_in_future");
    // One day of tolerance for time zones.
    expect(validateTerms(terms({ originDate: "2026-11-17" }), { today })).not.toContain("origin_in_future");
    expect(validateTerms(terms({ originDate: "2026-12-15" }), { today })).toContain("installment_before_origin");
  });

  it("recognised payments must leave something to agree on", () => {
    const paid = (amountMinor: string, effectiveDate = "2026-10-10") =>
      terms({ historicalPayments: [{ effectiveDate, amountMinor, method: null, note: null }] });
    expect(validateTerms(paid("100000"), { today })).not.toContain("historical_exceeds_principal");
    expect(openingBalanceMinor(paid("100000"))).toBe(200000n);
    expect(validateTerms(paid("300000"), { today })).toContain("historical_exceeds_principal");
    expect(validateTerms(paid("1000", "2026-09-30"), { today })).toContain("historical_before_origin");
    expect(validateTerms(paid("1000", "2026-12-01"), { today })).toContain("historical_in_future");
  });

  it("serialises the same meaning to the same text, whatever the order", () => {
    const a = terms({
      concept: "  Préstamo ",
      sharedNotes: "   ",
      historicalPayments: [
        { effectiveDate: "2026-10-20", amountMinor: "500", method: null, note: " " },
        { effectiveDate: "2026-10-10", amountMinor: "700", method: "CASH", note: null },
      ],
    });
    const b = terms({
      installments: [...terms().installments].reverse(),
      historicalPayments: [
        { effectiveDate: "2026-10-10", amountMinor: "700", method: "CASH", note: null },
        { effectiveDate: "2026-10-20", amountMinor: "500", method: null, note: null },
      ],
    });
    expect(canonicalTerms(a)).toBe(canonicalTerms(b));
    expect(canonicalTerms(a)).not.toBe(canonicalTerms(terms({ ...b, principalMinor: "300001" })));
    expect(canonicalJSON({ b: 1, a: [{ d: null, c: "x" }], skip: undefined })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
  });

  it("reports what changed between two versions", () => {
    expect(diffTerms(terms(), terms())).toEqual([]);
    expect(diffTerms(terms(), terms({ concept: "Otro", sharedNotes: "nota" }))).toEqual(["concept", "sharedNotes"]);
    expect(diffTerms(terms(), terms({ dueDate: "2027-02-01" }))).toEqual(["schedule"]);
  });

  it("an active agreement cannot have its amount, origin or recognised payments rewritten", () => {
    expect(amendmentViolations(terms(), terms({ concept: "Otro", plannedMethod: "CASH" }))).toEqual([]);
    expect(amendmentViolations(terms(), terms({ principalMinor: "250000" }))).toEqual(["principal"]);
    expect(amendmentViolations(terms(), terms({ originDate: "2026-09-01" }))).toEqual(["originDate"]);
    expect(
      amendmentViolations(terms(), terms({ historicalPayments: [{ effectiveDate: "2026-10-10", amountMinor: "1", method: null, note: null }] })),
    ).toEqual(["historicalPayments"]);
  });
});

describe("life cycle", () => {
  it("each mode has its own states", () => {
    const personal = DEBT_STATUSES.filter((status) => isStatusValidForMode("PERSONAL", status));
    const shared = DEBT_STATUSES.filter((status) => isStatusValidForMode("SHARED", status));
    expect(personal).toEqual(["ACTIVE", "SETTLED", "CANCELLED", "CONVERTED"]);
    expect(shared).toEqual(["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "ACTIVE", "DISPUTED", "SETTLED", "CANCELLED"]);
  });

  it("no payment can be recorded before both sides agree", () => {
    for (const status of ["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "CANCELLED"] as const) {
      expect(canRecordMovement("SHARED", status, "PAYMENT")).toBe(false);
    }
    expect(canRecordMovement("SHARED", "ACTIVE", "PAYMENT")).toBe(true);
    expect(canRecordMovement("SHARED", "DISPUTED", "PAYMENT")).toBe(true);
    expect(canRecordMovement("SHARED", "SETTLED", "PAYMENT")).toBe(false);
    expect(canRecordMovement("SHARED", "SETTLED", "REVERSAL")).toBe(true);
    expect(canRecordMovement("PERSONAL", "ACTIVE", "REVERSAL")).toBe(false);
    expect(canRecordMovement("PERSONAL", "CONVERTED", "PAYMENT")).toBe(false);
  });

  it("settles and reopens with the balance, but a dispute stays a dispute", () => {
    expect(statusAfterBalanceChange("ACTIVE", 0n)).toBe("SETTLED");
    expect(statusAfterBalanceChange("ACTIVE", 1n)).toBe("ACTIVE");
    expect(statusAfterBalanceChange("SETTLED", 1n)).toBe("ACTIVE");
    expect(statusAfterBalanceChange("DISPUTED", 0n)).toBe("DISPUTED");
    expect(statusAfterBalanceChange("CANCELLED", 0n)).toBe("CANCELLED");
  });

  it("whoever recorded a movement is never the one who confirms it", () => {
    for (const role of ["DEBTOR", "CREDITOR"] as const) {
      expect(allowedMovementActions("PENDING", role, role)).toEqual(["withdraw"]);
      expect(allowedMovementActions("CLARIFICATION", role, role)).toEqual(["clarify", "withdraw"]);
      expect(allowedMovementActions("PENDING", otherRole(role), role)).toEqual(["approve", "reject", "ask"]);
      for (const status of ["CONFIRMED", "REJECTED", "WITHDRAWN", "PERSONAL_RECORD"] as const) {
        expect(allowedMovementActions(status, role, role)).toEqual([]);
        expect(allowedMovementActions(status, otherRole(role), role)).toEqual([]);
      }
    }
    expect(allowedMovementActions("PENDING", "DEBTOR", null)).toEqual([]);
    expect(movementStatusAfter("approve")).toBe("CONFIRMED");
    expect(movementStatusAfter("clarify")).toBe("PENDING");
  });

  it("nobody accepts their own proposal", () => {
    expect(allowedVersionActions("PROPOSED", "CREDITOR", "CREDITOR")).toEqual(["withdraw"]);
    expect(allowedVersionActions("PROPOSED", "DEBTOR", "CREDITOR")).toEqual(["accept", "reject", "request_changes"]);
    expect(allowedVersionActions("ACCEPTED", "DEBTOR", "CREDITOR")).toEqual([]);
  });
});
