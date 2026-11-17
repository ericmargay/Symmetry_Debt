import "server-only";
import { env } from "../env";

/**
 * Transactional email. Optional: with EMAIL_PROVIDER=none (the default) the app works fully,
 * people just see their notifications inside the app and share invitation links by hand.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  sent: boolean;
  /** Why nothing was sent, when `sent` is false. */
  reason?: "disabled" | "error";
  error?: string;
}

export function emailEnabled(): boolean {
  return env().EMAIL_PROVIDER !== "none";
}

/** Test hook: when set, emails are handed to this function instead of a provider. */
let interceptor: ((email: OutgoingEmail) => void | Promise<void>) | undefined;

export function setEmailInterceptor(handler: typeof interceptor): void {
  interceptor = handler;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (interceptor) {
    await interceptor(email);
    return { sent: true };
  }

  const config = env();
  try {
    if (config.EMAIL_PROVIDER === "smtp") {
      const { sendWithSmtp } = await import("./smtp");
      await sendWithSmtp(config.SMTP_URL as string, config.EMAIL_FROM, email);
      return { sent: true };
    }
    if (config.EMAIL_PROVIDER === "resend") {
      const { sendWithResend } = await import("./resend");
      await sendWithResend(config.RESEND_API_KEY as string, config.EMAIL_FROM, email);
      return { sent: true };
    }
    return { sent: false, reason: "disabled" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail] could not send "${email.subject}": ${message}`);
    return { sent: false, reason: "error", error: message };
  }
}
