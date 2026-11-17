import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/shared/money";
import { WeightMark } from "@/components/shared/weight-badge";
import type { PersonTotals } from "@/server/services/overview";

/**
 * What I owe this person and what they owe me, side by side, per currency. Debts in opposite
 * directions are never offset against each other: each one stands on its own.
 */
export function PersonTotalsView({ totals, detailed = false }: { totals: PersonTotals[]; detailed?: boolean }) {
  const t = useTranslations("people");
  if (totals.length === 0) return <p className="text-sm text-muted-foreground">{t("nothingOpen")}</p>;

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
              <dd className="mt-0.5 font-semibold text-owe">
                <Money minor={owe} currency={total.currency} />
              </dd>
              {detailed && owe > 0n && (
                <dd className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {total.iOweRecordedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <WeightMark weight="personal" className="[&_svg]:size-3" />
                      <Money minor={total.iOweRecordedMinor} currency={total.currency} /> {t("detail.recorded")}
                    </span>
                  )}
                  {total.iOweConfirmedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <WeightMark weight="both_sides" className="[&_svg]:size-3" />
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
              <dd className="mt-0.5 font-semibold text-owed">
                <Money minor={owed} currency={total.currency} />
              </dd>
              {detailed && owed > 0n && (
                <dd className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {total.owedToMeRecordedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <WeightMark weight="personal" className="[&_svg]:size-3" />
                      <Money minor={total.owedToMeRecordedMinor} currency={total.currency} /> {t("detail.recorded")}
                    </span>
                  )}
                  {total.owedToMeConfirmedMinor > 0n && (
                    <span className="flex items-center gap-1.5">
                      <WeightMark weight="both_sides" className="[&_svg]:size-3" />
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
