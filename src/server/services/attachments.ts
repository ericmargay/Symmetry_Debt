import "server-only";
import { safeFileName, sniffReceiptType } from "@/lib/attachments";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import { sha256Hex } from "../crypto";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { newStorageKey, storage } from "../storage";
import { resolveInvitationAccess } from "./invitation-access";
import { lockDebt, requireDebtAccess, transaction } from "./shared";

/**
 * Receipts and supporting documents.
 *
 * A receipt is something somebody attached. It is shown next to the movement it supports, and
 * that is all: it never confirms a payment. In a shared agreement the other side still has to
 * approve the movement itself.
 */

const MAX_ATTACHMENTS_PER_DEBT = 200;

export function maxUploadBytes(): number {
  return env().MAX_UPLOAD_MB * 1024 * 1024;
}

export interface NewAttachment {
  debtId: string;
  paymentId?: string | null;
  fileName: string;
  bytes: Uint8Array;
}

export async function addAttachment(actor: Actor, input: NewAttachment): Promise<{ id: string }> {
  if (input.bytes.byteLength === 0) throw new AppError("file_empty");
  if (input.bytes.byteLength > maxUploadBytes()) {
    throw new AppError("file_too_large", { params: { max: env().MAX_UPLOAD_MB } });
  }
  const mime = sniffReceiptType(input.bytes);
  if (!mime) throw new AppError("file_type_not_allowed");

  const storageKey = newStorageKey();
  const fileName = safeFileName(input.fileName, mime);
  const sha256 = sha256Hex(input.bytes);
  let stored = false;

  try {
    return await transaction(async (tx) => {
      await lockDebt(tx, input.debtId);
      const access = await requireDebtAccess(tx, actor, input.debtId);
      if (access.status === "CANCELLED" || access.status === "CONVERTED") throw new AppError("invalid_state");
      if (access.mode === "SHARED" && !access.me?.identityConfirmedAt) throw new AppError("identity_unconfirmed");

      if (input.paymentId) {
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, debtId: input.debtId },
          select: { status: true },
        });
        if (!payment) throw new AppError("not_found");
        if (payment.status === "REJECTED" || payment.status === "WITHDRAWN") throw new AppError("invalid_state");
      }

      const count = await tx.attachment.count({ where: { debtId: input.debtId } });
      if (count >= MAX_ATTACHMENTS_PER_DEBT) throw new AppError("conflict");

      await storage().put(storageKey, input.bytes, mime);
      stored = true;

      const attachment = await tx.attachment.create({
        data: {
          debtId: input.debtId,
          paymentId: input.paymentId ?? null,
          uploaderId: actor.id,
          storageKey,
          fileName,
          mimeType: mime,
          sizeBytes: input.bytes.byteLength,
          sha256,
        },
      });
      await recordEvent(tx, {
        scope: access.mode === "PERSONAL" ? "PERSONAL" : "SHARED",
        type: "ATTACHMENT_ADDED",
        debtId: input.debtId,
        actorId: actor.id,
        actorRole: access.role,
        paymentId: input.paymentId ?? null,
        data: { fileName },
      });
      return { id: attachment.id };
    });
  } catch (error) {
    // The database rolled back: do not leave the file behind.
    if (stored) await storage().delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export interface AttachmentDownload {
  fileName: string;
  mimeType: string;
  body: Uint8Array;
}

/**
 * Loads a receipt for whoever may see it: the owner of a personal record, the participants of a
 * shared agreement, or the person reviewing a proposal through its invitation link.
 */
export async function readAttachment(
  actor: Actor,
  attachmentId: string,
  invitationKey?: string | null,
): Promise<AttachmentDownload> {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw new AppError("not_found");

  let allowed = false;
  try {
    await requireDebtAccess(prisma, actor, attachment.debtId);
    allowed = true;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  if (!allowed && invitationKey) {
    const invitation = await resolveInvitationAccess(prisma, actor, invitationKey);
    allowed = invitation !== null && invitation.debtId === attachment.debtId && attachment.paymentId === null;
  }
  if (!allowed) throw new AppError("not_found");

  const object = await storage().get(attachment.storageKey);
  if (!object) throw new AppError("not_found");
  return { fileName: attachment.fileName, mimeType: attachment.mimeType, body: object.body };
}

export async function deleteAttachment(actor: Actor, attachmentId: string): Promise<void> {
  const located = await prisma.attachment.findUnique({ where: { id: attachmentId }, select: { debtId: true } });
  if (!located) throw new AppError("not_found");

  const storageKey = await transaction(async (tx) => {
    await lockDebt(tx, located.debtId);
    const access = await requireDebtAccess(tx, actor, located.debtId);
    const attachment = await tx.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
      include: { payment: { select: { status: true } } },
    });

    if (access.mode === "SHARED") {
      // Only whoever uploaded it, never once the movement it supports has been confirmed,
      // and never after the agreement is closed: by then it is part of the record.
      if (attachment.uploaderId !== actor.id) throw new AppError("forbidden");
      if (attachment.payment?.status === "CONFIRMED") throw new AppError("attachment_locked");
      if (access.status === "SETTLED" || access.status === "CANCELLED") throw new AppError("attachment_locked");
    }

    await tx.attachment.delete({ where: { id: attachment.id } });
    await recordEvent(tx, {
      scope: access.mode === "PERSONAL" ? "PERSONAL" : "SHARED",
      type: "ATTACHMENT_REMOVED",
      debtId: attachment.debtId,
      actorId: actor.id,
      actorRole: access.role,
      paymentId: attachment.paymentId,
      data: { fileName: attachment.fileName, sha256: attachment.sha256 },
    });
    return attachment.storageKey;
  });

  await deleteOrphanedFiles([storageKey]);
}

/**
 * Removes stored files that no attachment row points to any more. The same file can back
 * several rows (a receipt copied from a personal record to the agreement proposed from it),
 * so it is only deleted when the last reference is gone.
 */
export async function deleteOrphanedFiles(storageKeys: readonly string[]): Promise<void> {
  const unique = [...new Set(storageKeys)];
  if (unique.length === 0) return;
  const stillUsed = await prisma.attachment.findMany({
    where: { storageKey: { in: unique } },
    select: { storageKey: true },
    distinct: ["storageKey"],
  });
  const used = new Set(stillUsed.map((row) => row.storageKey));
  for (const key of unique) {
    if (used.has(key)) continue;
    try {
      await storage().delete(key);
    } catch (error) {
      console.error(`[attachments] could not delete ${key}:`, error instanceof Error ? error.message : error);
    }
  }
}
