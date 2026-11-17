import { describe, expect, it } from "vitest";
import {
  formatMoney,
  MAX_AMOUNT_MINOR,
  minorFromString,
  parseAmount,
  percentOf,
  splitEvenly,
  toDecimalString,
} from "@/domain/money";

const ok = (minor: bigint) => ({ ok: true, minor });
const fail = (error: string) => ({ ok: false, error });

describe("parseAmount", () => {
  it("reads plain amounts", () => {
    expect(parseAmount("1500", "MXN")).toEqual(ok(150000n));
    expect(parseAmount("1500.5", "MXN")).toEqual(ok(150050n));
    expect(parseAmount("1500.50", "MXN")).toEqual(ok(150050n));
    expect(parseAmount("0.01", "MXN")).toEqual(ok(1n));
    expect(parseAmount(".5", "MXN")).toEqual(ok(50n));
    expect(parseAmount("5.", "MXN")).toEqual(ok(500n));
  });

  it("ignores currency symbols and spaces", () => {
    expect(parseAmount(" $ 1,500.50 ", "MXN")).toEqual(ok(150050n));
    expect(parseAmount("1 500.50", "MXN")).toEqual(ok(150050n));
    expect(parseAmount("€20", "EUR")).toEqual(ok(2000n));
    expect(parseAmount("1500 MXN", "MXN")).toEqual(ok(150000n));
    expect(parseAmount("MX$ 1,500", "MXN")).toEqual(ok(150000n));
    expect(parseAmount("US$20.10", "USD")).toEqual(ok(2010n));
  });

  it("understands thousands separators", () => {
    expect(parseAmount("1,500", "MXN")).toEqual(ok(150000n));
    expect(parseAmount("1,500,000", "MXN")).toEqual(ok(150000000n));
    expect(parseAmount("1,234,567.89", "MXN")).toEqual(ok(123456789n));
    expect(parseAmount("1.234.567,89", "EUR")).toEqual(ok(123456789n));
    expect(parseAmount("1.500.000", "MXN")).toEqual(ok(150000000n));
  });

  it("understands a decimal comma", () => {
    expect(parseAmount("1500,5", "EUR")).toEqual(ok(150050n));
    expect(parseAmount("12,34", "EUR")).toEqual(ok(1234n));
  });

  it("refuses to guess when a dot could be either separator", () => {
    expect(parseAmount("1.500", "MXN")).toEqual(fail("too_many_decimals"));
    expect(parseAmount("10.500", "MXN")).toEqual(fail("too_many_decimals"));
    expect(parseAmount("1.234", "USD")).toEqual(fail("too_many_decimals"));
  });

  it("rejects more decimals than the currency has", () => {
    expect(parseAmount("10.555", "MXN")).toEqual(fail("too_many_decimals"));
    expect(parseAmount("10.5", "JPY")).toEqual(fail("too_many_decimals"));
    expect(parseAmount("1,5", "JPY")).toEqual(fail("too_many_decimals"));
  });

  it("handles currencies without cents", () => {
    expect(parseAmount("1500", "JPY")).toEqual(ok(1500n));
    expect(parseAmount("1,500", "JPY")).toEqual(ok(1500n));
    expect(parseAmount("1.500", "CLP")).toEqual(ok(1500n));
    expect(parseAmount("1500.00", "JPY")).toEqual(ok(1500n));
  });

  it("rejects garbage", () => {
    expect(parseAmount("", "MXN")).toEqual(fail("empty"));
    expect(parseAmount("   ", "MXN")).toEqual(fail("empty"));
    expect(parseAmount("abc", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("1e5", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("12abc34", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("0x10", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("$", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount(".", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("1,23.45", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("12,34,56", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("1.2.3", "MXN")).toEqual(fail("invalid"));
    expect(parseAmount("1..2", "MXN")).toEqual(fail("invalid"));
  });

  it("rejects zero, negatives and absurd amounts", () => {
    expect(parseAmount("0", "MXN")).toEqual(fail("not_positive"));
    expect(parseAmount("0.00", "MXN")).toEqual(fail("not_positive"));
    expect(parseAmount("-5", "MXN")).toEqual(fail("not_positive"));
    expect(parseAmount("999999999999.99", "MXN")).toEqual(ok(MAX_AMOUNT_MINOR));
    expect(parseAmount("1000000000000.00", "MXN")).toEqual(fail("too_large"));
  });

  it("never loses precision on amounts a float cannot represent", () => {
    // 0.1 + 0.2 !== 0.3 with floats; with minor units it is simply 10 + 20 = 30.
    const a = parseAmount("0.10", "MXN");
    const b = parseAmount("0.20", "MXN");
    expect(a.ok && b.ok && a.minor + b.minor).toBe(30n);
    expect(parseAmount("90071992547.41", "MXN")).toEqual(ok(9007199254741n));
  });
});

describe("toDecimalString", () => {
  it("writes exact decimals", () => {
    expect(toDecimalString(150050n, "MXN")).toBe("1500.50");
    expect(toDecimalString(5n, "MXN")).toBe("0.05");
    expect(toDecimalString(0n, "MXN")).toBe("0.00");
    expect(toDecimalString(-150050n, "MXN")).toBe("-1500.50");
    expect(toDecimalString(1500n, "JPY")).toBe("1500");
  });
});

describe("formatMoney", () => {
  it("formats for Mexico and for the US", () => {
    expect(formatMoney(150050n, "MXN", "es-MX")).toBe("$1,500.50");
    expect(formatMoney(150050n, "MXN", "en-US")).toBe("MX$1,500.50");
    expect(formatMoney(150050n, "USD", "en-US")).toBe("$1,500.50");
    expect(formatMoney(1500n, "JPY", "en-US")).toBe("¥1,500");
  });

  it("stays exact beyond the range of doubles", () => {
    expect(formatMoney(9007199254740993n * 100n + 7n, "USD", "en-US")).toBe("$9,007,199,254,740,993.07");
  });
});

describe("splitEvenly", () => {
  it("puts the remainder on the last instalment", () => {
    expect(splitEvenly(100000n, 3)).toEqual([33333n, 33333n, 33334n]);
    expect(splitEvenly(100000n, 4)).toEqual([25000n, 25000n, 25000n, 25000n]);
    expect(splitEvenly(10n, 3)).toEqual([3n, 3n, 4n]);
  });

  it("always adds up to the total", () => {
    for (const total of [1n, 7n, 99n, 100000n, 123456789n]) {
      for (const parts of [1, 2, 3, 7, 12]) {
        if (total / BigInt(parts) === 0n) continue;
        const pieces = splitEvenly(total, parts);
        expect(pieces.reduce((a, b) => a + b, 0n)).toBe(total);
        expect(pieces.every((piece) => piece > 0n)).toBe(true);
      }
    }
  });

  it("refuses impossible splits", () => {
    expect(() => splitEvenly(2n, 3)).toThrow(RangeError);
    expect(() => splitEvenly(100n, 0)).toThrow(RangeError);
    expect(() => splitEvenly(0n, 2)).toThrow(RangeError);
  });
});

describe("helpers", () => {
  it("computes whole percentages", () => {
    expect(percentOf(0n, 100n)).toBe(0);
    expect(percentOf(1n, 3n)).toBe(33);
    expect(percentOf(100n, 100n)).toBe(100);
    expect(percentOf(150n, 100n)).toBe(100);
    expect(percentOf(5n, 0n)).toBe(0);
  });

  it("round-trips minor units through strings", () => {
    expect(minorFromString("150050")).toBe(150050n);
    expect(() => minorFromString("15.5")).toThrow(TypeError);
    expect(() => minorFromString("abc")).toThrow(TypeError);
  });
});
