import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/shared/money";
import { Ticks } from "@/components/shared/ticks";
import { cn } from "@/lib/utils";
import type { PersonTotals } from "@/server/services/overview";

/**
 * What I owe this person and what they owe me, side by side, per currency. Debts in opposite
 * directions are never offset against each other: each one stands on its own.
 */
export function PersonTotalsView({ totals, detailed = false, compact = false }: { totals: PersonTotals[]; detailed?: boolean; compact?: boolean }) {
  const t = useTranslations("people");
  if (totals.length === 0) return <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>{t("nothingOpen")}</p>;

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-0.5 sm:items-end">
        {totals.map((total) => {
          const owe = total.iOweRecordedMinor + total.iOweConfirmedMinor;
          const owed = total.owedToMeRecordedMinor + total.owedToMeConfirmedMinor;
          return (
            <div key={total.currency} className="flex flex-wrap gap-x-3 text-sm font-bold">
              {owe > 0n && (
                <span className="inline-flex items-center gap-1 text-owe" title={t("iOwe")}>
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only">{t("iOwe")}</span>
                  <Money minor={owe} currency={total.currency} />
                </span>
              )}
              {owed > 0n && (
                <span className="inline-flex items-center gap-1 text-owed" title={t("owesMe")}>
                  <ArrowDownLeft className="size-3.5" aria-hidden />
                  <span className="sr-only">{t("owesMe")}</span>
                  <Money minor={owed} currency={total.currency} />
                </span>
              )}
              {owe === 0n && owed === 0n && <span className="font-medium text-muted-foreground">{t("nothingOpen")}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {totals.map((total) => {
        const owe = total.iOweRecordedMinor + total.iOweConfirmedMinor;
        const owed = total.owedToMeRecordedMinor + total.owedToMeConfirmedMinor;
        return (
          <dl key={total.currency} className="grid grid-cols-2 gap-3">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="size-3.5 text-owe" aria-hidden />
                {t("iOwe")}
              </dt>
              <dd className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-owe">
                <Money minor={owe} currency={total.currency} />
              </dd>
              {detailed && owe > 0n && (
                <dd className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {total.iOweRecordedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <Ticks state="personal" />
                      <Money minor={total.iOweRecordedMinor} currency={total.currency} /> {t("detail.recorded")}
                    </span>
                  )}
                  {total.iOweConfirmedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <Ticks state="both" />
                      <Money minor={total.iOweConfirmedMinor} currency={total.currency} /> {t("detail.confirmed")}
                    </span>
                  )}
                </dd>
              )}
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDownLeft className="size-3.5 text-owed" aria-hidden />
                {t("owesMe")}
              </dt>
              <dd className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-owed">
                <Money minor={owed} currency={total.currency} />
              </dd>
              {detailed && owed > 0n && (
                <dd className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {total.owedToMeRecordedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <Ticks state="personal" />
                      <Money minor={total.owedToMeRecordedMinor} currency={total.currency} /> {t("detail.recorded")}
                    </span>
                  )}
                  {total.owedToMeConfirmedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <Ticks state="both" />
                      <Money minor={total.owedToMeConfirmedMinor} currency={total.currency} /> {t("detail.confirmed")}
                    </span>
                  )}
                </dd>
              )}
            </div>
          </dl>
        );
      })}
    </div>
  );
}
