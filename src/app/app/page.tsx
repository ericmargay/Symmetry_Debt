import { CalendarClock, HandCoins, Mail, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/dashboard/activity-list";
import { TotalsGrid } from "@/components/dashboard/totals";
import { DebtRow } from "@/components/debts/debt-row";
import { FilterTabs } from "@/components/debts/filter-tabs";
import { DateText } from "@/components/shared/dates";
import { Money } from "@/components/shared/money";
import { EmptyState, PageHeader, Section } from "@/components/shared/page-header";
import { SupportHint } from "@/components/shared/support";
import { WeightMark } from "@/components/shared/weight-badge";
import { Button } from "@/components/ui/button";
import { formatISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";
import { getDashboard, type DueItem } from "@/server/services/overview";
import { isDebtFilter } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("metaTitle") };
}

async function DueList({ items }: { items: DueItem[] }) {
  const t = await getTranslations("dashboard");
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={`${item.debtId}-${item.sequence}`}>
          <Link href={`/app/debts/${item.debtId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
            <WeightMark weight={item.mode === "PERSONAL" ? "personal" : "both_sides"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.concept}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.role === "DEBTOR" ? t("duePay", { name: item.counterpartyName }) : t("dueCollect", { name: item.counterpartyName })} ·{" "}
                <DateText iso={item.dueDate} style="short" />
              </span>
            </span>
            <Money minor={item.remainingMinor} currency={item.currency} className={item.state === "OVERDUE" ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const [actor, params, t, locale] = await Promise.all([requireActor(), searchParams, getTranslations("dashboard"), getLocale()]);
  const intlLocale = intlLocales[locale as Locale] ?? intlLocales.es;
  const filter = isDebtFilter(params.filter) && params.filter !== "archived" ? params.filter : "all";
  const dashboard = await getDashboard(actor, filter);
  const firstName = (actor.name ?? actor.email.split("@")[0]).split(" ")[0];

  const header = <PageHeader title={t("greeting", { name: firstName })} description={t("subtitle")} />;

  const invitations = dashboard.invitations.length > 0 && (
    <Section title={t("invitations.title")} className="mb-6 border-primary/30 bg-secondary/40">
      <ul className="flex flex-col gap-2">
        {dashboard.invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <Mail className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t("invitations.item", { name: invitation.proposerName })}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("invitations.expires", { date: formatISODate(invitation.expiresOn, intlLocale) })}
                </span>
              </span>
            </span>
            <Button asChild size="sm">
              <Link href={`/invite/${invitation.id}`}>{t("invitations.review")}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
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

  return (
    <>
      {header}
      {invitations}
      <FilterTabs basePath="/app" current={filter} counts={dashboard.counts} />

      <div className="flex flex-col gap-6">
        {dashboard.totals.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">{t("totals.noAmounts")}</p>
        ) : (
          dashboard.totals.map((totals) => <TotalsGrid key={totals.currency} totals={totals} showCurrencyHeading={dashboard.totals.length > 1} />)
        )}

        {dashboard.needsMe.length > 0 && (
          <Section title={t("needsMe.title")}>
            <div className="flex flex-col gap-2">
              {dashboard.needsMe.map((item) => (
                <DebtRow key={item.id} item={item} />
              ))}
            </div>
          </Section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {dashboard.overdue.length > 0 && (
            <Section title={t("overdue.title")} className="border-destructive/30">
              <DueList items={dashboard.overdue} />
            </Section>
          )}
          <Section title={t("upcoming.title")}>
            {dashboard.upcoming.length > 0 ? (
              <DueList items={dashboard.upcoming} />
            ) : (
              <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden />
                {t("upcoming.empty")}
              </p>
            )}
          </Section>
          {dashboard.waitingOnOther.length > 0 && (
            <Section title={t("waiting.title")}>
              <div className="flex flex-col gap-2">
                {dashboard.waitingOnOther.map((item) => (
                  <DebtRow key={item.id} item={item} />
                ))}
              </div>
            </Section>
          )}
          <Section
            title={t("recent.title")}
            action={
              <Link href="/app/activity" className="rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {t("recent.all")}
              </Link>
            }
          >
            {dashboard.recent.length > 0 ? (
              <ActivityList items={dashboard.recent} timeZone={actor.timeZone} />
            ) : (
              <p className="py-2 text-sm text-muted-foreground">{t("recent.empty")}</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
