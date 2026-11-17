import { describe, expect, it } from "vitest";
import { clabeCheckDigit, formatClabe, maskLast4, normalizeClabe, validateClabe } from "@/domain/clabe";
import {
  addDays,
  addMonths,
  compareISO,
  daysBetween,
  formatISODate,
  fromISODate,
  isISODate,
  isValidTimeZone,
  todayInTimeZone,
  toISODate,
} from "@/domain/dates";

describe("ISO dates", () => {
  it("validates real calendar dates only", () => {
    expect(isISODate("2026-03-05")).toBe(true);
    expect(isISODate("2024-02-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("2026-04-31")).toBe(false);
    expect(isISODate("2026-3-5")).toBe(false);
    expect(isISODate("05/03/2026")).toBe(false);
    expect(isISODate(20260305)).toBe(false);
    expect(isISODate("")).toBe(false);
  });

  it("round-trips through Date without shifting the day", () => {
    expect(toISODate(fromISODate("2026-03-05"))).toBe("2026-03-05");
    expect(fromISODate("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(() => fromISODate("2026-02-30")).toThrow(RangeError);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-05", 7)).toBe("2026-03-12");
  });

  it("adds months keeping the original day when the month allows it", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-10", 12)).toBe("2027-01-10");
  });

  it("compares and measures", () => {
    expect(compareISO("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(compareISO("2026-01-02", "2026-01-02")).toBe(0);
    expect(compareISO("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-03-31", "2026-03-01")).toBe(-30);
  });

  it("knows what day it is in each time zone", () => {
    // 03:30 UTC on March 5th is still March 4th in Mexico City (UTC-6).
    const instant = new Date("2026-03-05T03:30:00.000Z");
    expect(todayInTimeZone("America/Mexico_City", instant)).toBe("2026-03-04");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-03-05");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-03-05");
    expect(todayInTimeZone("Not/AZone", instant)).toBe("2026-03-05");
  });

  it("recognises valid time zones", () => {
    expect(isValidTimeZone("America/Mexico_City")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("formats without drifting to the previous day", () => {
    expect(formatISODate("2026-03-05", "en-US")).toBe("Mar 5, 2026");
    expect(formatISODate("2026-03-05", "es-MX")).toMatch(/5 mar 2026/);
    expect(formatISODate("2026-01-01", "en-US", "long")).toBe("January 1, 2026");
  });
});

describe("CLABE", () => {
  // Published examples of well-formed CLABEs.
  const valid = ["032180000118359719", "002010077777777771"];

  it("accepts valid CLABEs", () => {
    for (const clabe of valid) {
      const result = validateClabe(clabe);
      expect(result.ok, clabe).toBe(true);
    }
  });

  it("computes the check digit with the 3-7-1 weights", () => {
    expect(clabeCheckDigit("03218000011835971")).toBe(9);
    expect(clabeCheckDigit("00201007777777777")).toBe(1);
    expect(clabeCheckDigit("00000000000000000")).toBe(0);
    expect(() => clabeCheckDigit("123")).toThrow(RangeError);
  });

  it("rejects a wrong check digit", () => {
    expect(validateClabe("032180000118359718")).toEqual({ ok: false, error: "checksum" });
    expect(validateClabe("002010077777777770")).toEqual({ ok: false, error: "checksum" });
  });

  it("catches a single mistyped digit anywhere", () => {
    const original = "032180000118359719";
    for (let position = 0; position < 17; position += 1) {
      const wrongDigit = (Number(original[position]) + 1) % 10;
      const mistyped = original.slice(0, position) + wrongDigit + original.slice(position + 1);
      expect(validateClabe(mistyped).ok, `position ${position}`).toBe(false);
    }
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(validateClabe("03218000011835971")).toEqual({ ok: false, error: "length" });
    expect(validateClabe("0321800001183597190")).toEqual({ ok: false, error: "length" });
    expect(validateClabe("")).toEqual({ ok: false, error: "length" });
    expect(validateClabe("03218000011835971X")).toEqual({ ok: false, error: "digits" });
  });

  it("tolerates spaces and dashes", () => {
    expect(normalizeClabe("032 180 00011835971 9")).toBe("032180000118359719");
    expect(validateClabe("032-180-00011835971-9").ok).toBe(true);
  });

  it("suggests the bank from the first three digits", () => {
    const result = validateClabe("002010077777777771");
    expect(result.ok && result.bankCode).toBe("002");
    expect(result.ok && result.bankName).toBe("Citibanamex");
    const unknown = validateClabe("999" + "00000000000000" + clabeCheckDigit("99900000000000000"));
    expect(unknown.ok && unknown.bankName).toBeNull();
  });

  it("formats and masks", () => {
    expect(formatClabe("032180000118359719")).toBe("032 180 00011835971 9");
    expect(maskLast4("9719")).toBe("•••• 9719");
    expect(maskLast4(null)).toBe("••••");
  });
});
