import { ArrowLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signInWithGoogleAction } from "@/actions/auth";
import { Logo } from "@/components/brand/logo";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Ticks } from "@/components/shared/ticks";
import { GoogleButton } from "@/components/shared/google-button";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { safeInternalPath } from "@/lib/base-path";
import { signInConfigured } from "@/server/env";
import { getActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metaTitle"), robots: { index: false } };
}

const KNOWN_ERRORS = ["AccessDenied", "OAuthAccountNotLinked", "Configuration", "RateLimited", "NotConfigured"] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ next: rawNext, error }, t, actor] = await Promise.all([searchParams, getTranslations("auth"), getActor()]);
  const next = safeInternalPath(rawNext, "/app");
  if (actor) redirect(next);

  const errorKey = error ? (KNOWN_ERRORS.find((known) => known === error) ?? "Default") : null;
  const invited = next.startsWith("/invite/");
  const usesMockIssuer = Boolean(process.env.AUTH_GOOGLE_ISSUER);
  const configured = signInConfigured();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Showcase (large screens): what the product looks like, clearly marked as an example. */}
      <aside className="relative hidden p-4 lg:block" aria-label={t("showcase.label")}>
        <div className="account-card relative isolate flex h-full flex-col justify-between overflow-hidden p-10 xl:p-14">
          <SymmetryMark state="both" className="pointer-events-none absolute -right-24 -bottom-24 -z-10 size-[26rem] text-white opacity-[0.06]" />
          <Link href="/" className="w-fit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t("backHome")}>
            <span className="inline-flex items-center gap-2 font-display text-[1.15rem] font-extrabold tracking-tight">
              <SymmetryMark state="both" className="size-6" />
              Symmetry Debt
            </span>
          </Link>

          <div className="max-w-md">
            <h2 className="font-display text-4xl leading-[1.08] font-extrabold tracking-tight xl:text-5xl">{t("showcase.title")}</h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted">{t("showcase.text")}</p>

            <div className="mt-10 rounded-3xl bg-white/[0.08] p-6 ring-1 ring-white/10 backdrop-blur" aria-hidden>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{t("showcase.concept")}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-xs font-bold">
                  <Ticks state="both" className="text-[oklch(0.85_0.09_265)]" />
                  {t("showcase.validated")}
                </span>
              </div>
              <p className="mt-5 text-xs font-semibold text-ink-muted">{t("showcase.balance")}</p>
              <p className="mt-1 font-display text-5xl font-extrabold tracking-tight tabular">
                $4,000<span className="text-[0.55em] opacity-75">.00</span>
              </p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-1/3 rounded-full bg-white" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                <span>{t("showcase.paid")}</span>
                <span className="flex items-center -space-x-1.5">
                  <span className="grid size-7 place-items-center rounded-full bg-white text-xs font-bold text-[var(--ink)] ring-2 ring-[var(--ink)]">A</span>
                  <span className="grid size-7 place-items-center rounded-full bg-[oklch(0.75_0.12_265)] text-xs font-bold text-[var(--ink)] ring-2 ring-[var(--ink)]">
                    L
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">{t("showcase.example")}</p>
          </div>

          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-muted">
            <li>{t("showcase.points.free")}</li>
            <li>{t("showcase.points.private")}</li>
            <li>{t("showcase.points.open")}</li>
          </ul>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex w-full items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring lg:invisible" aria-label={t("backHome")}>
            <Logo />
          </Link>
          <LanguageSwitch />
        </header>

        <main id="content" className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-sm">
            <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <SymmetryMark state="both" className="size-7" />
            </span>
            <h1 className="font-display text-[2rem] leading-tight font-extrabold tracking-tight">{t("title")}</h1>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">{invited ? t("invited") : t("subtitle")}</p>

            {!configured && errorKey !== "NotConfigured" && (
              <div role="status" className="mt-6 flex gap-3 rounded-2xl border border-waiting/40 bg-waiting-soft p-4 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-waiting" aria-hidden />
                <div>
                  <p className="font-medium">{t("notConfigured.title")}</p>
                  <p className="mt-1 text-foreground/80">{t("notConfigured.text")}</p>
                </div>
              </div>
            )}

            {errorKey && (
              <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div>
                  <p className="font-medium">{t("error.title")}</p>
                  <p className="mt-1 text-muted-foreground">{t(`error.${errorKey}`)}</p>
                </div>
              </div>
            )}

            <form action={signInWithGoogleAction} className="mt-7">
              <input type="hidden" name="next" value={next} />
              <GoogleButton label={t("google")} pendingLabel={t("redirecting")} disabled={!configured} />
            </form>

            {usesMockIssuer && <p className="mt-3 rounded-lg bg-waiting-soft px-3 py-2 text-xs text-foreground/80">{t("devNotice")}</p>}

            <div className="surface mt-8 flex gap-3 p-4 text-sm">
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
    </div>
  );
}
