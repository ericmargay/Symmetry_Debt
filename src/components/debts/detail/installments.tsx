"use client";

import { Check, Reply, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { decideMovementAction } from "@/actions/movements";
import { usePaymentLauncher } from "@/components/debts/detail/payment-launcher";
import { DateText } from "@/components/shared/dates";
import { ConfirmButton, ReasonButton } from "@/components/shared/dialogs";
import { Money } from "@/components/shared/money";
import { Ticks } from "@/components/shared/ticks";
import type { DebtMode } from "@/domain/balance";
import { formatMoney, percentOf } from "@/domain/money";
import type { InstallmentLedgerRow } from "@/domain/schedule";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { MovementView } from "@/server/services/views";

type Visual = "validated" | "personal" | "waiting" | "partial" | "overdue" | "due" | "open" | "waived";

/** The round check of an instalment. Its fill tells the state at a glance. */
function CheckMark({ visual, percent }: { visual: Visual; percent: number }) {
  const base = "relative grid size-10 shrink-0 place-items-center rounded-full transition-[box-shadow,transform]";
  switch (visual) {
    case "validated":
      return (
        <span className={cn(base, "bg-agreed text-white shadow-[0_6px_14px_-6px_var(--agreed)]")}>
          <Ticks state="both" className="text-white [&_svg]:h-3.5 [&_svg]:w-5" />
        </span>
      );
    case "personal":
      return (
        <span className={cn(base, "bg-personal text-white")}>
          <Check className="size-[1.1rem]" strokeWidth={2.6} aria-hidden />
        </span>
      );
    case "waiting":
      // One half filled: one side said it, the other has not answered yet.
      return (
        <span className={cn(base, "overflow-hidden bg-waiting-soft ring-2 ring-waiting ring-inset")}>
          <span className="absolute inset-y-0 left-0 w-1/2 bg-waiting/70" aria-hidden />
          <Check className="relative size-[1.1rem] text-foreground" strokeWidth={2.6} aria-hidden />
        </span>
      );
    case "partial":
      return (
        <span className={base} style={{ background: `conic-gradient(var(--agreed) ${percent}%, var(--muted) 0)` }}>
          <span className="absolute inset-[3px] rounded-full bg-card" aria-hidden />
          <span className="tabular relative text-[0.62rem] font-bold text-agreed">{percent}%</span>
        </span>
      );
    case "overdue":
      return <span className={cn(base, "ring-2 ring-destructive ring-inset group-hover/check:bg-destructive/10")} />;
    case "waived":
      return <span className={cn(base, "bg-muted")} />;
    default:
      return (
        <span className={cn(base, "ring-2 ring-border ring-inset group-hover/check:bg-secondary group-hover/check:ring-primary")}>
          <Check className="size-[1.1rem] text-primary opacity-0 transition-opacity group-hover/check:opacity-100" strokeWidth={2.6} aria-hidden />
        </span>
      );
  }
}

/**
 * The schedule as a checklist. Each instalment can be ticked when it is paid — in full or in
 * part — and, in a shared agreement, the other side validates it from theirs:
 *
 *   ○  to pay        ◐ ✓  marked by one side, waiting        ● ✓✓  validated by both
 */
export function InstallmentList({
  ledger,
  movements,
  mode,
  currency,
  counterpartyName,
  canMark,
  proposal,
}: {
  ledger: InstallmentLedgerRow[];
  movements: MovementView[];
  mode: DebtMode;
  currency: string;
  counterpartyName: string;
  canMark: boolean;
  proposal: boolean;
}) {
  const t = useTranslations("detail.installments");
  const tm = useTranslations("detail.movements");
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const launcher = usePaymentLauncher();
  const shared = mode === "SHARED";
  const byId = new Map(movements.map((movement) => [movement.id, movement]));
  const money = (minor: bigint) => formatMoney(minor, currency, intlLocale);

  const paidCount = ledger.filter((row) => row.state === "PAID").length;
  const firstOpen = ledger.findIndex((row) => row.openMinor > 0n);
  const shownActions = new Set<string>();

  return (
    <div>
      {!proposal && (
        <div className="mb-4 px-4 sm:px-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{t("progress", { paid: paidCount, total: ledger.length })}</span>
          </div>
          {/* One segment per instalment, coloured by its state. */}
          <div className="mt-2 flex gap-1" aria-hidden>
            {ledger.map((row) => (
              <span
                key={row.sequence}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  row.state === "PAID"
                    ? shared
                      ? "bg-agreed"
                      : "bg-personal"
                    : row.pendingMinor > 0n
                      ? "bg-waiting"
                      : row.paidMinor > 0n
                        ? "bg-agreed/40"
                        : row.state === "OVERDUE"
                          ? "bg-destructive/60"
                          : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
      )}

      <ol className="flex flex-col divide-y divide-border border-t border-border">
        {ledger.map((row, index) => {
          const pendingMovements = row.pending.map((part) => byId.get(part.paymentId)).filter((movement): movement is MovementView => Boolean(movement));
          const byMe = pendingMovements.some((movement) => movement.recordedByMe);
          const percent = row.scheduledMinor > 0n ? percentOf(row.paidMinor + row.pendingMinor, row.scheduledMinor) : 0;

          const visual: Visual = proposal
            ? "open"
            : row.state === "WAIVED"
              ? "waived"
              : row.state === "PAID"
                ? shared
                  ? "validated"
                  : "personal"
                : row.pendingMinor > 0n && row.openMinor === 0n
                  ? "waiting"
                  : row.paidMinor > 0n || row.pendingMinor > 0n
                    ? "partial"
                    : row.state === "OVERDUE"
                      ? "overdue"
                      : row.state === "DUE_TODAY"
                        ? "due"
                        : "open";

          const status: { text: string; tone: string; ticks?: "both" | "one" | "personal" } | null = proposal
            ? null
            : row.state === "WAIVED"
              ? { text: t("state.waived"), tone: "text-muted-foreground" }
              : row.state === "PAID"
                ? shared
                  ? { text: t("state.validated"), tone: "text-agreed", ticks: "both" }
                  : { text: t("state.paidPersonal"), tone: "text-personal", ticks: "personal" }
                : row.paidMinor > 0n
                  ? { text: t("state.partial", { paid: money(row.paidMinor), total: money(row.scheduledMinor) }), tone: "text-agreed" }
                  : row.pendingMinor > 0n
                    ? row.state === "OVERDUE"
                      ? { text: t("state.overdue"), tone: "text-destructive" }
                      : null
                    : row.state === "OVERDUE"
                      ? { text: t("state.overdue"), tone: "text-destructive" }
                      : row.state === "DUE_TODAY"
                        ? { text: t("state.dueToday"), tone: "text-waiting" }
                        : { text: t("state.upcoming"), tone: "text-muted-foreground" };

          const waitingLine =
            !proposal && row.pendingMinor > 0n
              ? byMe
                ? t("state.waitingOther", { amount: money(row.pendingMinor), name: counterpartyName })
                : t("state.waitingMe", { amount: money(row.pendingMinor), name: counterpartyName })
              : null;

          const markable = !proposal && canMark && row.openMinor > 0n && launcher !== null;
          const mark = () =>
            launcher?.markInstallment({
              sequence: row.sequence,
              dueDate: row.dueDate,
              fullMinor: row.cumulativeOpenMinor,
              earlierOpen: ledger.slice(0, index).filter((earlier) => earlier.openMinor > 0n).length,
              firstOpenSequence: ledger[firstOpen]?.sequence ?? row.sequence,
            });

          // Each pending payment gets its buttons once, on the first instalment it reaches.
          const actionable = pendingMovements.filter((movement) => {
            if (shownActions.has(movement.id)) return false;
            shownActions.add(movement.id);
            return movement.actions.length > 0;
          });

          return (
            <li key={row.sequence} className={cn("flex items-start gap-3.5 px-4 py-4 sm:px-5", row.pendingMinor > 0n && !byMe && "bg-waiting-soft/40")} data-testid="installment">
              {markable ? (
                <button type="button" onClick={mark} aria-label={t("mark", { number: row.sequence })} className="group/check rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95">
                  <CheckMark visual={visual} percent={percent} />
                </button>
              ) : (
                <CheckMark visual={visual} percent={percent} />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{t("number", { number: row.sequence })}</p>
                  <Money minor={row.scheduledMinor} currency={currency} className={cn("font-display text-[1.05rem] font-bold", row.state === "PAID" && "text-muted-foreground")} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="text-muted-foreground">
                    {t("due")} <DateText iso={row.dueDate} />
                  </span>
                  {status && (
                    <span className={cn("inline-flex items-center gap-1.5 font-medium", status.tone)}>
                      {status.ticks && <Ticks state={status.ticks} />}
                      {status.text}
                    </span>
                  )}
                </div>
                {waitingLine && (
                  <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium", byMe ? "text-muted-foreground" : "text-foreground")}>
                    <Ticks state="one" />
                    {waitingLine}
                  </p>
                )}

                {(actionable.length > 0 || (markable && index === firstOpen)) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {actionable.map((movement) => {
                      const amount = money(movement.amountMinor);
                      // Two payments waiting on one instalment: say which one each button answers.
                      const suffix = actionable.length > 1 ? ` · ${amount}` : "";
                      return (
                        <span key={movement.id} className="contents">
                          {movement.actions.includes("approve") && (
                            <ConfirmButton
                              trigger={{ label: `${t("validate")}${suffix}`, icon: <Check aria-hidden />, variant: "default" }}
                              title={t("validateTitle")}
                              description={t("validateText", { amount })}
                              confirmLabel={t("validate")}
                              action={() => decideMovementAction(movement.id, "approve")}
                            />
                          )}
                          {movement.actions.includes("reject") && (
                            <ReasonButton
                              trigger={{ label: `${t("notReceived")}${suffix}`, icon: <X aria-hidden /> }}
                              title={t("notReceivedTitle")}
                              description={t("notReceivedHint", { name: counterpartyName })}
                              label={tm("commentLabel")}
                              confirmLabel={t("notReceived")}
                              destructive
                              action={(text) => decideMovementAction(movement.id, "reject", text)}
                            />
                          )}
                          {movement.actions.includes("withdraw") && (
                            <ConfirmButton
                              trigger={{ label: `${t("undo")}${suffix}`, icon: <Reply aria-hidden />, variant: "ghost" }}
                              title={t("undoTitle")}
                              description={t("undoText", { name: counterpartyName })}
                              confirmLabel={t("undo")}
                              action={() => decideMovementAction(movement.id, "withdraw")}
                            />
                          )}
                        </span>
                      );
                    })}
                    {markable && index === firstOpen && actionable.length === 0 && (
                      <button
                        type="button"
                        onClick={mark}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-secondary px-3.5 text-[0.8125rem] font-semibold text-secondary-foreground outline-none hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Check className="size-3.5" aria-hidden />
                        {t("markShort")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!proposal && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-4 pt-3.5 text-xs text-muted-foreground sm:px-5">
          {shared ? (
            <>
              <li className="inline-flex items-center gap-1.5">
                <Ticks state="both" /> {t("legend.validated")}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Ticks state="one" /> {t("legend.waiting")}
              </li>
            </>
          ) : (
            <li className="inline-flex items-center gap-1.5">
              <Ticks state="personal" /> {t("legend.personal")}
            </li>
          )}
          <li className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full ring-2 ring-border ring-inset" aria-hidden /> {t("legend.open")}
          </li>
        </ul>
      )}
    </div>
  );
}
