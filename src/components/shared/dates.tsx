import { useLocale } from "next-intl";
import { formatISODate, type ISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";

/** A calendar date (due date, day of a payment). Never shifts with the time zone. */
export function DateText({ iso, style = "medium", className }: { iso: ISODate; style?: "short" | "medium" | "long"; className?: string }) {
  const locale = useLocale() as Locale;
  return (
    <time dateTime={iso} className={className}>
      {formatISODate(iso, intlLocales[locale] ?? intlLocales.es, style)}
    </time>
  );
}

/** A moment in time (when something was recorded), in the reader's time zone. */
export function DateTimeText({ date, timeZone, className, dateOnly = false }: { date: Date; timeZone: string; className?: string; dateOnly?: boolean }) {
  const locale = useLocale() as Locale;
  const formatted = new Intl.DateTimeFormat(intlLocales[locale] ?? intlLocales.es, {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" }),
    timeZone,
  }).format(date);
  return (
    <time dateTime={date.toISOString()} className={className}>
      {formatted}
    </time>
  );
}
