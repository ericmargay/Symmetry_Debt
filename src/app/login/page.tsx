import { ArrowLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signInWithGoogleAction } from "@/actions/auth";
import { Logo } from "@/components/brand/logo";
import { GoogleButton } from "@/components/shared/google-button";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { safeInternalPath } from "@/lib/base-path";
import { getActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metaTitle"), robots: { index: false } };
}

const KNOWN_ERRORS = ["AccessDenied", "OAuthAccountNotLinked", "Configuration", "RateLimited"] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ next: rawNext, error }, t, actor] = await Promise.all([searchParams, getTranslations("auth"), getActor()]);
  const next = safeInternalPath(rawNext, "/app");
  if (actor) redirect(next);

  const errorKey = error ? (KNOWN_ERRORS.find((known) => known === error) ?? "Default") : null;
  const invited = next.startsWith("/invite/");
  const usesMockIssuer = Boolean(process.env.AUTH_GOOGLE_ISSUER);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("backHome")}>
          <Logo />
        </Link>
        <LanguageSwitch />
      </header>

      <main id="content" className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl leading-tight font-semibold">{t("title")}</h1>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">{invited ? t("invited") : t("subtitle")}</p>

          {errorKey && (
            <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="font-medium">{t("error.title")}</p>
                <p className="mt-1 text-muted-foreground">{t(`error.${errorKey}`)}</p>
              </div>
            </div>
          )}

          <form action={signInWithGoogleAction} className="mt-7">
            <input type="hidden" name="next" value={next} />
            <GoogleButton label={t("google")} pendingLabel={t("redirecting")} />
          </form>

          {usesMockIssuer && (
            <p className="mt-3 rounded-lg bg-waiting-soft px-3 py-2 text-xs text-foreground/80">{t("devNotice")}</p>
          )}

          <div className="mt-8 flex gap-3 rounded-xl border border-border bg-card p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-medium">{t("privacyTitle")}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{t("privacy")}</p>
            </div>
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {t("backHome")}
          </Link>
        </div>
      </main>
    </div>
  );
}
