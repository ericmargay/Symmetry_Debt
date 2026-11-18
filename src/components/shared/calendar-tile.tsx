import { useLocale } from "next-intl";
import type { ISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** A due date as a small calendar sheet: month on top, day big. Never shifts with the time zone. */
export function CalendarTile({ iso, tone = "neutral", className }: { iso: ISODate; tone?: "neutral" | "danger" | "today"; className?: string }) {
  const locale = useLocale() as Locale;
  const date = new Date(`${iso}T12:00:00.000Z`);
  const month = new Intl.DateTimeFormat(intlLocales[locale] ?? intlLocales.es, { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return (
    <span
      className={cn(
        "flex w-12 shrink-0 flex-col overflow-hidden rounded-xl border text-center leading-none",
        tone === "danger" ? "border-destructive/30" : tone === "today" ? "border-waiting/50" : "border-border",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "py-1 text-[0.65rem] font-bold",
          tone === "danger" ? "bg-destructive text-white" : tone === "today" ? "bg-waiting text-white" : "bg-foreground text-background",
        )}
      >
        {month}
      </span>
      <span className="bg-card py-1.5 font-display text-lg font-extrabold tabular">{date.getUTCDate()}</span>
    </span>
  );
}
