import { describe, expect, it } from "vitest";
import {
  checkConfirmation,
  checkNewMovement,
  computeBalance,
  countsTowardBalance,
  type MovementLike,
} from "@/domain/balance";
import {
  allocatePayments,
  finalDueDate,
  generateSchedule,
  installmentLedger,
  normalizeSchedule,
  validateSchedule,
  type InstallmentInput,
} from "@/domain/schedule";

const inst = (sequence: number, dueDate: string, amountMinor: bigint): InstallmentInput => ({
  sequence,
  dueDate,
  amountMinor,
});

describe("generateSchedule", () => {
  it("creates a single due date", () => {
    expect(generateSchedule({ type: "SINGLE", totalMinor: 500000n, firstDueDate: "2026-12-01" })).toEqual([
      inst(1, "2026-12-01", 500000n),
    ]);
  });

  it("creates monthly instalments anchored on the first date", () => {
    const schedule = generateSchedule({
      type: "MONTHLY",
      totalMinor: 100000n,
      firstDueDate: "2026-01-31",
      count: 3,
    });
    expect(schedule).toEqual([
      inst(1, "2026-01-31", 33333n),
      inst(2, "2026-02-28", 33333n),
      inst(3, "2026-03-31", 33334n),
    ]);
  });

  it("creates weekly instalments", () => {
    const schedule = generateSchedule({ type: "WEEKLY", totalMinor: 40000n, firstDueDate: "2026-12-25", count: 4 });
    expect(schedule.map((i) => i.dueDate)).toEqual(["2026-12-25", "2027-01-01", "2027-01-08", "2027-01-15"]);
    expect(schedule.every((i) => i.amountMinor === 10000n)).toBe(true);
  });

  it("refuses silly inputs", () => {
    expect(() => generateSchedule({ type: "MONTHLY", totalMinor: 100n, firstDueDate: "2026-01-01", count: 0 })).toThrow();
    expect(() => generateSchedule({ type: "MONTHLY", totalMinor: 100n, firstDueDate: "2026-01-01", count: 121 })).toThrow();
    expect(() => generateSchedule({ type: "MONTHLY", totalMinor: 0n, firstDueDate: "2026-01-01", count: 2 })).toThrow();
    expect(() => generateSchedule({ type: "SINGLE", totalMinor: 100n, firstDueDate: "nope" })).toThrow();
  });
});

describe("validateSchedule", () => {
  it("accepts a schedule that covers the total", () => {
    const schedule = [inst(1, "2026-01-01", 600n), inst(2, "2026-02-01", 400n)];
    expect(validateSchedule("CUSTOM", schedule, 1000n)).toEqual([]);
  });

  it("requires the instalments to add up", () => {
    const schedule = [inst(1, "2026-01-01", 600n), inst(2, "2026-02-01", 300n)];
    expect(validateSchedule("CUSTOM", schedule, 1000n)).toEqual(["sum_mismatch"]);
  });

  it("requires order, positive amounts and real dates", () => {
    expect(validateSchedule("CUSTOM", [inst(1, "2026-02-01", 500n), inst(2, "2026-01-01", 500n)], 1000n)).toContain(
      "dates_not_ascending",
    );
    expect(validateSchedule("CUSTOM", [inst(1, "2026-02-01", 0n), inst(2, "2026-03-01", 1000n)], 1000n)).toContain(
      "amount_not_positive",
    );
    expect(validateSchedule("CUSTOM", [inst(1, "2026-02-31", 1000n)], 1000n)).toContain("invalid_date");
  });

  it("knows what each type allows", () => {
    expect(validateSchedule("NONE", [], 1000n)).toEqual([]);
    expect(validateSchedule("NONE", [inst(1, "2026-01-01", 1000n)], 1000n)).toEqual(["none_must_be_empty"]);
    expect(validateSchedule("SINGLE", [], 1000n)).toEqual(expect.arrayContaining(["empty", "single_needs_one"]));
    expect(
      validateSchedule("SINGLE", [inst(1, "2026-01-01", 500n), inst(2, "2026-02-01", 500n)], 1000n),
    ).toEqual(["single_needs_one"]);
  });
});

describe("allocatePayments", () => {
  const schedule = [inst(1, "2026-01-10", 1000n), inst(2, "2026-02-10", 1000n), inst(3, "2026-03-10", 1000n)];

  it("shows everything upcoming when nothing was paid", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 0n, today: "2026-01-01" });
    expect(progress.rows.map((r) => r.state)).toEqual(["UPCOMING", "UPCOMING", "UPCOMING"]);
    expect(progress.next?.sequence).toBe(1);
    expect(progress.overdueMinor).toBe(0n);
  });

  it("fills instalments in order, including a partial one", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 1400n, today: "2026-01-01" });
    expect(progress.rows.map((r) => [r.paidMinor, r.remainingMinor, r.state])).toEqual([
      [1000n, 0n, "PAID"],
      [400n, 600n, "PARTIAL"],
      [0n, 1000n, "UPCOMING"],
    ]);
    expect(progress.next?.sequence).toBe(2);
  });

  it("treats early payments as covering future instalments", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 2000n, today: "2026-01-05" });
    expect(progress.rows.map((r) => r.state)).toEqual(["PAID", "PAID", "UPCOMING"]);
    expect(progress.overdueCount).toBe(0);
  });

  it("flags what is overdue and what is due today", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 300n, today: "2026-02-10" });
    expect(progress.rows.map((r) => r.state)).toEqual(["OVERDUE", "DUE_TODAY", "UPCOMING"]);
    expect(progress.overdueMinor).toBe(700n);
    expect(progress.overdueCount).toBe(1);
  });

  it("marks everything paid when the debt is settled", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 3000n, today: "2027-01-01" });
    expect(progress.rows.every((r) => r.state === "PAID")).toBe(true);
    expect(progress.next).toBeNull();
    expect(progress.overpaidMinor).toBe(0n);
  });

  it("takes a reduction of the debt off the last instalments", () => {
    // 3 × 1,000 scheduled, but 1,500 were forgiven: only 1,500 are owed.
    const progress = allocatePayments(schedule, { totalOwedMinor: 1500n, paidMinor: 1000n, today: "2026-01-15" });
    expect(progress.rows.map((r) => [r.scheduledMinor, r.remainingMinor, r.state])).toEqual([
      [1000n, 0n, "PAID"],
      [500n, 500n, "UPCOMING"],
      [0n, 0n, "WAIVED"],
    ]);
    expect(progress.unscheduledMinor).toBe(0n);
  });

  it("shows an increase as unscheduled until the plan is rewritten", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3500n, paidMinor: 3200n, today: "2026-01-15" });
    expect(progress.rows.every((r) => r.state === "PAID")).toBe(true);
    expect(progress.unscheduledMinor).toBe(500n);
    expect(progress.unscheduledPaidMinor).toBe(200n);
    expect(progress.overpaidMinor).toBe(0n);
  });

  it("reports an overpayment instead of hiding it", () => {
    const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: 3100n, today: "2026-01-15" });
    expect(progress.overpaidMinor).toBe(100n);
  });

  it("never invents or loses a cent", () => {
    for (const paid of [0n, 1n, 999n, 1000n, 1001n, 2500n, 3000n]) {
      const progress = allocatePayments(schedule, { totalOwedMinor: 3000n, paidMinor: paid, today: "2026-02-01" });
      const allocated = progress.rows.reduce((sum, r) => sum + r.paidMinor, 0n) + progress.unscheduledPaidMinor;
      const remaining = progress.rows.reduce((sum, r) => sum + r.remainingMinor, 0n);
      expect(allocated + progress.overpaidMinor).toBe(paid);
      expect(allocated + remaining).toBe(3000n);
    }
  });

  it("orders instalments by due date whatever order they arrive in", () => {
    const shuffled = [schedule[2], schedule[0], schedule[1]];
    expect(normalizeSchedule(shuffled).map((i) => i.dueDate)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(finalDueDate(shuffled)).toBe("2026-03-10");
    expect(finalDueDate([])).toBeNull();
  });
});

describe("computeBalance", () => {
  const m = (kind: MovementLike["kind"], status: MovementLike["status"], amountMinor: bigint): MovementLike => ({
    kind,
    status,
    amountMinor,
  });

  it("counts the owner's records in personal mode", () => {
    const balance = computeBalance("PERSONAL", 10000n, [
      m("PAYMENT", "PERSONAL_RECORD", 2500n),
      m("PAYMENT", "PERSONAL_RECORD", 1500n),
    ]);
    expect(balance.level).toBe("RECORDED");
    expect(balance.paidMinor).toBe(4000n);
    expect(balance.outstandingMinor).toBe(6000n);
    expect(balance.pendingCount).toBe(0);
  });

  it("counts only what both sides confirmed in shared mode", () => {
    const balance = computeBalance("SHARED", 10000n, [
      m("PAYMENT", "CONFIRMED", 2000n),
      m("PAYMENT", "PENDING", 3000n),
      m("PAYMENT", "CLARIFICATION", 500n),
      m("PAYMENT", "REJECTED", 4000n),
      m("PAYMENT", "WITHDRAWN", 1000n),
    ]);
    expect(balance.level).toBe("CONFIRMED");
    expect(balance.paidMinor).toBe(2000n);
    expect(balance.outstandingMinor).toBe(8000n);
    expect(balance.pendingPaymentsMinor).toBe(3500n);
    expect(balance.pendingCount).toBe(2);
    expect(balance.projectedOutstandingMinor).toBe(4500n);
  });

  it("never lets a personal record count as confirmed, nor the other way around", () => {
    expect(countsTowardBalance("SHARED", "PERSONAL_RECORD")).toBe(false);
    expect(countsTowardBalance("PERSONAL", "CONFIRMED")).toBe(false);
    expect(computeBalance("SHARED", 10000n, [m("PAYMENT", "PERSONAL_RECORD", 9000n)]).paidMinor).toBe(0n);
    expect(computeBalance("PERSONAL", 10000n, [m("PAYMENT", "CONFIRMED", 9000n)]).paidMinor).toBe(0n);
  });

  it("applies adjustments and reversals", () => {
    const balance = computeBalance("SHARED", 10000n, [
      m("PAYMENT", "CONFIRMED", 4000n),
      m("REVERSAL", "CONFIRMED", 4000n),
      m("PAYMENT", "CONFIRMED", 1000n),
      m("ADJUSTMENT_INCREASE", "CONFIRMED", 500n),
      m("ADJUSTMENT_DECREASE", "CONFIRMED", 2000n),
      m("ADJUSTMENT_DECREASE", "PENDING", 700n),
    ]);
    expect(balance.totalOwedMinor).toBe(8500n);
    expect(balance.paidMinor).toBe(1000n);
    expect(balance.outstandingMinor).toBe(7500n);
    expect(balance.pendingDecreasesMinor).toBe(700n);
    expect(balance.projectedOutstandingMinor).toBe(6800n);
  });
});

describe("movement rules", () => {
  const balanceOf = (movements: MovementLike[]) => computeBalance("SHARED", 10000n, movements);

  it("does not allow paying more than what is owed", () => {
    const balance = balanceOf([{ kind: "PAYMENT", status: "CONFIRMED", amountMinor: 9000n }]);
    expect(checkNewMovement("SHARED", balance, { kind: "PAYMENT", amountMinor: 1000n })).toBeNull();
    expect(checkNewMovement("SHARED", balance, { kind: "PAYMENT", amountMinor: 1001n })).toBe("exceeds_balance");
  });

  it("counts payments that are still waiting, so two of them cannot overshoot", () => {
    const balance = balanceOf([{ kind: "PAYMENT", status: "PENDING", amountMinor: 8000n }]);
    expect(checkNewMovement("SHARED", balance, { kind: "PAYMENT", amountMinor: 2000n })).toBeNull();
    expect(checkNewMovement("SHARED", balance, { kind: "PAYMENT", amountMinor: 2001n })).toBe("exceeds_balance");
  });

  it("has nothing to pay once settled", () => {
    const balance = balanceOf([{ kind: "PAYMENT", status: "CONFIRMED", amountMinor: 10000n }]);
    expect(checkNewMovement("SHARED", balance, { kind: "PAYMENT", amountMinor: 1n })).toBe("nothing_to_pay");
    expect(checkNewMovement("SHARED", balance, { kind: "ADJUSTMENT_DECREASE", amountMinor: 1n })).toBe("nothing_to_pay");
    expect(checkNewMovement("SHARED", balance, { kind: "ADJUSTMENT_INCREASE", amountMinor: 1n })).toBeNull();
  });

  it("only reverses a counted payment, in full, once", () => {
    const balance = balanceOf([{ kind: "PAYMENT", status: "CONFIRMED", amountMinor: 3000n }]);
    const target = { kind: "PAYMENT" as const, status: "CONFIRMED" as const, amountMinor: 3000n, hasOpenReversal: false };
    expect(checkNewMovement("SHARED", balance, { kind: "REVERSAL", amountMinor: 3000n }, target)).toBeNull();
    expect(checkNewMovement("SHARED", balance, { kind: "REVERSAL", amountMinor: 2000n }, target)).toBe(
      "reversal_amount_mismatch",
    );
    expect(
      checkNewMovement("SHARED", balance, { kind: "REVERSAL", amountMinor: 3000n }, { ...target, hasOpenReversal: true }),
    ).toBe("reversal_already_exists");
    expect(
      checkNewMovement("SHARED", balance, { kind: "REVERSAL", amountMinor: 3000n }, { ...target, status: "PENDING" }),
    ).toBe("reversal_target_invalid");
    expect(
      checkNewMovement(
        "SHARED",
        balance,
        { kind: "REVERSAL", amountMinor: 3000n },
        { ...target, kind: "ADJUSTMENT_INCREASE" },
      ),
    ).toBe("reversal_target_invalid");
    expect(checkNewMovement("SHARED", balance, { kind: "REVERSAL", amountMinor: 3000n }, null)).toBe(
      "reversal_target_invalid",
    );
  });

  it("re-checks at confirmation time", () => {
    const balance = balanceOf([{ kind: "PAYMENT", status: "CONFIRMED", amountMinor: 9500n }]);
    expect(checkConfirmation(balance, { kind: "PAYMENT", amountMinor: 500n })).toBeNull();
    expect(checkConfirmation(balance, { kind: "PAYMENT", amountMinor: 501n })).toBe("exceeds_balance");
    expect(checkConfirmation(balance, { kind: "ADJUSTMENT_INCREASE", amountMinor: 99999n })).toBeNull();
  });
});

describe("installmentLedger", () => {
  const schedule = [
    { sequence: 1, dueDate: "2026-10-16", amountMinor: 293300n },
    { sequence: 2, dueDate: "2026-11-16", amountMinor: 293300n },
    { sequence: 3, dueDate: "2026-12-16", amountMinor: 293300n },
  ];
  const progress = (paidMinor: bigint) => allocatePayments(schedule, { totalOwedMinor: 879900n, paidMinor, today: "2026-11-20" });

  it("without pending payments, open is what remains and adds up instalment by instalment", () => {
    const rows = installmentLedger(progress(100000n), []);
    expect(rows.map((row) => [row.paidMinor, row.pendingMinor, row.openMinor, row.cumulativeOpenMinor])).toEqual([
      [100000n, 0n, 193300n, 193300n],
      [0n, 0n, 293300n, 486600n],
      [0n, 0n, 293300n, 779900n],
    ]);
  });

  it("a pending payment fills the oldest room first, after what is already validated", () => {
    const rows = installmentLedger(progress(293300n), [{ id: "p1", amountMinor: 293300n }]);
    expect(rows[0]).toMatchObject({ state: "PAID", pendingMinor: 0n, openMinor: 0n });
    expect(rows[1]).toMatchObject({ pending: [{ paymentId: "p1", amountMinor: 293300n }], pendingMinor: 293300n, openMinor: 0n });
    expect(rows[2]).toMatchObject({ pendingMinor: 0n, openMinor: 293300n, cumulativeOpenMinor: 293300n });
  });

  it("a partial payment leaves the rest open; one payment can span two instalments; several can share one", () => {
    const partial = installmentLedger(progress(0n), [{ id: "p1", amountMinor: 100000n }]);
    expect(partial[0]).toMatchObject({ pendingMinor: 100000n, openMinor: 193300n });

    const spanning = installmentLedger(progress(0n), [{ id: "p1", amountMinor: 400000n }]);
    expect(spanning[0].pending).toEqual([{ paymentId: "p1", amountMinor: 293300n }]);
    expect(spanning[1].pending).toEqual([{ paymentId: "p1", amountMinor: 106700n }]);

    const shared = installmentLedger(progress(0n), [
      { id: "a", amountMinor: 100000n },
      { id: "b", amountMinor: 193300n },
      { id: "c", amountMinor: 50000n },
    ]);
    expect(shared[0].pending.map((part) => part.paymentId)).toEqual(["a", "b"]);
    expect(shared[1].pending).toEqual([{ paymentId: "c", amountMinor: 50000n }]);
  });

  it("pending beyond the schedule is not invented onto any instalment", () => {
    const rows = installmentLedger(progress(0n), [{ id: "p1", amountMinor: 999999999n }]);
    expect(rows.every((row) => row.openMinor === 0n)).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.pendingMinor, 0n)).toBe(879900n);
  });
});
