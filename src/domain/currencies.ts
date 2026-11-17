/**
 * Currencies the app can keep track of.
 *
 * `exponent` is the number of decimal places of the minor unit (ISO 4217), which is what every
 * amount is stored in: 2 → cents, 0 → the unit itself.
 */
export const CURRENCIES = {
  MXN: { exponent: 2 },
  USD: { exponent: 2 },
  EUR: { exponent: 2 },
  GBP: { exponent: 2 },
  CAD: { exponent: 2 },
  COP: { exponent: 2 },
  ARS: { exponent: 2 },
  PEN: { exponent: 2 },
  BRL: { exponent: 2 },
  GTQ: { exponent: 2 },
  CLP: { exponent: 0 },
  JPY: { exponent: 0 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = "MXN";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function currencyExponent(currency: string): number {
  return isCurrencyCode(currency) ? CURRENCIES[currency].exponent : 2;
}
