import { ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContactFormButton } from "@/components/people/contact-form";
import { PersonTotalsView } from "@/components/people/person-totals";
import { InitialAvatar } from "@/components/shared/initial-avatar";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { Ticks } from "@/components/shared/ticks";
import { listPeople } from "@/server/services/overview";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("people"))("metaTitle") };
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const [actor, params, t] = await Promise.all([requireActor(), searchParams, getTranslations("people")]);
  const showArchived = params.archived === "1";
  const people = await listPeople(actor, showArchived);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<ContactFormButton />} />

      {people.length === 0 ? (
        <EmptyState icon={<Users />} title={t("empty.title")} text={t("empty.text")} action={<ContactFormButton />} />
      ) : (
        <ul className="surface divide-y divide-border overflow-hidden">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/app/people/${person.id}`}
                className="group flex items-center gap-3.5 px-4 py-4 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
              >
                <InitialAvatar name={person.name} tone={person.archived ? "neutral" : "primary"} className="size-11" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[0.95rem] font-bold">{person.name}</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1" title={person.linked ? t("linkedHint") : t("privateHint")}>
                      <Ticks state={person.linked ? "both" : "personal"} />
                      {person.linked ? t("linked") : t("private")}
                    </span>
                    {(person.personalCount > 0 || person.sharedCount > 0) && (
                      <span className="before:mr-1 before:content-['·'] max-sm:before:hidden">{t("counts", { personal: person.personalCount, shared: person.sharedCount, both: person.personalCount > 0 && person.sharedCount > 0 ? "yes" : "no" })}</span>
                    )}
                    {person.archived && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{t("archived")}</span>}
                    {person.pendingCount > 0 && <span className="rounded-full bg-waiting-soft px-2 py-0.5 font-semibold text-waiting">{t("pending", { count: person.pendingCount })}</span>}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <PersonTotalsView totals={person.totals} compact />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <div className="px-4 pb-4 pl-[4.4rem] sm:hidden">
                <PersonTotalsView totals={person.totals} compact />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link
          href={showArchived ? "/app/people" : "/app/people?archived=1"}
          className="rounded font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showArchived ? t("hideArchived") : t("showArchived")}
        </Link>
      </p>
    </>
  );
}
