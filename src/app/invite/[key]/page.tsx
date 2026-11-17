import { ArrowDownLeft, ArrowUpRight, CircleAlert, Clock, Info, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { signOutAction } from "@/actions/auth";
import { Logo } from "@/components/brand/logo";
import { AttachmentList } from "@/components/debts/detail/attachments";
import { TermsSummary } from "@/components/debts/detail/terms-summary";
import { InvitationResponse } from "@/components/debts/invitation-response";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { WeightBadge } from "@/components/shared/weight-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatISODate, toISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";
import { isAppError } from "@/server/errors";
import { LIMITS } from "@/server/rate-limit";
import { getInvitationView } from "@/server/services/invitations";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("invite"))("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/app" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <LanguageSwitch />
      </header>
      <main id="content" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20">
        {children}
      </main>
    </div>
  );
}

/**
 * The page behind a share link.
 *
 * It always requires signing in first, and it shows the proposal — never anything else of the
 * proposer's — only while the invitation can actually be answered.
 */
export default async function InvitePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const actor = await requireActor(`/invite/${key}`);
  const [t, locale] = await Promise.all([getTranslations("invite"), getLocale()]);
  const intlLocale = intlLocales[locale as Locale] ?? intlLocales.es;

  let limited = false;
  try {
    await LIMITS.invitationLookup(actor.id);
  } catch (error) {
    if (!isAppError(error)) throw error;
    limited = true;
  }
  const view = limited ? null : await getInvitationView(actor, key);

  if (view?.state === "member") redirect(`/app/debts/${view.debtId}`);

  if (!view || view.state !== "open" || !view.proposal) {
    const state = view?.state ?? "invalid";
    const known = state === "expired" || state === "revoked" || state === "used" || state === "declined" || state === "closed" || state === "own" ? state : "invalid";
    return (
      <Frame>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            {known === "expired" ? <Clock className="size-5" /> : <CircleAlert className="size-5" />}
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">{t(`state.${known}Title`)}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`state.${known}`)}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {known === "own" && view ? (
              <Button asChild>
                <Link href={`/app/debts/${view.debtId}`}>{t("state.goToDebt")}</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/app">{t("state.goToApp")}</Link>
              </Button>
            )}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{t("signedInAs", { email: actor.email })}</p>
        </div>
      </Frame>
    );
  }

  const { proposal, proposer } = view;
  const iOwe = view.role === "DEBTOR";

  return (
    <Frame>
      <div className="mt-4 flex flex-col gap-5">
        <div>
          <WeightBadge weight="proposal" />
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold">{t("heading", { name: proposer.name })}</h1>
          <p className="mt-2 flex items-center gap-2 text-[0.95rem] text-muted-foreground">
            {iOwe ? <ArrowUpRight className="size-4 shrink-0 text-owe" aria-hidden /> : <ArrowDownLeft className="size-4 shrink-0 text-owed" aria-hidden />}
            {iOwe ? t("roleDebtor", { name: proposer.name }) : t("roleCreditor", { name: proposer.name })}
          </p>
        </div>

        <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Avatar className="size-10">
            {proposer.image && <AvatarImage src={proposer.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">{proposer.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{t("from", { name: proposer.name })}</p>
            {proposer.email && <p className="break-all text-muted-foreground">{t("fromEmail", { email: proposer.email })}</p>}
            <p className="text-xs text-muted-foreground">
              {t("sentOn", { date: formatISODate(toISODate(proposal.proposedAt), intlLocale) })} · {t("expires", { date: formatISODate(toISODate(view.expiresAt), intlLocale) })}
            </p>
          </div>
        </section>

        {proposal.changeNote && (
          <blockquote className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm whitespace-pre-line">{proposal.changeNote}</blockquote>
        )}

        <section aria-label={t("heading", { name: proposer.name })} className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid="invitation-terms">
          <TermsSummary terms={proposal.terms} />
          {proposal.receipts.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">{t("receipts")}</p>
              <AttachmentList items={proposal.receipts.map((receipt) => ({ ...receipt, canDelete: false }))} invite={key} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t("what.title")}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>{t("what.a")}</li>
            <li>{t("what.b")}</li>
            <li>{t("what.c")}</li>
          </ul>

          <p className="mt-4 flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-foreground/80">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {view.identity === "matches"
              ? t("identity.matches")
              : view.identity === "different_account"
                ? t("identity.different_account", { hint: view.intendedFor ?? "", name: proposer.name })
                : t("identity.not_specified", { name: proposer.name })}
          </p>

          <div className="mt-5">
            <InvitationResponse invitationKey={key} versionId={proposal.versionId} termsHash={proposal.termsHash} proposerName={proposer.name} />
          </div>

          <form action={signOutAction} className="mt-5 flex flex-wrap items-center gap-x-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>{t("signedInAs", { email: actor.email })}</span>
            <button type="submit" className="rounded underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              {t("switchAccount")}
            </button>
          </form>
        </section>
      </div>
    </Frame>
  );
}
