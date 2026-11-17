import "server-only";
import type { z } from "zod";
import { contactInputSchema, type ContactRef } from "@/schemas/contact";
import type { Actor } from "../actor";
import { prisma, type Db } from "../db";
import { AppError } from "../errors";
import { parseInput } from "./validation";

/**
 * Contacts are private address-book entries of one user. A contact is only ever linked to a
 * registered user when that person joins an agreement through an invitation — never because a
 * name or an email address happens to match.
 */

export async function createContact(actor: Actor, input: z.input<typeof contactInputSchema>) {
  const data = parseInput(contactInputSchema, input);
  return prisma.contact.create({ data: { ownerId: actor.id, ...data } });
}

export async function updateContact(actor: Actor, contactId: string, input: z.input<typeof contactInputSchema>) {
  const data = parseInput(contactInputSchema, input);
  const { count } = await prisma.contact.updateMany({ where: { id: contactId, ownerId: actor.id }, data });
  if (count === 0) throw new AppError("contact_not_found");
}

export async function setContactArchived(actor: Actor, contactId: string, archived: boolean) {
  const { count } = await prisma.contact.updateMany({
    where: { id: contactId, ownerId: actor.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) throw new AppError("contact_not_found");
}

/** A contact can be deleted only while nothing refers to it; otherwise it can be archived. */
export async function deleteContact(actor: Actor, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, ownerId: actor.id },
    select: { id: true, _count: { select: { personalDebts: true, participations: true } } },
  });
  if (!contact) throw new AppError("contact_not_found");
  if (contact._count.personalDebts > 0 || contact._count.participations > 0) throw new AppError("contact_in_use");
  await prisma.contact.delete({ where: { id: contact.id } });
}

/** Resolves "an existing contact of mine, or a new one" inside a transaction. */
export async function resolveContact(db: Db, actor: Pick<Actor, "id">, ref: ContactRef) {
  if (ref.kind === "existing") {
    const contact = await db.contact.findFirst({ where: { id: ref.id, ownerId: actor.id } });
    if (!contact) throw new AppError("contact_not_found");
    if (contact.archivedAt) {
      return db.contact.update({ where: { id: contact.id }, data: { archivedAt: null } });
    }
    return contact;
  }
  return db.contact.create({
    data: { ownerId: actor.id, name: ref.name, email: ref.email, phone: ref.phone },
  });
}

export async function listContactOptions(actor: Pick<Actor, "id">) {
  return prisma.contact.findMany({
    where: { ownerId: actor.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, linkedUserId: true },
  });
}
