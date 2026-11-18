"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AmountInput } from "@/components/shared/amount-input";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAYMENT_METHODS } from "@/domain/payment-methods";
import { MAX_HISTORICAL_PAYMENTS } from "@/domain/terms";

export interface PreviousPaymentDraft {
  amount: string;
  effectiveDate: string;
  method: string;
  note: string;
}

/** Payments that were made before the debt was written down here. */
export function PreviousPaymentsEditor({
  value,
  onChange,
  currency,
  minDate,
  maxDate,
  error,
}: {
  value: PreviousPaymentDraft[];
  onChange: (value: PreviousPaymentDraft[]) => void;
  currency: string;
  minDate?: string;
  maxDate?: string;
  error?: string;
}) {
  const t = useTranslations();
  const update = (index: number, patch: Partial<PreviousPaymentDraft>) =>
    onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ol className="flex flex-col gap-3">
          {value.map((payment, index) => (
            <li key={index} className="grid gap-2 rounded-2xl border border-border bg-muted/50 p-3.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <AmountInput
                aria-label={t("wizard.review.previousAmount", { index: index + 1 })}
                currency={currency}
                value={payment.amount}
                onChange={(amount) => update(index, { amount })}
                showPreview={false}
              />
              <Input
                type="date"
                min={minDate}
                max={maxDate}
                aria-label={t("wizard.review.previousDate", { index: index + 1 })}
                value={payment.effectiveDate}
                onChange={(event) => update(index, { effectiveDate: event.target.value })}
              />
              <NativeSelect
                aria-label={t("wizard.review.previousMethod", { index: index + 1 })}
                value={payment.method}
                onChange={(event) => update(index, { method: event.target.value })}
              >
                <option value="">{t("labels.method.none")}</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`labels.method.${method}`)}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("wizard.review.removePrevious", { index: index + 1 })}
                onClick={() => onChange(value.filter((_, position) => position !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
              <Input
                className="sm:col-span-3"
                maxLength={280}
                placeholder={t("wizard.review.notePlaceholder")}
                aria-label={t("wizard.review.previousNote", { index: index + 1 })}
                value={payment.note}
                onChange={(event) => update(index, { note: event.target.value })}
              />
            </li>
          ))}
        </ol>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value.length >= MAX_HISTORICAL_PAYMENTS}
          onClick={() => onChange([...value, { amount: "", effectiveDate: maxDate ?? "", method: "", note: "" }])}
        >
          <Plus aria-hidden />
          {t("wizard.review.addPrevious")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
