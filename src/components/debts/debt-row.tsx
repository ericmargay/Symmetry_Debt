import { ChevronRight, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateText } from "@/components/shared/dates";
import { InitialAvatar } from "@/components/shared/initial-avatar";
import { Money } from "@/components/shared/money";
import { DebtStatusBadge } from "@/components/shared/status-badge";
import { Ticks } from "@/components/shared/ticks";
import { percentOf } from "@/domain/money";
import { cn } from "@/lib/utils";
import type { DebtListItem } from "@/server/services/views";

/**
 * One debt as a line of a bank statement: who, what for, how firm the figure is (the receipt
 * ticks), what is left and what is pending. Meant to sit inside a `DebtList`.
 */
export function DebtRow({ item, showPerson = true }: { item: DebtListItem; showPerson?: boolean }) {
  const t = useTranslations();
  const owes = item.role === "DEBTOR";
  const open = item.status === "ACTIVE" || item.status === "DISPUTED";
  const progress = percentOf(item.paidMinor, item.totalOwedMinor);
  const amount = item.proposalOnly || !open ? item.totalOwedMinor : item.outstandingMinor;
  const modeLabel = item.proposalOnly ? t("labels.weight.proposal") : t(`labels.mode.${item.mode}`);

  return (
    <Link
      href={`/app/debts/${item.id}`}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
    >
      <InitialAvatar name={item.counterpartyName} tone={!open ? "neutral" : owes ? "owe" : "owed"} direction={owes ? "out" : "in"} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold">{item.concept}</span>
          {item.needsMe && (
            <span className="inline-flex items-center gap-1 rounded-full bg-owe px-2 py-0.5 text-[0.7rem] font-bold text-white">
              <TriangleAlert className="size-3" aria-hidden />
              {t("debts.needsYou")}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Ticks state={item.proposalOnly ? "one" : item.mode === "PERSONAL" ? "personal" : "both"} className="text-[0.95rem]" />
          <span className="truncate">
            {showPerson && (owes ? t("labels.role.youOwe", { name: item.counterpartyName }) : t("labels.role.owesYou", { name: item.counterpartyName }))}
            {showPerson ? " · " : ""}
            {modeLabel}
          </span>
        </span>
        {open && !item.proposalOnly && (
          <span className="mt-2 flex items-center gap-2" aria-hidden>
            <span className="h-1 w-full max-w-44 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", item.mode === "PERSONAL" ? "bg-personal" : "bg-agreed")} style={{ width: `${progress}%` }} />
            </span>
            <span className="tabular text-[0.7rem] font-semibold text-muted-foreground">{progress}%</span>
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <Money
          minor={amount}
          currency={item.currency}
          className={cn("font-display text-[1.02rem] font-extrabold tracking-tight", !open ? "text-muted-foreground" : owes ? "text-owe" : "text-owed")}
        />
        {open && item.overdueCount > 0 ? (
          <span className="text-xs font-semibold text-destructive">{t("dashboard.overdue.count", { count: item.overdueCount })}</span>
        ) : open && item.pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-waiting">
            <Clock className="size-3" aria-hidden />
            {t("debts.pendingMovements", { count: item.pendingCount })}
          </span>
        ) : open && item.nextDueDate ? (
          <span className="text-xs text-muted-foreground">
            {t("debts.nextDue")} <DateText iso={item.nextDueDate} style="short" />
          </span>
        ) : item.proposalOnly ? (
          <span className="text-xs text-muted-foreground">{t("debts.proposedAmount")}</span>
        ) : (
          item.status !== "ACTIVE" && <DebtStatusBadge status={item.status} />
        )}
      </span>
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
    </Link>
  );
}

/** A statement of debts: rows separated by hairlines inside one surface. */
export function DebtList({ items, showPerson = true, className }: { items: DebtListItem[]; showPerson?: boolean; className?: string }) {
  return (
    <ul className={cn("surface divide-y divide-border overflow-hidden", className)}>
      {items.map((item) => (
        <li key={item.id}>
          <DebtRow item={item} showPerson={showPerson} />
        </li>
      ))}
    </ul>
  );
}
