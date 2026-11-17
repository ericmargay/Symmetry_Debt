import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage, StoredObject } from "./index";

/** Files on a local directory (a Docker volume in self-hosted installs). */
export class LocalStorage implements Storage {
  readonly driver = "local" as const;
  private readonly root: string;

  constructor(directory: string) {
    this.root = path.resolve(directory);
  }

  private resolve(key: string): string {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes("//") || key.startsWith("/")) {
      throw new Error("Invalid storage key");
    }
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Storage key escapes the storage directory");
    }
    return target;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { mode: 0o600 });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const body = await readFile(this.resolve(key));
      return { body, contentLength: body.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async check(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await stat(this.root);
  }
}
