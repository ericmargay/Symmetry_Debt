/**
 * Money, without floats.
 *
 * Every amount in the app is a `bigint` counting minor units (cents). Text typed by a person is
 * parsed with string arithmetic only, and amounts are formatted by handing `Intl.NumberFormat`
 * an exact decimal string. `Number`, `parseFloat` and friends never touch an amount.
 */
import { currencyExponent } from "./currencies";

/** Largest amount accepted for a single debt or movement: 999,999,999,999.99 in a 2-decimal currency. */
export const MAX_AMOUNT_MINOR = 99_999_999_999_999n;

export type AmountError = "empty" | "invalid" | "too_many_decimals" | "not_positive" | "too_large";

export type ParseAmountResult =
  | { ok: true; minor: bigint }
  | { ok: false; error: AmountError };

/**
 * Parses what a person typed into minor units.
 *
 * Accepted: digits with an optional decimal part ("1500", "1500.5", "1500.50"), thousands
 * separators ("1,500.50", "1 500.50", "1.500,50") and a decimal comma ("1500,5").
 *
 * A single separator followed by exactly three digits is read as a thousands separator when it
 * is a comma ("1,500" → 1500) — that is how amounts are written in Mexico and in English — and
 * rejected when it is a dot in a currency with cents ("1.500"), because guessing could silently
 * turn one thousand five hundred into one and a half, or the other way around.
 */
export function parseAmount(input: string, currency: string): ParseAmountResult {
  const exponent = currencyExponent(currency);
  // A currency symbol or code may wrap the number ("$1,500", "MX$ 1,500", "1500 MXN").
  // Letters anywhere else make the input invalid — "1e5" must never be read as 15.
  const raw = input
    .trim()
    .replace(/^(?:[A-Za-z]{2,3}\s*)?[$€£¥]?\s*/, "")
    .replace(/\s*(?:[$€£¥]|[A-Za-z]{3})$/, "")
    .replace(/[\s\u00A0\u202F]/g, "");

  // Nothing typed is "empty"; a lone symbol or word with no number in it is "invalid".
  if (raw === "") return { ok: false, error: input.trim() === "" ? "empty" : "invalid" };
  if (raw.startsWith("-") || raw.startsWith("+")) return { ok: false, error: "not_positive" };
  if (!/^[0-9.,]+$/.test(raw) || !/[0-9]/.test(raw)) return { ok: false, error: "invalid" };

  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let integerPart: string;
  let fractionPart = "";

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the last one is the decimal separator, the other one groups thousands.
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimalChar = raw[decimalIndex];
    const groupChar = decimalChar === "." ? "," : ".";
    const head = raw.slice(0, decimalIndex);
    fractionPart = raw.slice(decimalIndex + 1);
    if (fractionPart.includes(groupChar) || fractionPart.includes(decimalChar)) {
      return { ok: false, error: "invalid" };
    }
    if (!isGrouped(head, groupChar)) return { ok: false, error: "invalid" };
    integerPart = head.split(groupChar).join("");
  } else if (lastComma !== -1) {
    const pieces = raw.split(",");
    if (isGrouped(raw, ",")) {
      // "1,500" or "1,500,000" → thousands separators.
      integerPart = pieces.join("");
    } else if (pieces.length === 2) {
      // "1500,5" → decimal comma.
      integerPart = pieces[0];
      fractionPart = pieces[1];
    } else {
      return { ok: false, error: "invalid" };
    }
  } else if (lastDot !== -1) {
    const pieces = raw.split(".");
    if (pieces.length === 2 && !(exponent === 0 && isGrouped(raw, "."))) {
      integerPart = pieces[0];
      fractionPart = pieces[1];
    } else if (isGrouped(raw, ".")) {
      // "1.500.000" can only be thousands separators; so can "1.500" in a currency without cents.
      integerPart = pieces.join("");
    } else {
      return { ok: false, error: "invalid" };
    }
  } else {
    integerPart = raw;
  }

  if (integerPart === "" && fractionPart === "") return { ok: false, error: "invalid" };
  if (integerPart === "") integerPart = "0";
  if (!/^[0-9]+$/.test(integerPart) || (fractionPart !== "" && !/^[0-9]+$/.test(fractionPart))) {
    return { ok: false, error: "invalid" };
  }

  // More decimals than the currency has is an error, even when they are zeros: "1.500" may have
  // been meant as one thousand five hundred. The only exception is ".00" on a currency without
  // cents ("1500.00" yen), which cannot be misread.
  if (fractionPart.length > exponent) {
    if (exponent !== 0 || !/^0+$/.test(fractionPart)) return { ok: false, error: "too_many_decimals" };
    fractionPart = "";
  }

  const minor = BigInt(integerPart) * 10n ** BigInt(exponent) + BigInt(fractionPart.padEnd(exponent, "0") || "0");

  if (minor <= 0n) return { ok: false, error: "not_positive" };
  if (minor > MAX_AMOUNT_MINOR) return { ok: false, error: "too_large" };
  return { ok: true, minor };
}

/** "1,500" / "12,345,678": groups of exactly three digits after a 1–3 digit head. */
function isGrouped(value: string, separator: string): boolean {
  const pieces = value.split(separator);
  if (pieces.length < 2) return false;
  if (!/^[0-9]{1,3}$/.test(pieces[0])) return false;
  return pieces.slice(1).every((piece) => /^[0-9]{3}$/.test(piece));
}

/** Exact decimal representation, e.g. 150050n → "1500.50". Handles negative values. */
export function toDecimalString(minor: bigint, currency: string): string {
  const exponent = currencyExponent(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString();
  if (exponent === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(exponent + 1, "0");
  const whole = padded.slice(0, padded.length - exponent);
  const fraction = padded.slice(padded.length - exponent);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Value for an <input>: no grouping, dot as the decimal separator. */
export function toInputValue(minor: bigint, currency: string): string {
  return toDecimalString(minor, currency);
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Localised amount with its currency, e.g. "$1,500.50", "US$1,500.50", "€1,500.50".
 * The decimal string keeps the value exact no matter how large it is.
 */
export function formatMoney(minor: bigint, currency: string, intlLocale: string): string {
  const exponent = currencyExponent(currency);
  const key = `${intlLocale}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    formatters.set(key, formatter);
  }
  // Intl accepts exact decimal strings; the DOM typings have not caught up yet.
  return formatter.format(toDecimalString(minor, currency) as unknown as number);
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Splits `total` into `parts` instalments. All are equal except the last one, which absorbs the
 * cents that do not divide evenly (1000.00 / 3 → 333.33, 333.33, 333.34).
 */
export function splitEvenly(total: bigint, parts: number): bigint[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("parts must be a positive integer");
  if (total <= 0n) throw new RangeError("total must be positive");
  const count = BigInt(parts);
  const base = total / count;
  if (base === 0n) throw new RangeError("total is too small to be split into that many parts");
  const result = Array.from({ length: parts }, () => base);
  result[parts - 1] = total - base * (count - 1n);
  return result;
}

/** Whole-number percentage (0–100) of `part` over `whole`, rounded down. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  if (part <= 0n) return 0;
  if (part >= whole) return 100;
  return Number((part * 100n) / whole);
}

/** Serialises an amount for JSON (server → client, terms snapshots). */
export function minorToString(minor: bigint): string {
  return minor.toString();
}

/** Reads an amount serialised with `minorToString`. Throws on anything that is not an integer. */
export function minorFromString(value: string): bigint {
  if (!/^-?[0-9]+$/.test(value)) throw new TypeError(`Not a minor-unit amount: ${value}`);
  return BigInt(value);
}
