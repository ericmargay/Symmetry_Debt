import "server-only";
import type { OutgoingEmail } from "./index";

/** Resend's HTTP API — useful on hosts that block outbound SMTP. */
export async function sendWithResend(apiKey: string, from: string, email: OutgoingEmail): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}`);
  }
}
