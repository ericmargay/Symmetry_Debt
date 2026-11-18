import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Money } from "@/components/shared/money";
import { Ticks, type TickState } from "@/components/shared/ticks";
import { cn } from "@/lib/utils";
import type { CurrencyTotals, SideTotals } from "@/server/services/overview";

/** One line inside a half of the card: label on top, amount below (narrow on phones). */
function Line({ ticks, label, hint, minor, currency, muted }: { ticks: TickState; label: string; hint?: string; minor: bigint; currency: string; muted?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5", muted && "opacity-75")} title={hint}>
      <span className="flex min-w-0 items-start gap-1.5 text-[0.72rem] leading-tight font-semibold text-ink-muted">
        <Ticks state={ticks} className={ticks === "both" ? "mt-px text-[oklch(0.82_0.1_265)]" : "mt-px text-ink-muted"} />
        <span>{label}</span>
      </span>
      <Money minor={minor} currency={currency} className="font-display text-[0.95rem] font-bold" />
    </div>
  );
}

/**
 * One half of the position (what I owe / what I am owed). The headline is what is firm —
 * personal records plus what both sides validated — broken down right below so the two
 * confirmation levels are never mixed. Payments still waiting and proposals are listed apart
 * and never added in.
 */
function Half({ side, totals, currency }: { side: "iOwe" | "owedToMe"; totals: SideTotals; currency: string }) {
  const t = useTranslations("dashboard.totals");
  const firm = totals.recordedMinor + totals.confirmedMinor;
  const owes = side === "iOwe";
  const Icon = owes ? ArrowUpRight : ArrowDownLeft;

  return (
    <article className="flex min-w-0 flex-col gap-3 bg-white/[0.06] p-4 sm:p-5">
      <header className="flex items-start gap-2 text-sm leading-tight font-semibold">
        <span
          className={cn("grid size-6 shrink-0 place-items-center rounded-full", owes ? "bg-[oklch(0.72_0.16_30)] text-[oklch(0.25_0.06_30)]" : "bg-[oklch(0.8_0.14_158)] text-[oklch(0.25_0.06_158)]")}
          aria-hidden
        >
          <Icon className="size-3.5" strokeWidth={2.6} />
        </span>
        <span className="pt-0.5">{t(side)}</span>
      </header>
      <p className="font-display text-[1.45rem] leading-none font-extrabold tracking-tight sm:text-[1.75rem]">
        <Money minor={firm} currency={currency} display />
      </p>
      <div className="flex flex-col gap-2.5 border-t border-white/10 pt-3">
        <Line ticks="personal" label={t("recorded")} minor={totals.recordedMinor} currency={currency} />
        <Line ticks="both" label={t("confirmed")} minor={totals.confirmedMinor} currency={currency} />
        {totals.awaitingMinor > 0n && <Line ticks="one" label={t("awaiting")} hint={t("awaitingHint")} minor={totals.awaitingMinor} currency={currency} muted />}
        {totals.proposedMinor > 0n && <Line ticks="one" label={t("proposed")} hint={t("proposedHint")} minor={totals.proposedMinor} currency={currency} muted />}
      </div>
    </article>
  );
}

/** "Tu posición": the account card of the home screen, one per currency. */
export function PositionCard({ totals, showCurrencyHeading }: { totals: CurrencyTotals; showCurrencyHeading: boolean }) {
  const t = useTranslations("dashboard.totals");
  const net = totals.netMinor;

  return (
    <section aria-label={t("currency", { currency: totals.currency })} className="account-card relative isolate overflow-hidden p-5 sm:p-8">
      <SymmetryMark state="both" className="pointer-events-none absolute -top-16 -right-16 -z-10 size-72 text-white opacity-[0.06]" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-muted">{t("net")}</p>
          <p className="mt-2 font-display text-[2.6rem] leading-none font-extrabold tracking-tight sm:text-6xl">
            <Money minor={net < 0n ? -net : net} currency={totals.currency} sign={net < 0n ? "−" : undefined} display />
          </p>
          <p
            className={cn(
              "mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
              net > 0n ? "bg-[oklch(0.8_0.14_158)] text-[oklch(0.25_0.06_158)]" : net < 0n ? "bg-[oklch(0.75_0.15_30)] text-[oklch(0.25_0.06_30)]" : "bg-white/15 text-ink-foreground",
            )}
          >
            {net > 0n ? t("netPositive") : net < 0n ? t("netNegative") : t("netZero")}
          </p>
        </div>
        {showCurrencyHeading && <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-bold">{totals.currency}</span>}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
        <Half side="iOwe" totals={totals.iOwe} currency={totals.currency} />
        <Half side="owedToMe" totals={totals.owedToMe} currency={totals.currency} />
      </div>

      <p className="mt-4 max-w-xl text-xs leading-relaxed text-ink-muted">
        {t("netHint")}
        {totals.settledCount > 0 && ` ${t("settledCount", { count: totals.settledCount })}.`}
      </p>
    </section>
  );
}
