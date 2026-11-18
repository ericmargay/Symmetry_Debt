import { useLocale } from "next-intl";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** An exact amount in the reader's locale. Works in server and client components. */
export function Money({
  minor,
  currency,
  className,
  sign,
  display = false,
}: {
  minor: bigint | string;
  currency: string;
  className?: string;
  /** Prefix for amounts that are being added or taken away in a list of movements. */
  sign?: "+" | "−";
  /** Statement style for big figures: the cents set smaller, as banks print balances. */
  display?: boolean;
}) {
  const locale = useLocale() as Locale;
  const value = typeof minor === "string" ? BigInt(minor) : minor;
  const text = formatMoney(value, currency, intlLocales[locale] ?? intlLocales.es);
  const parts = display ? /^(.*\d)([.,]\d{1,3})(\D*)$/.exec(text) : null;
  if (parts) {
    return (
      <span className={cn("tabular whitespace-nowrap", className)}>
        {sign}
        {parts[1]}
        <span className="text-[0.55em] font-semibold tracking-normal opacity-75">{parts[2]}</span>
        {parts[3]}
      </span>
    );
  }
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {sign}
      {text}
    </span>
  );
}
