import { z } from "zod";
import { normalizeClabe, validateClabe } from "@/domain/clabe";
import { currencySchema, requiredText, type ValidationKey } from "./common";

const CLABE_ERRORS: Record<string, ValidationKey> = {
  length: "clabeLength",
  digits: "clabeDigits",
  checksum: "clabeChecksum",
};

/**
 * A bank account where the user can RECEIVE money.
 * There is deliberately no field for passwords, PINs, card numbers or CVVs.
 */
export const bankAccountInputSchema = z
  .object({
    alias: requiredText(60),
    bankName: requiredText(80),
    holderName: requiredText(120),
    clabe: z
      .string()
      .nullish()
      .transform((value) => {
        const digits = normalizeClabe(value ?? "");
        return digits === "" ? null : digits;
      }),
    accountNumber: z
      .string()
      .nullish()
      .transform((value) => {
        const compact = (value ?? "").replace(/[\s-]/g, "").toUpperCase();
        return compact === "" ? null : compact;
      }),
    currency: currencySchema,
    isPreferred: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.clabe !== null) {
      const result = validateClabe(value.clabe);
      if (!result.ok) {
        context.addIssue({ code: "custom", path: ["clabe"], message: CLABE_ERRORS[result.error] });
      }
    }
    if (value.accountNumber !== null && !/^[0-9A-Z]{4,34}$/.test(value.accountNumber)) {
      context.addIssue({ code: "custom", path: ["accountNumber"], message: "accountNumber" satisfies ValidationKey });
    }
    if (value.clabe === null && value.accountNumber === null) {
      context.addIssue({ code: "custom", path: ["clabe"], message: "needClabeOrAccount" satisfies ValidationKey });
    }
  });

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;
export type BankAccountFormValues = z.input<typeof bankAccountInputSchema>;
