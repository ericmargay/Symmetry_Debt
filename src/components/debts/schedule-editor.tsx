"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AmountInput } from "@/components/shared/amount-input";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatISODate, isISODate } from "@/domain/dates";
import { formatMoney, toInputValue } from "@/domain/money";
import { generateSchedule, MAX_INSTALLMENTS, SCHEDULE_TYPES, type ScheduleType } from "@/domain/schedule";
import { intlLocales, type Locale } from "@/i18n/config";
import { readAmount } from "@/schemas/common";

export interface InstallmentDraft {
  dueDate: string;
  amount: string;
}

export interface ScheduleDraft {
  type: ScheduleType;
  /** SINGLE: the due date. WEEKLY / MONTHLY: the first one. */
  firstDate: string;
  /** WEEKLY / MONTHLY: how many payments. */
  count: string;
  /** CUSTOM: the instalments as typed. */
  installments: InstallmentDraft[];
}

export const EMPTY_SCHEDULE: ScheduleDraft = { type: "NONE", firstDate: "", count: "3", installments: [] };

/**
 * The instalments a schedule draft stands for, as they are sent to the server.
 * Generated plans are computed here with the same function the server validates against.
 */
export function resolveInstallments(draft: ScheduleDraft, totalMinor: bigint | null, currency: string): InstallmentDraft[] {
  if (draft.type === "NONE") return [];
  if (draft.type === "CUSTOM") return draft.installments;
  if (totalMinor === null || !isISODate(draft.firstDate)) return [];
  const count = draft.type === "SINGLE" ? 1 : Number.parseInt(draft.count, 10);
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) return [];
  try {
    return generateSchedule({ type: draft.type, totalMinor, firstDueDate: draft.firstDate, count }).map((installment) => ({
      dueDate: installment.dueDate,
      amount: toInputValue(installment.amountMinor, currency),
    }));
  } catch {
    return [];
  }
}

export function ScheduleEditor({
  value,
  onChange,
  currency,
  totalMinor,
  minDate,
  error,
  idPrefix = "schedule",
}: {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  currency: string;
  /** Amount the schedule has to cover, when it is already known. */
  totalMinor: bigint | null;
  minDate?: string;
  error?: string;
  idPrefix?: string;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const money = (minor: bigint) => formatMoney(minor, currency, intlLocale);
  const generated = value.type === "WEEKLY" || value.type === "MONTHLY" ? resolveInstallments(value, totalMinor, currency) : [];

  let assigned = 0n;
  let assignedValid = true;
  if (value.type === "CUSTOM") {
    for (const installment of value.installments) {
      const amount = readAmount(installment.amount, currency);
      if ("error" in amount) assignedValid = false;
      else assigned += amount.minor;
    }
  }
  const difference = totalMinor === null ? null : totalMinor - assigned;

  const setType = (type: ScheduleType) => {
    if (type === "CUSTOM" && value.installments.length === 0) {
      // Start from whatever plan was on screen, so nothing has to be typed twice.
      const seed = resolveInstallments(value, totalMinor, currency);
      onChange({ ...value, type, installments: seed.length > 0 ? seed : [{ dueDate: value.firstDate, amount: "" }] });
      return;
    }
    onChange({ ...value, type });
  };

  const updateInstallment = (index: number, patch: Partial<InstallmentDraft>) =>
    onChange({ ...value, installments: value.installments.map((item, position) => (position === index ? { ...item, ...patch } : item)) });

  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards
        name={`${idPrefix}-type`}
        legend={t("wizard.plan.question")}
        value={value.type}
        onChange={setType}
        columns={3}
        compact
        choices={SCHEDULE_TYPES.map((type) => ({ value: type, title: t(`labels.schedule.${type}`) }))}
      />

      {(value.type === "SINGLE" || value.type === "WEEKLY" || value.type === "MONTHLY") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={value.type === "SINGLE" ? t("wizard.plan.dueDate") : t("wizard.plan.firstDate")}>
            {(field) => (
              <Input {...field} type="date" min={minDate} value={value.firstDate} onChange={(event) => onChange({ ...value, firstDate: event.target.value })} />
            )}
          </FormField>
          {value.type !== "SINGLE" && (
            <FormField label={t("wizard.plan.count")}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_INSTALLMENTS}
                  value={value.count}
                  onChange={(event) => onChange({ ...value, count: event.target.value })}
                />
              )}
            </FormField>
          )}
        </div>
      )}

      {(value.type === "WEEKLY" || value.type === "MONTHLY") && (
        <div className="rounded-2xl border border-border bg-muted/50 p-4">
          {totalMinor === null ? (
            <p className="text-sm text-muted-foreground">{t("wizard.plan.needAmount")}</p>
          ) : generated.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("wizard.plan.preview")}</p>
              <ol className="grid max-h-56 gap-1 overflow-y-auto text-sm sm:grid-cols-2">
                {generated.map((installment, index) => (
                  <li key={`${installment.dueDate}-${index}`} className="tabular flex justify-between gap-3 rounded-md bg-card px-2.5 py-1.5">
                    <span className="text-muted-foreground">
                      {index + 1}. {formatISODate(installment.dueDate, intlLocale)}
                    </span>
                    <span className="font-medium">{formatMoney(readAmountOrZero(installment.amount, currency), currency, intlLocale)}</span>
                  </li>
                ))}
              </ol>
              <Button type="button" variant="link" size="sm" className="mt-2 h-auto px-0" onClick={() => onChange({ ...value, type: "CUSTOM", installments: generated })}>
                {t("wizard.plan.editInstallments")}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {value.type === "CUSTOM" && (
        <div className="flex flex-col gap-2">
          <ol className="flex flex-col gap-2">
            {value.installments.map((installment, index) => (
              <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                <Input
                  type="date"
                  min={minDate}
                  aria-label={t("wizard.plan.installmentDate", { sequence: index + 1 })}
                  value={installment.dueDate}
                  onChange={(event) => updateInstallment(index, { dueDate: event.target.value })}
                />
                <AmountInput
                  aria-label={t("wizard.plan.installmentAmount", { sequence: index + 1 })}
                  currency={currency}
                  value={installment.amount}
                  onChange={(amount) => updateInstallment(index, { amount })}
                  showPreview={false}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("wizard.plan.removeInstallment", { sequence: index + 1 })}
                  onClick={() => onChange({ ...value, installments: value.installments.filter((_, position) => position !== index) })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={value.installments.length >= MAX_INSTALLMENTS}
              onClick={() => onChange({ ...value, installments: [...value.installments, { dueDate: "", amount: difference !== null && difference > 0n && assignedValid ? toInputValue(difference, currency) : "" }] })}
            >
              <Plus aria-hidden />
              {t("wizard.plan.addInstallment")}
            </Button>
            {totalMinor !== null && assignedValid && difference !== null && (
              <p className={`tabular text-sm ${difference === 0n ? "text-owed" : "text-destructive"}`} aria-live="polite">
                {difference === 0n
                  ? t("wizard.plan.balanced")
                  : difference > 0n
                    ? t("wizard.plan.remaining", { amount: money(difference) })
                    : t("wizard.plan.exceeded", { amount: money(-difference) })}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function readAmountOrZero(text: string, currency: string): bigint {
  const parsed = readAmount(text, currency);
  return "error" in parsed ? 0n : parsed.minor;
}
