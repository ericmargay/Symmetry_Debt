/**
 * How a debt is meant to be paid (planned) and how each payment was actually made (used).
 * Card payments are a manual record only: the app never processes cards.
 */
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "BANK_DEPOSIT", "CARD", "OTHER"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Methods that involve a destination bank account. */
export function usesBankAccount(method: PaymentMethod | null | undefined): boolean {
  return method === "BANK_TRANSFER" || method === "BANK_DEPOSIT";
}
