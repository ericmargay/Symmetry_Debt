"use client";

import { Mail, MessageCircle, Share2, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withBasePath } from "@/lib/base-path";

const subscribe = () => () => {};

/**
 * The share link of an agreement, right after it was created.
 *
 * Only a hash of the link is stored on the server, so this is the one moment it can be shown.
 * The person copies it or sends it through whatever they already use to talk to the other side.
 */
export function ShareLinkPanel({ token, emailedTo }: { token: string; emailedTo?: string | null }) {
  const t = useTranslations("share");
  // The origin is only known in the browser.
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(subscribe, () => typeof navigator.share === "function", () => false);
  const url = `${origin}${withBasePath(`/invite/${token}`)}`;
  const message = `${t("message")} ${url}`;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("label")}
        <Input readOnly value={origin ? url : ""} onFocus={(event) => event.currentTarget.select()} className="tabular font-mono text-xs" data-testid="share-link" />
      </label>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label={t("copy")} variant="default" size="default" />
        <Button asChild variant="outline">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t("whatsapp")}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`mailto:?subject=${encodeURIComponent(t("emailSubject"))}&body=${encodeURIComponent(message)}`}>
            <Mail aria-hidden />
            {t("email")}
          </a>
        </Button>
        {canShare && (
          <Button type="button" variant="outline" onClick={() => void navigator.share({ text: t("message"), url }).catch(() => undefined)}>
            <Share2 aria-hidden />
            {t("native")}
          </Button>
        )}
      </div>
      {emailedTo && <p className="text-sm text-muted-foreground">{t("emailed", { email: emailedTo })}</p>}
      <p className="flex gap-2 rounded-lg bg-waiting-soft px-3 py-2.5 text-xs leading-relaxed text-foreground/80">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-waiting" aria-hidden />
        <span>
          {t("onceNotice")} {t("privacy")}
        </span>
      </p>
    </div>
  );
}
