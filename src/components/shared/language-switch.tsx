"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/actions/locale";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * ES / EN. The choice is remembered (cookie + the user's preferences when signed in) and the
 * page is re-rendered in place: there is no /es or /en in the address.
 */
export function LanguageSwitch({ className, variant = "segmented" }: { className?: string; variant?: "segmented" | "menu" }) {
  const t = useTranslations("locale");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (locale: Locale) => {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t("switchTo")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 text-xs font-medium",
        pending && "opacity-70",
        className,
      )}
    >
      {variant === "segmented" && <Languages className="mx-1.5 size-3.5 text-muted-foreground" aria-hidden />}
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          onClick={() => choose(locale)}
          aria-pressed={locale === current}
          aria-label={t(locale)}
          disabled={pending}
          className={cn(
            "min-h-8 min-w-9 rounded-full px-2.5 py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`short.${locale}`)}
        </button>
      ))}
    </div>
  );
}
