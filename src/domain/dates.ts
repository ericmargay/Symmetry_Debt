/**
 * Calendar dates.
 *
 * A due date or the day a payment was made is a calendar date, not an instant: "March 5th" must
 * stay March 5th whatever the time zone of the server or the browser. Those dates travel through
 * the app as ISO strings ("2026-03-05") and are stored in DATE columns.
 */

export type ISODate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(iso: ISODate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function build(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** DATE column value (UTC midnight) → ISO string. */
export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** ISO string → the UTC-midnight Date Prisma expects for DATE columns. */
export function fromISODate(iso: ISODate): Date {
  if (!isISODate(iso)) throw new RangeError(`Not an ISO date: ${iso}`);
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const { year, month, day } = parts(iso);
  return toISODate(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Adds calendar months keeping the day of the month of the ORIGINAL date where possible:
 * Jan 31 + 1 month → Feb 28, + 2 months → Mar 31 (not Mar 28).
 */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { year, month, day } = parts(iso);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return build(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** Negative when a < b, zero when equal, positive when a > b. ISO dates sort as text. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = fromISODate(to).getTime() - fromISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Today's calendar date for somebody living in `timeZone`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (isISODate(formatted)) return formatted;
  } catch {
    // Unknown time zone: fall through to UTC.
  }
  return toISODate(now);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

/** "5 mar 2026" / "Mar 5, 2026" — formats a calendar date without shifting it across zones. */
export function formatISODate(
  iso: ISODate,
  intlLocale: string,
  style: "short" | "medium" | "long" = "medium",
): string {
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(intlLocale, { ...options, timeZone: "UTC" }).format(fromISODate(iso));
}
