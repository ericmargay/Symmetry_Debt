import { httpStatusFor, isAppError } from "@/server/errors";
import { LIMITS } from "@/server/rate-limit";
import { exportUserData } from "@/server/services/account";
import { getActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** Everything the app holds about the signed-in user, as a JSON file. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });

  try {
    await LIMITS.export(actor.id);
    const data = await exportUserData(actor);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="symmetry-debt-${day}.json"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error)) return Response.json({ error: error.code }, { status: httpStatusFor(error.code) });
    console.error("[export] failed:", error);
    return Response.json({ error: "generic" }, { status: 500 });
  }
}
