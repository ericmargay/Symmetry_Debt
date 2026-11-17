import { z } from "zod";
import { isValidTimeZone } from "@/domain/dates";
import { locales } from "@/i18n/config";
import { currencySchema } from "./common";

export const preferencesSchema = z.object({
  locale: z.enum(locales),
  timeZone: z.string().max(64).refine(isValidTimeZone, "invalid"),
  defaultCurrency: currencySchema,
  remindersEnabled: z.boolean(),
  emailActionRequired: z.boolean(),
  emailActivity: z.boolean(),
  emailReminders: z.boolean(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;
