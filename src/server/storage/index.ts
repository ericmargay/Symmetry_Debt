import "server-only";
import { randomBytes } from "node:crypto";
import { env } from "../env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

/**
 * Private file storage for receipts.
 *
 * Nothing stored here is ever reachable by URL: files are only served through
 * /api/attachments/[id], which checks who is asking first.
 */
export interface StoredObject {
  body: Uint8Array;
  contentLength: number;
}

export interface Storage {
  readonly driver: "local" | "s3";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Used by the health check. */
  check(): Promise<void>;
}

let instance: Storage | undefined;

export function storage(): Storage {
  if (instance) return instance;
  const config = env();
  instance =
    config.STORAGE_DRIVER === "s3"
      ? new S3Storage({
          endpoint: config.S3_ENDPOINT,
          region: config.S3_REGION,
          bucket: config.S3_BUCKET as string,
          accessKeyId: config.S3_ACCESS_KEY_ID as string,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY as string,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        })
      : new LocalStorage(config.STORAGE_LOCAL_DIR);
  return instance;
}

/** For tests. */
export function resetStorage(): void {
  instance = undefined;
}

/** Unguessable object key. The original file name is kept in the database, never in the key. */
export function newStorageKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `receipts/${year}/${month}/${randomBytes(20).toString("hex")}`;
}
