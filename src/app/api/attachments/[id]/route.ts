import type { NextRequest } from "next/server";
import { isImageMime } from "@/lib/attachments";
import { isAppError } from "@/server/errors";
import { readAttachment } from "@/server/services/attachments";
import { getActor } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Serves a receipt to somebody who is allowed to see it.
 *
 *   ?download=1   forces a download instead of showing it in the browser
 *   ?invite=…     lets the person reviewing a proposal see the receipts attached to it
 *
 * Files are never public and are never cached by shared caches. Whatever the file contains,
 * the response cannot run scripts or be embedded elsewhere.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });

  const { id } = await context.params;
  const invite = request.nextUrl.searchParams.get("invite");
  const download = request.nextUrl.searchParams.get("download") === "1";

  try {
    const file = await readAttachment(actor, id, invite);
    const inline = !download && (isImageMime(file.mimeType) || file.mimeType === "application/pdf");
    const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return new Response(Buffer.from(file.body), {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(file.body.byteLength),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new Response(null, { status: 404 });
    console.error("[attachments] download failed:", error);
    return new Response(null, { status: 500 });
  }
}
