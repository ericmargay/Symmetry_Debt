import type { NextRequest } from "next/server";
import { httpStatusFor, isAppError } from "@/server/errors";
import { flushEmailOutboxQuietly } from "@/server/notifications";
import { LIMITS } from "@/server/rate-limit";
import { addAttachment, maxUploadBytes } from "@/server/services/attachments";
import { getActor } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Uploads one receipt for a debt (optionally for one of its movements).
 *
 * multipart/form-data: debtId, paymentId (optional), file.
 * Who may upload, what kind of file and how large is decided by the service; the browser's
 * word for the file type is ignored.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });

  // Same-origin only: this endpoint is not a server action, so it checks the origin itself.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== host) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await LIMITS.upload(actor.id);

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxUploadBytes() + 64 * 1024) {
      return Response.json({ error: "file_too_large" }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const debtId = form.get("debtId");
    const paymentId = form.get("paymentId");
    if (!(file instanceof File) || typeof debtId !== "string" || !debtId) {
      return Response.json({ error: "validation" }, { status: 400 });
    }

    const { id } = await addAttachment(actor, {
      debtId,
      paymentId: typeof paymentId === "string" && paymentId ? paymentId : null,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    void flushEmailOutboxQuietly();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.code, params: error.params }, { status: httpStatusFor(error.code) });
    }
    console.error("[attachments] upload failed:", error);
    return Response.json({ error: "generic" }, { status: 500 });
  }
}
