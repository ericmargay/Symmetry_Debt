import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token (256 bits by default) for invitation links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field encryption (bank account data at rest)
// ─────────────────────────────────────────────────────────────────────────────
//
// AES-256-GCM with a random 96-bit nonce per value. Stored form:
//
//   v1.<key id>.<nonce>.<ciphertext>.<auth tag>      (base64url parts)
//
// The key id (first bytes of the key's SHA-256) lets a value written with the previous key be
// read while DATA_ENCRYPTION_KEY is being rotated.

const PREFIX = "v1";

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

interface Key {
  id: string;
  bytes: Buffer;
}

function loadKey(value: string | undefined, name: string): Key | null {
  if (!value) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) {
    throw new EncryptionKeyError(`${name} must be 32 bytes encoded in base64 (openssl rand -base64 32)`);
  }
  return { id: createHash("sha256").update(bytes).digest("base64url").slice(0, 8), bytes };
}

function currentKey(): Key {
  const key = loadKey(env().DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY");
  if (!key) {
    throw new EncryptionKeyError(
      "DATA_ENCRYPTION_KEY is not set. It is required to store bank account details (openssl rand -base64 32).",
    );
  }
  return key;
}

function keyById(id: string): Key {
  const candidates = [
    loadKey(env().DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY"),
    loadKey(env().DATA_ENCRYPTION_KEY_PREVIOUS, "DATA_ENCRYPTION_KEY_PREVIOUS"),
  ];
  const match = candidates.find((candidate) => candidate?.id === id);
  if (!match) {
    throw new EncryptionKeyError(
      "This value was encrypted with a key that is not configured (check DATA_ENCRYPTION_KEY / DATA_ENCRYPTION_KEY_PREVIOUS).",
    );
  }
  return match;
}

export function encryptField(plain: string): string {
  const key = currentKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, key.id, nonce.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptField(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 5 || parts[0] !== PREFIX) {
    throw new EncryptionKeyError("Unrecognised encrypted value");
  }
  const [, keyId, nonce, ciphertext, tag] = parts;
  const key = keyById(keyId);
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** True when a value was written with a key other than the current one (needs re-encrypting). */
export function needsReencryption(stored: string): boolean {
  const parts = stored.split(".");
  return parts.length !== 5 || parts[1] !== currentKey().id;
}
