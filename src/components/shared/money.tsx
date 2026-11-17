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
}: {
  minor: bigint | string;
  currency: string;
  className?: string;
  /** Prefix for amounts that are being added or taken away in a list of movements. */
  sign?: "+" | "−";
}) {
  const locale = useLocale() as Locale;
  const value = typeof minor === "string" ? BigInt(minor) : minor;
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {sign}
      {formatMoney(value, currency, intlLocales[locale] ?? intlLocales.es)}
    </span>
  );
}
