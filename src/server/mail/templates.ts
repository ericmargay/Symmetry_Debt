import "server-only";
import { intlLocales, type Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/messages";
import { notificationParams } from "@/lib/notification-text";
import {
  NOTIFICATION_CATEGORIES,
  notificationHref,
  type NotificationData,
  type NotificationType,
} from "@/lib/notification-types";
import type { OutgoingEmail } from "./index";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );
}

interface Layout {
  locale: Locale;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnotes: string[];
}

/** One plain, readable layout for every email. No images, no tracking. */
function layout({ locale, heading, paragraphs, cta, footnotes }: Layout): { html: string; text: string } {
  const text = [
    heading,
    "",
    ...paragraphs,
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    "",
    "—",
    ...footnotes,
    "Symmetry Debt · Two sides. One agreement.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f6f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b19;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e2d8;border-radius:14px;">
    <tr><td style="padding:24px 28px 8px;">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0f5c5a;font-weight:600;">Symmetry Debt</div>
      <h1 style="margin:14px 0 6px;font-size:20px;line-height:1.35;font-weight:600;">${escapeHtml(heading)}</h1>
    </td></tr>
    <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;">
      ${paragraphs.map((paragraph) => `<p style="margin:10px 0;">${escapeHtml(paragraph)}</p>`).join("\n      ")}
    </td></tr>
    ${
      cta
        ? `<tr><td style="padding:10px 28px 22px;">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#0f5c5a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:9px;">${escapeHtml(cta.label)}</a>
    </td></tr>`
        : ""
    }
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #efeae0;font-size:12px;line-height:1.6;color:#6b6659;">
      ${footnotes.map((note) => `<div>${escapeHtml(note)}</div>`).join("\n      ")}
      <div style="margin-top:8px;">Symmetry Debt · Two sides. One agreement.</div>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, text };
}

export interface NotificationEmailInput {
  to: string;
  locale: Locale;
  type: NotificationType;
  debtId: string | null;
  data: NotificationData;
  /** Public URL of the app, without trailing slash. */
  appUrl: string;
}

export function renderNotificationEmail(input: NotificationEmailInput): OutgoingEmail {
  const t = translatorFor(input.locale);
  const params = notificationParams(input.data, input.locale);
  const heading = t(`notifications.types.${input.type}.title`, params);
  const body = t(`notifications.types.${input.type}.body`, params);
  const category = NOTIFICATION_CATEGORIES[input.type];

  const { html, text } = layout({
    locale: input.locale,
    heading,
    paragraphs: [body],
    cta: { label: t("emails.open"), url: `${input.appUrl}${notificationHref(input.type, input.debtId, input.data)}` },
    footnotes: [
      category === "ACTION_REQUIRED" ? t("emails.whyActionRequired") : t("emails.whyOptional"),
      t("emails.preferences", { url: `${input.appUrl}/app/settings` }),
    ],
  });

  return { to: input.to, subject: heading, html, text };
}

export interface InvitationEmailInput {
  to: string;
  locale: Locale;
  inviterName: string;
  /** The share link. */
  url: string;
  expiresAt: Date;
}

/**
 * The invitation email deliberately says nothing about the debt itself (no concept, no
 * amounts): email is not a private channel. The details are shown after signing in.
 */
export function renderInvitationEmail(input: InvitationEmailInput): OutgoingEmail {
  const t = translatorFor(input.locale);
  const expires = new Intl.DateTimeFormat(intlLocales[input.locale], { dateStyle: "long", timeZone: "UTC" }).format(
    input.expiresAt,
  );
  const heading = t("emails.invitation.heading", { inviter: input.inviterName });

  const { html, text } = layout({
    locale: input.locale,
    heading,
    paragraphs: [t("emails.invitation.intro", { inviter: input.inviterName }), t("emails.invitation.how")],
    cta: { label: t("emails.invitation.cta"), url: input.url },
    footnotes: [t("emails.invitation.expires", { date: expires }), t("emails.invitation.ignore")],
  });

  return { to: input.to, subject: t("emails.invitation.subject", { inviter: input.inviterName }), html, text };
}
