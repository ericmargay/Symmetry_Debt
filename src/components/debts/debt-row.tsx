import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateText } from "@/components/shared/dates";
import { Money } from "@/components/shared/money";
import { DebtStatusBadge } from "@/components/shared/status-badge";
import { WeightBadge } from "@/components/shared/weight-badge";
import { percentOf } from "@/domain/money";
import { cn } from "@/lib/utils";
import type { DebtListItem } from "@/server/services/views";

/** One debt in a list: who, how much is left, how firm that figure is, and what is pending. */
export function DebtRow({ item, showPerson = true }: { item: DebtListItem; showPerson?: boolean }) {
  const t = useTranslations();
  const owes = item.role === "DEBTOR";
  const open = item.status === "ACTIVE" || item.status === "DISPUTED";
  const weight = item.proposalOnly ? "proposal" : item.mode === "PERSONAL" ? "personal" : "both_sides";
  const progress = percentOf(item.paidMinor, item.totalOwedMinor);
  const amount = item.proposalOnly || !open ? item.totalOwedMinor : item.outstandingMinor;

  return (
    <Link
      href={`/app/debts/${item.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors outline-none hover:border-ring/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn("grid size-10 shrink-0 place-items-center rounded-full", owes ? "bg-owe-soft text-owe" : "bg-owed-soft text-owed")}
        aria-hidden
      >
        {owes ? <ArrowUpRight className="size-[1.1rem]" /> : <ArrowDownLeft className="size-[1.1rem]" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{item.concept}</span>
          {item.needsMe && (
            <span className="inline-flex items-center gap-1 rounded-full bg-owe-soft px-2 py-0.5 text-xs font-medium text-owe">
              <TriangleAlert className="size-3" aria-hidden />
              {t("debts.needsYou")}
            </span>
          )}
        </span>
        {showPerson && (
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {owes ? t("labels.role.youOwe", { name: item.counterpartyName }) : t("labels.role.owesYou", { name: item.counterpartyName })}
          </span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <WeightBadge weight={weight} label={item.proposalOnly ? undefined : t(`labels.mode.${item.mode}`)} />
          {(item.status !== "ACTIVE" || item.mode === "SHARED") && item.status !== "ACTIVE" && <DebtStatusBadge status={item.status} />}
          {open && item.overdueCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {t("dashboard.overdue.count", { count: item.overdueCount })}
            </span>
          )}
          {open && item.pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-waiting-soft px-2 py-0.5 text-xs font-medium text-waiting">
              <Clock className="size-3" aria-hidden />
              {t("debts.pendingMovements", { count: item.pendingCount })}
            </span>
          )}
          {open && item.nextDueDate && item.overdueCount === 0 && (
            <span className="text-xs text-muted-foreground">
              {t("debts.nextDue")} <DateText iso={item.nextDueDate} style="short" />
            </span>
          )}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <Money minor={amount} currency={item.currency} className={cn("text-[0.95rem] font-semibold", !open && "text-muted-foreground")} />
        {open && !item.proposalOnly && item.paidMinor > 0n && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className={cn("block h-full rounded-full", item.mode === "PERSONAL" ? "bg-personal" : "bg-agreed")} style={{ width: `${progress}%` }} />
            </span>
            {progress}%
          </span>
        )}
        {item.proposalOnly && <span className="text-xs text-muted-foreground">{t("debts.proposedAmount")}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
