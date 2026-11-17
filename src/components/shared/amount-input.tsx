"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { readAmount } from "@/schemas/common";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Amount field. What is typed is parsed with the same exact parser the server uses, and the
 * interpretation is shown right below ("= $1,500.50") so there is never a doubt about what
 * will be saved.
 */
export function AmountInput({
  value,
  onChange,
  currency,
  className,
  showPreview = true,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  showPreview?: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("validation");
  const parsed = value.trim() === "" ? null : readAmount(value, currency);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative">
        <Input
          {...props}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="tabular pr-14"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>
          {currency}
        </span>
      </div>
      {showPreview && parsed && (
        <p className={cn("tabular text-xs", "error" in parsed ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          {"error" in parsed ? t(parsed.error) : `= ${formatMoney(parsed.minor, currency, intlLocales[locale] ?? intlLocales.es)}`}
        </p>
      )}
    </div>
  );
}
