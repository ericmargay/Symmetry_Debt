import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import type { ActionResult } from "@/lib/action-result";
import type { Actor } from "@/server/actor";
import { EnvError } from "@/server/env";
import { isAppError } from "@/server/errors";
import { flushEmailOutboxQuietly } from "@/server/notifications";
import { LIMITS } from "@/server/rate-limit";
import { requireActorOrThrow } from "@/server/session";

interface RunOptions {
  /** Extra rate limit on top of the general one for changes. */
  limit?: "invitation" | "invitationLookup" | "upload" | "export";
  /** Set to false for actions that change nothing a page shows. */
  revalidate?: boolean;
}

/**
 * The wrapper every server action goes through:
 *
 *   1. the session is resolved on the server (never trusted from the client);
 *   2. the user is rate limited;
 *   3. the work runs — services enforce authorisation themselves, with the actor they are given;
 *   4. expected failures become a result the form can display; anything else is logged and
 *      reported as a generic error, without leaking details to the browser;
 *   5. pages are refreshed and pending emails are sent after the response.
 */
export async function runAction<T>(work: (actor: Actor) => Promise<T>, options: RunOptions = {}): Promise<ActionResult<T>> {
  try {
    const actor = await requireActorOrThrow();
    await LIMITS.mutation(actor.id);
    if (options.limit) await LIMITS[options.limit](actor.id);

    const data = await work(actor);

    if (options.revalidate !== false) revalidatePath("/", "layout");
    after(flushEmailOutboxQuietly);
    return { ok: true, data };
  } catch (error) {
    // redirect() and notFound() work by throwing: let Next.js handle those.
    unstable_rethrow(error);
    if (isAppError(error)) {
      return { ok: false, code: error.code, fields: error.fields, params: error.params };
    }
    if (error instanceof EnvError) console.error(`[config] ${error.message}`);
    else console.error("[action] unexpected error:", error);
    return { ok: false, code: "generic" };
  }
}
