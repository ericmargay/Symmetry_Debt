import "server-only";
import type { Actor } from "../actor";
import { sha256Hex } from "../crypto";
import type { Db } from "../db";

/**
 * Finds the invitation a key refers to, if the actor may use it.
 *
 * A key is either
 *   - the secret token of a share link: whoever holds the link may open it, or
 *   - the id of an invitation: only for the person whose verified email the invitation names
 *     (this is how invitations show up inside the app for people who already have an account).
 */
export async function resolveInvitationAccess(db: Db, actor: Pick<Actor, "email">, key: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) return null;

  const byToken = await db.invitation.findUnique({ where: { tokenHash: sha256Hex(key) } });
  if (byToken) return byToken;

  const byId = await db.invitation.findUnique({ where: { id: key } });
  if (byId && byId.email !== null && byId.email === actor.email.toLowerCase()) return byId;

  return null;
}

/** "l•••@g•••.com" — enough of a hint for the right person, useless to anybody else. */
export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const [host, ...rest] = domain.split(".");
  const mask = (value: string) => (value ? `${value[0]}•••` : "•••");
  return `${mask(local)}@${mask(host)}${rest.length ? `.${rest.join(".")}` : ""}`;
}
