"use client";

import { Languages, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissLocaleHintAction, setLocaleAction } from "@/actions/locale";
import type { Locale } from "@/i18n/config";

/**
 * "This site is also available in English." — offered, never imposed.
 *
 * The texts arrive already written in the language being offered (that is the language the
 * visitor's browser asked for), which is why the bar carries its own `lang`.
 */
export function LanguageHint({
  locale,
  text,
  action,
  dismiss,
}: {
  locale: Locale;
  text: string;
  action: string;
  dismiss: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const accept = () =>
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });

  const decline = () => {
    setHidden(true);
    startTransition(async () => {
      await dismissLocaleHintAction();
    });
  };

  return (
    <aside lang={locale} aria-label={text} className="border-b border-border bg-secondary text-secondary-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2 text-sm sm:px-8">
        <p className="flex items-center gap-2">
          <Languages className="size-4 shrink-0" aria-hidden />
          {text}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            className="min-h-10 rounded-md px-3 font-semibold underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {action}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={pending}
            className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-secondary-foreground/80 outline-none hover:text-secondary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <X className="size-3.5" aria-hidden />
            {dismiss}
          </button>
        </div>
      </div>
    </aside>
  );
}
