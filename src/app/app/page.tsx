import { ArrowRight, CalendarClock, HandCoins, Landmark, Mail, Plus, ReceiptText, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/dashboard/activity-list";
import { PositionCard } from "@/components/dashboard/totals";
import { DebtList, DebtRow } from "@/components/debts/debt-row";
import { CalendarTile } from "@/components/shared/calendar-tile";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/page-header";
import { SupportHint } from "@/components/shared/support";
import { Ticks } from "@/components/shared/ticks";
import { Button } from "@/components/ui/button";
import { formatISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getDashboard, type DueItem } from "@/server/services/overview";
import { listAllDebts } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("metaTitle") };
}

function SectionTitle({ id, title, count, action }: { id: string; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 id={id} className="flex items-center gap-2 text-lg font-extrabold">
        {title}
        {count !== undefined && count > 0 && <span className="tabular rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-full text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
      {label}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** A due instalment as a card: a calendar sheet, who and how much. */
async function DueCard({ item, today }: { item: DueItem; today: boolean }) {
  const t = await getTranslations("dashboard");
  const overdue = item.state === "OVERDUE";
  return (
    <Link
      href={`/app/debts/${item.debtId}`}
      className={cn(
        "surface flex w-[15.5rem] shrink-0 snap-start flex-col gap-3 p-4 transition-transform outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring sm:w-auto",
        overdue && "border-destructive/30",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <CalendarTile iso={item.dueDate} tone={overdue ? "danger" : today ? "today" : "neutral"} />
        <Ticks state={item.mode === "PERSONAL" ? "personal" : "both"} className="mt-1 text-base" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{item.concept}</span>
        <span className="block truncate text-xs text-muted-foreground">{item.role === "DEBTOR" ? t("duePay", { name: item.counterpartyName }) : t("dueCollect", { name: item.counterpartyName })}</span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <Money minor={item.remainingMinor} currency={item.currency} className={cn("font-display text-lg font-extrabold tracking-tight", overdue ? "text-destructive" : item.role === "DEBTOR" ? "text-owe" : "text-owed")} />
        <span className={cn("text-[0.7rem] font-bold", overdue ? "text-destructive" : "text-muted-foreground")}>
          {overdue ? t("dueOverdue") : t("upcoming.installment", { sequence: item.sequence })}
        </span>
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const [actor, t, locale] = await Promise.all([requireActor(), getTranslations("dashboard"), getLocale()]);
  const intlLocale = intlLocales[locale as Locale] ?? intlLocales.es;
  const [dashboard, allDebts] = await Promise.all([getDashboard(actor, "all"), listAllDebts(actor)]);
  const firstName = (actor.name ?? actor.email.split("@")[0]).split(" ")[0];
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: actor.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  const header = (
    <header className="mb-6">
      <p className="text-sm font-semibold text-muted-foreground">{t("subtitleShort")}</p>
      <h1 className="mt-1 font-display text-[2rem] leading-tight font-extrabold tracking-tight sm:text-[2.4rem]">{t("greeting", { name: firstName })}</h1>
    </header>
  );

  const invitations = dashboard.invitations.length > 0 && (
    <section aria-label={t("invitations.title")} className="mb-6 flex flex-col gap-2">
      {dashboard.invitations.map((invitation) => (
        <div key={invitation.id} className="surface flex flex-wrap items-center justify-between gap-3 border-primary/30 p-4">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground" aria-hidden>
              <Mail className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{t("invitations.item", { name: invitation.proposerName })}</span>
              <span className="block text-xs text-muted-foreground">{t("invitations.expires", { date: formatISODate(invitation.expiresOn, intlLocale) })}</span>
            </span>
          </span>
          <Button asChild size="sm">
            <Link href={`/invite/${invitation.id}`}>{t("invitations.review")}</Link>
          </Button>
        </div>
      ))}
    </section>
  );

  if (!dashboard.hasAnyDebt) {
    return (
      <>
        {header}
        {invitations}
        <EmptyState
          icon={<HandCoins />}
          title={t("empty.title")}
          text={t("empty.text")}
          action={
            <Button asChild size="lg">
              <Link href="/app/debts/new">
                <Plus aria-hidden />
                {t("empty.action")}
              </Link>
            </Button>
          }
          footnote={<SupportHint />}
        />
      </>
    );
  }

  const quick = [
    { href: "/app/debts/new", label: t("quick.newDebt"), icon: Plus, primary: true },
    { href: "/app/debts", label: t("quick.pay"), icon: ReceiptText, primary: false },
    { href: "/app/people", label: t("quick.people"), icon: Users, primary: false },
    { href: "/app/accounts", label: t("quick.accounts"), icon: Landmark, primary: false },
  ];
  const due = [...dashboard.overdue, ...dashboard.upcoming];
  const openDebts = allDebts
    .filter((item) => item.status === "ACTIVE" || item.status === "DISPUTED" || item.proposalOnly)
    .sort((a, b) => (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"));

  return (
    <>
      {header}
      {invitations}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-4">
            {dashboard.totals.length === 0 ? (
              <p className="surface px-5 py-8 text-center text-sm text-muted-foreground">{t("totals.noAmounts")}</p>
            ) : (
              dashboard.totals.map((totals) => <PositionCard key={totals.currency} totals={totals} showCurrencyHeading={dashboard.totals.length > 1} />)
            )}

            <nav aria-label={t("quick.label")} className="grid grid-cols-4 gap-2 sm:max-w-lg">
              {quick.map(({ href, label, icon: Icon, primary }) => (
                <Link key={href} href={href} className="group flex flex-col items-center gap-2 rounded-2xl py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span
                    className={cn(
                      "grid size-14 place-items-center rounded-full transition-transform group-hover:-translate-y-0.5",
                      primary ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_var(--primary)]" : "bg-card text-foreground shadow-[var(--shadow-card)]",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs leading-tight font-semibold">{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {dashboard.needsMe.length > 0 && (
            <section aria-labelledby="needs-me">
              <div className="surface overflow-hidden border-waiting/50">
                <div className="flex items-center gap-3 bg-waiting-soft px-4 py-3.5 sm:px-5">
                  <span className="grid size-9 place-items-center rounded-full bg-waiting text-white" aria-hidden>
                    <Ticks state="one" className="text-white" />
                  </span>
                  <span className="min-w-0">
                    <h2 id="needs-me" className="text-base font-extrabold">
                      {t("needsMe.title")}
                    </h2>
                    <p className="text-xs text-foreground/70">{t("needsMe.count", { count: dashboard.needsMe.length })}</p>
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {dashboard.needsMe.map((item) => (
                    <li key={item.id}>
                      <DebtRow item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section aria-labelledby="upcoming-title">
            <SectionTitle id="upcoming-title" title={t("upcoming.title")} />
            {due.length > 0 ? (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
                {due.slice(0, 6).map((item) => (
                  <DueCard key={`${item.debtId}-${item.sequence}`} item={item} today={item.dueDate === todayIso} />
                ))}
              </div>
            ) : (
              <p className="surface flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden />
                {t("upcoming.empty")}
              </p>
            )}
          </section>

          <section aria-labelledby="debts-title">
            <SectionTitle id="debts-title" title={t("debtsList.title")} action={<SeeAll href="/app/debts" label={t("debtsList.all")} />} />
            {openDebts.length > 0 ? <DebtList items={openDebts.slice(0, 6)} /> : <p className="surface px-5 py-4 text-sm text-muted-foreground">{t("debtsList.empty")}</p>}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          {dashboard.waitingOnOther.length > 0 && (
            <section aria-labelledby="waiting-title">
              <SectionTitle id="waiting-title" title={t("waiting.title")} count={dashboard.waitingOnOther.length} />
              <DebtList items={dashboard.waitingOnOther} />
            </section>
          )}
          <section aria-labelledby="recent-title">
            <SectionTitle id="recent-title" title={t("recent.title")} action={<SeeAll href="/app/activity" label={t("recent.all")} />} />
            <div className="surface p-2.5">
              {dashboard.recent.length > 0 ? <ActivityList items={dashboard.recent} timeZone={actor.timeZone} /> : <p className="p-3 text-sm text-muted-foreground">{t("recent.empty")}</p>}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

