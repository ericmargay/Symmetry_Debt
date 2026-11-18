import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/dashboard/activity-list";
import { DebtList } from "@/components/debts/debt-row";
import { InitialAvatar } from "@/components/shared/initial-avatar";
import { Ticks } from "@/components/shared/ticks";
import { ContactFormButton } from "@/components/people/contact-form";
import { PersonActions } from "@/components/people/person-actions";
import { PersonTotalsView } from "@/components/people/person-totals";
import { PageHeader, Section } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { isAppError } from "@/server/errors";
import { getPersonView } from "@/server/services/overview";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("people"))("metaTitle") };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor, t] = await Promise.all([params, requireActor(), getTranslations("people")]);
  const person = await getPersonView(actor, id).catch((error: unknown) => {
    if (isAppError(error)) notFound();
    throw error;
  });

  return (
    <>
      <PageHeader
        back={{ href: "/app/people", label: t("title") }}
        title={
          <span className="flex items-center gap-3.5">
            <InitialAvatar name={person.name} tone="primary" className="size-12 text-base" />
            <span className="min-w-0 break-words">{person.name}</span>
          </span>
        }
        description={
          <span className="inline-flex items-center gap-1.5" title={person.linked ? t("linkedHint") : t("privateHint")}>
            <Ticks state={person.linked ? "both" : "personal"} />
            {person.linked ? t("linked") : t("private")}
            {person.archived && ` · ${t("archived")}`}
          </span>
        }
        actions={
          <>
            {!person.archived && (
              <Button asChild>
                <Link href={`/app/debts/new?person=${person.id}`}>
                  <Plus aria-hidden />
                  {t("detail.newDebt", { name: person.name })}
                </Link>
              </Button>
            )}
            <ContactFormButton contact={{ id: person.id, name: person.name, email: person.email, phone: person.phone, notes: person.notes }} />
            <PersonActions id={person.id} name={person.name} archived={person.archived} canDelete={person.canDelete} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section description={t("detail.sideBySide")}>
            <PersonTotalsView totals={person.totals} detailed />
          </Section>

          <Section title={t("detail.debts", { name: person.name })}>
            {person.debts.length > 0 ? (
              <DebtList items={person.debts} showPerson={false} className="-mx-5 -mb-5 rounded-t-none border-x-0 border-b-0 shadow-none sm:-mx-6 sm:-mb-6" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.noDebts")}</p>
            )}
          </Section>

          <Section title={t("detail.history")}>
            {person.recent.length > 0 ? <ActivityList items={person.recent} timeZone={actor.timeZone} /> : <p className="text-sm text-muted-foreground">{t("detail.noHistory")}</p>}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section title={t("detail.contact")}>
            {person.email || person.phone ? (
              <dl className="flex flex-col gap-2 text-sm">
                {person.email && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("form.email")}</dt>
                    <dd className="break-all">{person.email}</dd>
                  </div>
                )}
                {person.phone && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("form.phone")}</dt>
                    <dd>{person.phone}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.noContact")}</p>
            )}
          </Section>
          {person.notes && (
            <Section title={t("detail.notes")}>
              <p className="text-sm leading-relaxed whitespace-pre-line">{person.notes}</p>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
