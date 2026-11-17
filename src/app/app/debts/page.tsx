import { HandCoins, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DebtRow } from "@/components/debts/debt-row";
import { FilterTabs } from "@/components/debts/filter-tabs";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { SupportHint } from "@/components/shared/support";
import { WeightMark, type Weight } from "@/components/shared/weight-badge";
import { Button } from "@/components/ui/button";
import { DEBT_FILTERS, filterDebts, isDebtFilter, listAllDebts, matchesDebtFilter, type DebtFilter } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("debts"))("metaTitle") };
}

const LEGEND: Weight[] = ["personal", "one_side", "both_sides", "proposal"];

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const [actor, params, t] = await Promise.all([requireActor(), searchParams, getTranslations("debts")]);
  const filter: DebtFilter = isDebtFilter(params.filter) ? params.filter : "all";
  const all = await listAllDebts(actor);
  const items = filterDebts(all, filter);
  const counts = Object.fromEntries(DEBT_FILTERS.map((key) => [key, all.filter((item) => matchesDebtFilter(item, key)).length])) as Record<DebtFilter, number>;

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
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <DebtRow key={item.id} item={item} />
          ))}
        </div>
      )}

      <details className="mt-8 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer rounded font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("legend.title")}</summary>
        <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
          {LEGEND.map((weight) => (
            <li key={weight} className="flex items-start gap-2.5">
              <WeightMark weight={weight} className="mt-0.5" />
              <span>{t(`legend.${weight}`)}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
