/** File types accepted as receipts, with the extension each one is stored and served with. */
export const RECEIPT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ReceiptMime = keyof typeof RECEIPT_TYPES;

export const RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export function isReceiptMime(value: string): value is ReceiptMime {
  return Object.prototype.hasOwnProperty.call(RECEIPT_TYPES, value);
}

export function isImageMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Identifies a file by its first bytes. The name and the type announced by the browser are
 * never trusted: a file is what its content says it is.
 */
export function sniffReceiptType(bytes: Uint8Array): ReceiptMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** A display name that is safe in headers and file systems, with the extension matching the content. */
export function safeFileName(original: string, mime: ReceiptMime): string {
  const extension = RECEIPT_TYPES[mime];
  const base = (original.split(/[\\/]/).pop() ?? "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^\p{L}\p{N} ._()-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${base || "comprobante"}.${extension}`;
}
