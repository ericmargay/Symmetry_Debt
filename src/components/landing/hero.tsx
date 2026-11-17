import { ArrowRight, Check, CodeXml, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { GithubIcon } from "@/components/brand/github-icon";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Button } from "@/components/ui/button";
import { formatMoney, percentOf } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { Chip, Container, ExampleCaption } from "./section";

const CURRENCY = "MXN";
const TOTAL = 600_000n;
const CONFIRMED = 200_000n;
const AWAITING = 100_000n;
const PERSONAL = 85_000n;

export function Hero({ signedIn, repoUrl }: { signedIn: boolean; repoUrl: string }) {
  const t = useTranslations("landing.hero");
  const nav = useTranslations("nav");

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Container className="relative grid items-center gap-14 pt-14 pb-20 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-12 lg:pt-24 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <SymmetryMark state="both" className="size-4" />
            <span lang="en">{t("motto")}</span>
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[2.7rem] leading-[1.02] font-medium tracking-tight sm:text-6xl"
          >
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">{t("subtitle")}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href={signedIn ? "/app" : "/login"}>
                {signedIn ? nav("goToApp") : t("primaryCta")}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon data-icon="inline-start" />
                {t("githubCta")}
              </a>
            </Button>
          </div>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">{t("note")}</p>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-primary" aria-hidden />
              {t("points.free")}
            </li>
            <li className="flex items-center gap-2">
              <Lock className="size-4 text-primary" aria-hidden />
              {t("points.private")}
            </li>
            <li className="flex items-center gap-2">
              <CodeXml className="size-4 text-primary" aria-hidden />
              {t("points.open")}
            </li>
          </ul>
        </div>

        <HeroVisual />
      </Container>
    </section>
  );
}

/**
 * A very large, very faint Symmetry mark behind the illustration. Its axis runs through the
 * middle of the card, in line with the two small halves inside it.
 */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-[44%] left-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 sm:size-[42rem]"
    >
      <div className="absolute inset-y-0 left-0 w-[calc(50%-0.5rem)] rounded-l-full bg-primary/[0.07]" />
      <div className="absolute inset-y-0 right-0 w-[calc(50%-0.5rem)] rounded-r-full bg-primary/[0.035]" />
    </div>
  );
}

/** Two half-discs, one per person, that together make one circle. */
function PartyHalves({ left, right }: { left: string; right: string }) {
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-[7.5rem] shrink-0" aria-hidden focusable="false">
      <path d="M58 4a28 28 0 0 0 0 56Z" className="fill-primary" />
      <path d="M62 4a28 28 0 0 1 0 56Z" className="fill-primary" />
      <text x="45" y="39" textAnchor="middle" className="fill-primary-foreground font-display text-[20px] font-semibold">
        {left.slice(0, 1)}
      </text>
      <text x="75" y="39" textAnchor="middle" className="fill-primary-foreground font-display text-[20px] font-semibold">
        {right.slice(0, 1)}
      </text>
    </svg>
  );
}

function HeroVisual() {
  const t = useTranslations("landing.hero.visual");
  const people = useTranslations("landing.people");
  const intlLocale = intlLocales[useLocale() as Locale] ?? intlLocales.es;
  const money = (minor: bigint) => formatMoney(minor, CURRENCY, intlLocale);
  const progress = percentOf(CONFIRMED, TOTAL);

  return (
    <div className="relative isolate mx-auto w-full max-w-md lg:mr-0 lg:max-w-[28rem]">
      <Backdrop />
      <div role="img" aria-label={t("label")} className="relative">
        {/* The agreement both sides accepted */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-28px] shadow-primary/35 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-agreed uppercase">
              <SymmetryMark state="both" className="size-4" />
              {t("agreement")}
            </span>
            <Chip tone="agreed">{t("status")}</Chip>
          </div>
          <p className="mt-4 font-display text-2xl leading-tight font-medium">{t("concept")}</p>

          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate font-medium">{people("ana")}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5 text-agreed" />
                {t("accepted")}
              </p>
            </div>
            <PartyHalves left={people("ana")} right={people("luis")} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{people("luis")}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5 text-agreed" />
                {t("accepted")}
              </p>
            </div>
          </div>

          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("confirmedBalance")}</span>
              <span className="tabular font-display text-3xl leading-none font-medium">{money(TOTAL - CONFIRMED)}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-agreed" style={{ width: `${progress}%` }} />
            </div>
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {t("progress", { paid: money(CONFIRMED), total: money(TOTAL) })}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-waiting-soft px-3.5 py-2.5 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <SymmetryMark state="waiting" className="size-4 text-waiting" />
                {t("awaiting")}
              </span>
              <span className="tabular font-medium">{money(AWAITING)}</span>
            </div>
          </div>
        </div>

        {/* A personal record: one side only, and nobody else sees it */}
        <div className="relative z-10 -mt-5 ml-auto w-[88%] rounded-2xl border border-border bg-card p-4 shadow-[0_18px_40px_-24px] shadow-personal/50 sm:-mr-4 sm:w-[80%] sm:p-5">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] whitespace-nowrap text-personal uppercase">
            <SymmetryMark state="one" className="size-4" />
            {t("personal")}
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{t("personalConcept")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("personalWho")}</p>
            </div>
            <span className="tabular font-display text-xl leading-none font-medium text-owe">{money(PERSONAL)}</span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            {t("onlyYou")}
          </p>
        </div>
      </div>
      <ExampleCaption className="mt-4" />
    </div>
  );
}
