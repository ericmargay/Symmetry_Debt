import "server-only";
import nodemailer from "nodemailer";
import type { OutgoingEmail } from "./index";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
let transportUrl: string | undefined;

/** Any SMTP server: smtp://user:pass@host:587 or smtps://user:pass@host:465 */
export async function sendWithSmtp(url: string, from: string, email: OutgoingEmail): Promise<void> {
  if (!transport || transportUrl !== url) {
    transport = nodemailer.createTransport(url);
    transportUrl = url;
  }
  await transport.sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html });
}
