import { ChevronRight, Link2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContactFormButton } from "@/components/people/contact-form";
import { PersonTotalsView } from "@/components/people/person-totals";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/app/people/${person.id}`}
                className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors outline-none hover:border-ring/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{person.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1" title={person.linked ? t("linkedHint") : t("privateHint")}>
                        {person.linked && <Link2 className="size-3 text-agreed" aria-hidden />}
                        {person.linked ? t("linked") : t("private")}
                      </span>
                      {person.archived && <span className="rounded-full bg-muted px-1.5 py-0.5">{t("archived")}</span>}
                      {person.pendingCount > 0 && <span className="rounded-full bg-waiting-soft px-1.5 py-0.5 font-medium text-waiting">{t("pending", { count: person.pendingCount })}</span>}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <PersonTotalsView totals={person.totals} />
                {(person.personalCount > 0 || person.sharedCount > 0) && (
                  <p className="mt-auto text-xs text-muted-foreground">
                    {t("counts", { personal: person.personalCount, shared: person.sharedCount, both: person.personalCount > 0 && person.sharedCount > 0 ? "yes" : "no" })}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link
          href={showArchived ? "/app/people" : "/app/people?archived=1"}
          className="rounded text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showArchived ? t("hideArchived") : t("showArchived")}
        </Link>
      </p>
    </>
  );
}
