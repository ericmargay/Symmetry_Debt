import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/shared/money";
import { WeightMark, type Weight } from "@/components/shared/weight-badge";
import { cn } from "@/lib/utils";
import type { CurrencyTotals, SideTotals } from "@/server/services/overview";

function Line({ weight, label, hint, minor, currency, muted }: { weight: Weight; label: string; hint?: string; minor: bigint; currency: string; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", muted && "text-muted-foreground")}>
      <span className="flex min-w-0 items-center gap-2" title={hint}>
        <WeightMark weight={weight} />
        <span className="truncate">{label}</span>
      </span>
      <Money minor={minor} currency={currency} className={cn(!muted && "font-medium")} />
    </div>
  );
}

/**
 * One side of the totals (what I owe / what I am owed).
 *
 * The headline is what is firm — personal records plus what both sides confirmed — and it is
 * broken down right below, each part with its own mark. Payments still to be confirmed and
 * amounts in proposals are listed apart and never added in.
 */
function SideCard({ side, totals, currency }: { side: "iOwe" | "owedToMe"; totals: SideTotals; currency: string }) {
  const t = useTranslations("dashboard.totals");
  const firm = totals.recordedMinor + totals.confirmedMinor;
  const owes = side === "iOwe";
  const Icon = owes ? ArrowUpRight : ArrowDownLeft;
  const share = firm > 0n ? Number((totals.recordedMinor * 100n) / firm) : 0;

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={cn("grid size-7 place-items-center rounded-full", owes ? "bg-owe-soft text-owe" : "bg-owed-soft text-owed")} aria-hidden>
          <Icon className="size-4" />
        </span>
        {t(side)}
      </header>
      <p className={cn("mt-3 text-3xl leading-none font-semibold tracking-tight", owes ? "text-owe" : "text-owed")}>
        <Money minor={firm} currency={currency} />
      </p>

      {/* How much of that is one person's record and how much both sides confirmed. */}
      <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {firm > 0n && (
          <>
            <span className="bg-personal" style={{ width: `${share}%` }} />
            <span className="bg-agreed" style={{ width: `${100 - share}%` }} />
          </>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Line weight="personal" label={t("recorded")} minor={totals.recordedMinor} currency={currency} />
        <Line weight="both_sides" label={t("confirmed")} minor={totals.confirmedMinor} currency={currency} />
      </div>

      {(totals.awaitingMinor > 0n || totals.proposedMinor > 0n) && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-border pt-3">
          {totals.awaitingMinor > 0n && (
            <Line weight="one_side" label={t("awaiting")} hint={t("awaitingHint")} minor={totals.awaitingMinor} currency={currency} muted />
          )}
          {totals.proposedMinor > 0n && (
            <Line weight="proposal" label={t("proposed")} hint={t("proposedHint")} minor={totals.proposedMinor} currency={currency} muted />
          )}
        </div>
      )}
    </article>
  );
}

export function TotalsGrid({ totals, showCurrencyHeading }: { totals: CurrencyTotals; showCurrencyHeading: boolean }) {
  const t = useTranslations("dashboard.totals");
  const net = totals.netMinor;
  return (
    <section aria-label={t("currency", { currency: totals.currency })}>
      {showCurrencyHeading && <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("currency", { currency: totals.currency })}</h2>}
      <div className="grid gap-3 md:grid-cols-3">
        <SideCard side="iOwe" totals={totals.iOwe} currency={totals.currency} />
        <SideCard side="owedToMe" totals={totals.owedToMe} currency={totals.currency} />
        <article className="rounded-2xl border border-border bg-card p-5">
          <header className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-hidden>
              <Scale className="size-4" />
            </span>
            {t("net")}
          </header>
          <p className="mt-3 text-3xl leading-none font-semibold tracking-tight">
            <Money minor={net < 0n ? -net : net} currency={totals.currency} sign={net < 0n ? "−" : undefined} />
          </p>
          <p className={cn("mt-2 text-sm font-medium", net > 0n ? "text-owed" : net < 0n ? "text-owe" : "text-muted-foreground")}>
            {net > 0n ? t("netPositive") : net < 0n ? t("netNegative") : t("netZero")}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("netHint")}</p>
          {totals.settledCount > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("settledCount", { count: totals.settledCount })}</p>}
        </article>
      </div>
    </section>
  );
}
