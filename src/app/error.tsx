"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shown when a page fails to render. Details stay in the server log, never on screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);

  return (
    <main id="content" className="grid min-h-[70dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-3xl font-semibold">{t("errors.page.errorTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("errors.page.errorText")}</p>
        <Button type="button" className="mt-6" onClick={reset}>
          {t("common.retry")}
        </Button>
      </div>
    </main>
  );
}
