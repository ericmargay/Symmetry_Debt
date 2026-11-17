import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GithubIcon } from "@/components/brand/github-icon";
import { DeleteAccountButton, ExportButton, SessionsButton } from "@/components/settings/danger-zone";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { PageHeader, Section } from "@/components/shared/page-header";
import { SupportLinks, SupportWays } from "@/components/shared/support-links";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { defaultLocale, intlLocales, isLocale, type Locale } from "@/i18n/config";
import { donationLinks, repoUrl } from "@/lib/site";
import { prisma } from "@/server/db";
import { emailEnabled } from "@/server/mail";
import { getPreferences } from "@/server/services/account";
import { requireActor } from "@/server/session";
import packageJson from "../../../../package.json";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.settings"))("metaTitle") };
}

export default async function SettingsPage() {
  const [actor, t, donate, locale] = await Promise.all([requireActor(), getTranslations("pages.settings"), getTranslations("donate"), getLocale()]);
  const [preferences, user] = await Promise.all([getPreferences(actor), prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { createdAt: true } })]);
  const links = donationLinks();
  const since = new Intl.DateTimeFormat(intlLocales[locale as Locale] ?? intlLocales.es, { dateStyle: "long", timeZone: actor.timeZone }).format(user.createdAt);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex max-w-3xl flex-col gap-8">
        <Section title={t("profile.title")} description={t("profile.text")}>
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {actor.image && <AvatarImage src={actor.image} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback className="bg-secondary text-lg font-semibold text-secondary-foreground">{(actor.name ?? actor.email).slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <dl className="min-w-0 text-sm">
              <dt className="sr-only">{t("profile.name")}</dt>
              <dd className="truncate text-base font-medium">{actor.name ?? actor.email.split("@")[0]}</dd>
              <dt className="sr-only">{t("profile.email")}</dt>
              <dd className="break-all text-muted-foreground">{actor.email}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">{t("profile.memberSince", { date: since })}</dd>
            </dl>
          </div>
        </Section>

        <PreferencesForm
          emailEnabled={emailEnabled()}
          initial={{
            locale: isLocale(preferences.locale) ? preferences.locale : defaultLocale,
            timeZone: preferences.timeZone,
            defaultCurrency: preferences.defaultCurrency,
            remindersEnabled: preferences.remindersEnabled,
            emailActionRequired: preferences.emailActionRequired,
            emailActivity: preferences.emailActivity,
            emailReminders: preferences.emailReminders,
          }}
        />

        <Section title={t("security.title")} description={t("security.text")}>
          <SessionsButton />
        </Section>

        <Section title={t("data.title")}>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-semibold">{t("data.exportTitle")}</h3>
              <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">{t("data.exportText")}</p>
              <ExportButton />
            </div>
            <div className="border-t border-border pt-6">
              <h3 className="text-sm font-semibold">{t("data.deleteTitle")}</h3>
              <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">{t("data.deleteText")}</p>
              <DeleteAccountButton email={actor.email} />
            </div>
          </div>
        </Section>

        <Section title={t("about.title")} description={t("about.text")}>
          <p className="text-xs text-muted-foreground">{t("about.version", { version: packageJson.version })}</p>
          <a
            href={repoUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GithubIcon />
            {t("about.source")}
          </a>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">{t("about.supportTitle")}</h3>
            <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">
              {donate("lead")} {donate("optional")}
            </p>
            {links.length > 0 && (
              <>
                <SupportLinks links={links} />
                <p className="mt-3 mb-5 text-xs leading-relaxed text-muted-foreground">{donate("external")}</p>
              </>
            )}
            <p className="mb-2 text-sm font-medium">{links.length > 0 ? donate("ways.title") : donate("ways.titleOnly")}</p>
            <SupportWays repoUrl={repoUrl()} className="max-w-md" />
          </div>
        </Section>
      </div>
    </>
  );
}
