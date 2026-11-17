"use server";

import { runAction } from "@/actions/_run";
import type { BankAccountFormValues } from "@/schemas/bank-account";
import {
  createBankAccount,
  deleteBankAccount,
  revealBankAccount,
  setPreferredBankAccount,
  updateBankAccount,
} from "@/server/services/bank-accounts";

export async function createBankAccountAction(input: BankAccountFormValues) {
  return runAction(async (actor) => ({ id: await createBankAccount(actor, input) }));
}

export async function updateBankAccountAction(accountId: string, input: BankAccountFormValues) {
  return runAction((actor) => updateBankAccount(actor, accountId, input));
}

export async function deleteBankAccountAction(accountId: string) {
  return runAction((actor) => deleteBankAccount(actor, accountId));
}

export async function setPreferredBankAccountAction(accountId: string) {
  return runAction((actor) => setPreferredBankAccount(actor, accountId));
}

/** The full numbers of one of the user's own accounts, fetched only when they ask to see or copy them. */
export async function revealBankAccountAction(accountId: string) {
  return runAction((actor) => revealBankAccount(actor, accountId), { revalidate: false });
}
