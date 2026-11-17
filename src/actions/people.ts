"use server";

import type { z } from "zod";
import { runAction } from "@/actions/_run";
import type { contactInputSchema } from "@/schemas/contact";
import { createContact, deleteContact, setContactArchived, updateContact } from "@/server/services/contacts";

type ContactValues = z.input<typeof contactInputSchema>;

export async function createContactAction(input: ContactValues) {
  return runAction(async (actor) => ({ id: (await createContact(actor, input)).id }));
}

export async function updateContactAction(contactId: string, input: ContactValues) {
  return runAction((actor) => updateContact(actor, contactId, input));
}

export async function setContactArchivedAction(contactId: string, archived: boolean) {
  return runAction((actor) => setContactArchived(actor, contactId, archived));
}

export async function deleteContactAction(contactId: string) {
  return runAction((actor) => deleteContact(actor, contactId));
}
