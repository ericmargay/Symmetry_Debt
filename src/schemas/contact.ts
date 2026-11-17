import { z } from "zod";
import { idSchema, optionalEmail, optionalNote, optionalText, requiredText } from "./common";

export const CONTACT_NAME_MAX = 80;

export const contactInputSchema = z.object({
  name: requiredText(CONTACT_NAME_MAX),
  email: optionalEmail,
  phone: optionalText(40),
  notes: optionalNote(1000),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

/** Either an existing contact or the details of a new one. */
export const contactRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: idSchema }),
  z.object({ kind: z.literal("new"), name: requiredText(CONTACT_NAME_MAX), email: optionalEmail, phone: optionalText(40) }),
]);
export type ContactRef = z.infer<typeof contactRefSchema>;
