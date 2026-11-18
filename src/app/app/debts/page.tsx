import { HandCoins, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DebtList } from "@/components/debts/debt-row";
import { FilterTabs } from "@/components/debts/filter-tabs";
import { Money } from "@/components/shared/money";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { SupportHint } from "@/components/shared/support";
import { Ticks, type TickState } from "@/components/shared/ticks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEBT_FILTERS, filterDebts, isDebtFilter, listAllDebts, matchesDebtFilter, type DebtFilter, type DebtListItem } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("debts"))("metaTitle") };
}

const LEGEND: Array<{ key: "personal" | "one_side" | "both_sides" | "proposal"; ticks: TickState }> = [
  { key: "personal", ticks: "personal" },
  { key: "one_side", ticks: "one" },
  { key: "both_sides", ticks: "both" },
  { key: "proposal", ticks: "one" },
];

/** Open amounts of a group, per currency (never added across currencies). */
function totalsByCurrency(items: DebtListItem[]): Array<{ currency: string; minor: bigint }> {
  const map = new Map<string, bigint>();
  for (const item of items) {
    if (item.proposalOnly || (item.status !== "ACTIVE" && item.status !== "DISPUTED")) continue;
    map.set(item.currency, (map.get(item.currency) ?? 0n) + item.outstandingMinor);
  }
  return [...map].map(([currency, minor]) => ({ currency, minor }));
}

function Group({ title, items, tone }: { title: string; items: DebtListItem[]; tone: "owe" | "owed" }) {
  if (items.length === 0) return null;
  const totals = totalsByCurrency(items);
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className={cn("size-2.5 rounded-full", tone === "owe" ? "bg-owe" : "bg-owed")} aria-hidden />
          {title}
          <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{items.length}</span>
        </h2>
        <span className="flex flex-wrap justify-end gap-x-3 text-sm font-bold">
          {totals.map((total) => (
            <Money key={total.currency} minor={total.minor} currency={total.currency} className={tone === "owe" ? "text-owe" : "text-owed"} />
          ))}
        </span>
      </div>
      <DebtList items={items} />
    </section>
  );
}

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const [actor, params, t] = await Promise.all([requireActor(), searchParams, getTranslations("debts")]);
  const filter: DebtFilter = isDebtFilter(params.filter) ? params.filter : "all";
  const all = await listAllDebts(actor);
  const items = filterDebts(all, filter);
  const counts = Object.fromEntries(DEBT_FILTERS.map((key) => [key, all.filter((item) => matchesDebtFilter(item, key)).length])) as Record<DebtFilter, number>;
  const iOwe = items.filter((item) => item.role === "DEBTOR");
  const owedToMe = items.filter((item) => item.role !== "DEBTOR");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/app/debts/new">
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </Button>
        }
      />
      <FilterTabs basePath="/app/debts" current={filter} counts={counts} filters={[...DEBT_FILTERS]} />

      {items.length === 0 ? (
        <EmptyState
          icon={<HandCoins />}
          title={t(`empty.${filter}.title`)}
          text={t(`empty.${filter}.text`)}
          action={
            filter === "all" || filter === "personal" || filter === "shared" ? (
              <Button asChild>
                <Link href="/app/debts/new">
                  <Plus aria-hidden />
                  {t("new")}
                </Link>
              </Button>
            ) : undefined
          }
          footnote={all.length === 0 ? <SupportHint /> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Group title={t("groups.iOwe")} items={iOwe} tone="owe" />
          <Group title={t("groups.owedToMe")} items={owedToMe} tone="owed" />
        </div>
      )}

      <details className="surface mt-8 px-5 py-4 text-sm">
        <summary className="cursor-pointer rounded font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("legend.title")}</summary>
        <ul className="mt-3 flex flex-col gap-2.5 text-muted-foreground">
          {LEGEND.map(({ key, ticks }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="grid w-6 shrink-0 place-items-center pt-0.5">
                <Ticks state={ticks} className="text-base" />
              </span>
              <span>{t(`legend.${key}`)}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
