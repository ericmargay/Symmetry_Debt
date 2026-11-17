import { ArrowRight, Check, CodeXml, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { GithubIcon } from "@/components/brand/github-icon";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Button } from "@/components/ui/button";
import { formatMoney, percentOf } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { HeroScene } from "./hero-scene";
import { Chip, Container, ExampleCaption } from "./section";

const CURRENCY = "MXN";
const TOTAL = 600_000n;
const CONFIRMED = 200_000n;
const AWAITING = 100_000n;
const PERSONAL = 85_000n;

/** Delay for the staggered entrance (`.landing-rise`, see app/landing.css). */
const rise = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as React.CSSProperties;

export function Hero({ signedIn, repoUrl }: { signedIn: boolean; repoUrl: string }) {
  const t = useTranslations("landing.hero");
  const nav = useTranslations("nav");
  const words = t("title").split(" ");

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden className="landing-hero-grid pointer-events-none absolute inset-0 -z-20" />
      <Container className="relative grid items-center gap-6 pt-10 pb-16 sm:gap-10 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-10 lg:pt-14 lg:pb-24 xl:grid-cols-[minmax(0,1fr)_32rem]">
        <div className="relative z-10">
          <p className="landing-rise inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.22em] uppercase" style={rise(0)}>
            <SymmetryMark state="both" className="size-4 text-primary" />
            <span lang="en" className="landing-sheen">
              {t("motto")}
            </span>
          </p>
          <h1 id="hero-title" className="mt-6 font-display text-[2.7rem] leading-[1.02] font-medium tracking-tight sm:text-6xl">
            {words.map((word, index) => (
              <span key={`${word}-${index}`}>
                <span className="landing-rise inline-block" style={rise(80 + index * 60)}>
                  {word}
                </span>
                {index < words.length - 1 ? " " : null}
              </span>
            ))}
          </h1>
          <p className="landing-rise mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl" style={rise(80 + words.length * 60)}>
            {t("subtitle")}
          </p>

          <div className="landing-rise mt-9 flex flex-col gap-3 sm:flex-row sm:items-center" style={rise(160 + words.length * 60)}>
            <Button asChild size="lg" className="landing-cta shadow-[0_14px_30px_-16px] shadow-primary/60">
              <Link href={signedIn ? "/app" : "/login"}>
                {signedIn ? nav("goToApp") : t("primaryCta")}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-background/60 backdrop-blur-sm">
              <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon data-icon="inline-start" />
                {t("githubCta")}
              </a>
            </Button>
          </div>

          <p className="landing-rise mt-5 max-w-md text-sm leading-relaxed text-muted-foreground" style={rise(220 + words.length * 60)}>
            {t("note")}
          </p>

          <ul className="landing-rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium" style={rise(270 + words.length * 60)}>
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

/** Two half-discs, one per person, that together make one circle. */
function PartyHalves({ left, right }: { left: string; right: string }) {
  return (
    <svg viewBox="0 0 120 64" className="h-14 w-[6.5rem] shrink-0 sm:h-16 sm:w-[7.5rem]" aria-hidden focusable="false">
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

/** A personal record: one side only, and nobody else sees it. */
function PersonalCard() {
  const t = useTranslations("landing.hero.visual");
  const intlLocale = intlLocales[useLocale() as Locale] ?? intlLocales.es;

  return (
    <div data-tilt="8" className="landing-glass relative rounded-2xl border border-border/60 p-4">
      <p className="flex items-center gap-2 text-[0.68rem] font-semibold tracking-[0.14em] whitespace-nowrap text-personal uppercase">
        <SymmetryMark state="one" className="size-3.5" />
        {t("personal")}
      </p>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t("personalConcept")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("personalWho")}</p>
        </div>
        <span className="tabular font-display text-lg leading-none font-medium text-owe">{formatMoney(PERSONAL, CURRENCY, intlLocale)}</span>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 border-t border-border/70 pt-2.5 text-[0.7rem] text-muted-foreground">
        <Lock className="size-3 shrink-0" />
        {t("onlyYou")}
      </p>
    </div>
  );
}

/**
 * The 3D sphere — two halves that close into one as the visitor scrolls or hovers — with two
 * frosted cards over it: a shared agreement both sides accepted, and a personal record.
 */
function HeroVisual() {
  const t = useTranslations("landing.hero.visual");
  const people = useTranslations("landing.people");
  const intlLocale = intlLocales[useLocale() as Locale] ?? intlLocales.es;
  const money = (minor: bigint) => formatMoney(minor, CURRENCY, intlLocale);
  const progress = percentOf(CONFIRMED, TOTAL);

  return (
    <div className="relative mx-auto w-full max-w-md lg:mr-0 lg:max-w-none">
      <div data-hero-visual role="img" aria-label={t("label")} className="relative">
        {/* The stage: the sphere, centred in a box a little shorter than it is wide. */}
        <div className="relative aspect-[1/0.8]">
          <div aria-hidden className="landing-hero-glow absolute top-1/2 left-1/2 -z-10 aspect-square w-full -translate-x-1/2 -translate-y-1/2" />
          <HeroScene className="absolute top-1/2 left-1/2 -z-10 aspect-square w-[125%] -translate-x-1/2 -translate-y-1/2" />

          {/* A personal record: one side only, floating over the half that is still "personal". */}
          <div className="landing-rise absolute top-[9%] -left-8 z-20 hidden w-[47%] sm:block lg:-left-5" style={rise(700)}>
            <div className="landing-float">
              <PersonalCard />
            </div>
          </div>
        </div>

        {/* The agreement both sides accepted, over the lower half of the sphere. */}
        <div className="landing-rise relative z-10 -mt-[24%] ml-auto w-[96%] sm:-mt-[27%] sm:w-[84%]" style={rise(450)}>
          <div data-tilt="5" className="landing-glass relative rounded-3xl border border-border/60 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-agreed uppercase">
                <SymmetryMark state="both" className="size-4" />
                {t("agreement")}
              </span>
              <Chip tone="agreed">{t("status")}</Chip>
            </div>
            <p className="mt-3 font-display text-xl leading-tight font-medium sm:text-2xl">{t("concept")}</p>

            <div className="mt-4 flex items-center justify-center gap-3 sm:gap-4">
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

            <div className="mt-5 border-t border-border/70 pt-4">
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm text-muted-foreground">{t("confirmedBalance")}</span>
                <span className="tabular font-display text-[1.7rem] leading-none font-medium sm:text-3xl">{money(TOTAL - CONFIRMED)}</span>
              </div>
              <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="landing-grow-x h-full rounded-full bg-agreed" style={{ width: `${progress}%`, "--grow-delay": "1100ms" } as React.CSSProperties} />
              </div>
              <p className="tabular mt-2 text-xs text-muted-foreground">{t("progress", { paid: money(CONFIRMED), total: money(TOTAL) })}</p>
              <div className="mt-3.5 flex items-center justify-between gap-3 rounded-xl bg-waiting-soft px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <SymmetryMark state="waiting" className="size-4 text-waiting" />
                  {t("awaiting")}
                </span>
                <span className="tabular font-medium">{money(AWAITING)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* On phones the personal record sits under the agreement instead, so the sphere stays visible. */}
        <div className="landing-rise relative z-20 -mt-5 w-[88%] sm:hidden" style={rise(650)}>
          <PersonalCard />
        </div>
      </div>
      <ExampleCaption className="landing-rise mt-4" />
    </div>
  );
}
