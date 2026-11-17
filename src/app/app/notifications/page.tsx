import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NotificationList } from "@/components/settings/notification-list";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { listNotifications } from "@/server/services/inbox";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.inbox"))("metaTitle") };
}

export default async function NotificationsPage() {
  const [actor, t] = await Promise.all([requireActor(), getTranslations("pages.inbox")]);
  const items = await listNotifications(actor, 100);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {items.length === 0 ? <EmptyState icon={<Bell />} title={t("empty.title")} text={t("empty.text")} /> : <NotificationList items={items} timeZone={actor.timeZone} />}
      <p className="mt-6 text-sm">
        <Link href="/app/settings#notifications" className="rounded text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {t("preferences")}
        </Link>
      </p>
    </>
  );
}
