import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/dashboard/activity-list";
import { EmptyState, PageHeader, Section } from "@/components/shared/page-header";
import { WeightMark } from "@/components/shared/weight-badge";
import { listActivity } from "@/server/services/overview";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.activity"))("metaTitle") };
}

const PAGE_SIZE = 40;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const [actor, params, t] = await Promise.all([requireActor(), searchParams, getTranslations("pages.activity")]);
  const beforeMs = params.before && /^[0-9]{10,16}$/.test(params.before) ? Number(params.before) : null;
  const items = await listActivity(actor, { limit: PAGE_SIZE + 1, before: beforeMs ? new Date(beforeMs) : undefined });
  const page = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {page.length === 0 ? (
        <EmptyState icon={<History />} title={t("empty.title")} text={t("empty.text")} />
      ) : (
        <Section>
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 border-b border-border pb-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <WeightMark weight="personal" /> {t("legendPersonal")}
            </li>
            <li className="flex items-center gap-1.5">
              <WeightMark weight="one_side" /> {t("legendOne")}
            </li>
            <li className="flex items-center gap-1.5">
              <WeightMark weight="both_sides" /> {t("legendBoth")}
            </li>
          </ul>
          <ActivityList items={page} timeZone={actor.timeZone} />
          {hasMore && (
            <Link
              href={`/app/activity?before=${page[page.length - 1].at.getTime()}`}
              className="mt-4 inline-block rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("older")}
            </Link>
          )}
        </Section>
      )}
    </>
  );
}
