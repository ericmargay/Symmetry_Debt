import { useTranslations } from "next-intl";
import { DateText } from "@/components/shared/dates";
import { Money } from "@/components/shared/money";
import type { InstallmentState, ScheduleProgress } from "@/domain/schedule";
import { cn } from "@/lib/utils";

const STATE_STYLE: Record<InstallmentState, string> = {
  PAID: "bg-owed-soft text-owed",
  PARTIAL: "bg-waiting-soft text-waiting",
  OVERDUE: "bg-destructive/10 text-destructive",
  DUE_TODAY: "bg-waiting-soft text-waiting",
  UPCOMING: "bg-muted text-muted-foreground",
  WAIVED: "bg-muted text-muted-foreground",
};

/** Each instalment with what was scheduled, what has been paid towards it and what is left. */
export function ScheduleTable({ progress, currency, showProgress }: { progress: ScheduleProgress; currency: string; showProgress: boolean }) {
  const t = useTranslations();
  if (progress.rows.length === 0 && progress.unscheduledMinor === 0n) return null;

  return (
    <ol className="flex flex-col divide-y divide-border">
      {progress.rows.map((row) => (
        <li key={row.sequence} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          <span className="tabular w-6 shrink-0 text-sm text-muted-foreground">{row.sequence}.</span>
          <span className="min-w-28 flex-1">
            <span className="block text-sm font-medium">
              <DateText iso={row.dueDate} />
            </span>
            {showProgress && (
              <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATE_STYLE[row.state])}>{t(`labels.installmentState.${row.state}`)}</span>
            )}
          </span>
          <dl className="tabular grid shrink-0 grid-cols-3 gap-x-4 text-right text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("detail.schedule.scheduled")}</dt>
              <dd className={cn(row.scheduledMinor !== row.originalMinor && "text-muted-foreground")}>
                <Money minor={row.scheduledMinor} currency={currency} />
              </dd>
            </div>
            {showProgress ? (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("detail.schedule.paid")}</dt>
                  <dd>
                    <Money minor={row.paidMinor} currency={currency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("detail.schedule.remaining")}</dt>
                  <dd className={cn("font-semibold", row.state === "OVERDUE" && "text-destructive")}>
                    <Money minor={row.remainingMinor} currency={currency} />
                  </dd>
                </div>
              </>
            ) : (
              <span className="col-span-2" />
            )}
          </dl>
        </li>
      ))}
      {progress.unscheduledMinor > 0n && (
        <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <span title={t("detail.schedule.unscheduledHint")} className="text-muted-foreground">
            {t("detail.schedule.unscheduled")}
          </span>
          <Money minor={progress.unscheduledMinor - progress.unscheduledPaidMinor} currency={currency} className="font-semibold" />
        </li>
      )}
    </ol>
  );
}
