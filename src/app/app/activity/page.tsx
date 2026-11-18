import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/dashboard/activity-list";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { Ticks } from "@/components/shared/ticks";
import { Button } from "@/components/ui/button";
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
        <>
          <ul className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
            <li className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[var(--shadow-card)]">
              <Ticks state="personal" /> {t("legendPersonal")}
            </li>
            <li className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[var(--shadow-card)]">
              <Ticks state="one" /> {t("legendOne")}
            </li>
            <li className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[var(--shadow-card)]">
              <Ticks state="both" /> {t("legendBoth")}
            </li>
          </ul>
          <div className="surface p-3 sm:p-4">
            <ActivityList items={page} timeZone={actor.timeZone} />
          </div>
          {hasMore && (
            <Button asChild variant="outline" className="mt-5">
              <Link href={`/app/activity?before=${page[page.length - 1].at.getTime()}`}>{t("older")}</Link>
            </Button>
          )}
        </>
      )}
    </>
  );
}
