import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors.page");
  return (
    <main id="content" className="grid min-h-dvh place-items-center px-6">
      <div className="surface max-w-sm px-8 py-10 text-center">
        <Logo className="justify-center" />
        <p className="mt-8 font-display text-6xl font-extrabold tracking-tight text-primary" aria-hidden>
          404
        </p>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">{t("notFoundTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("notFoundText")}</p>
        <Button asChild className="mt-6">
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
