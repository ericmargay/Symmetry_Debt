import { ArrowDownLeft, ArrowUpRight, CircleAlert, Clock, Info, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { signOutAction } from "@/actions/auth";
import { Logo } from "@/components/brand/logo";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { AttachmentList } from "@/components/debts/detail/attachments";
import { TermsSummary } from "@/components/debts/detail/terms-summary";
import { InvitationResponse } from "@/components/debts/invitation-response";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { Money } from "@/components/shared/money";
import { Ticks } from "@/components/shared/ticks";
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
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
        <Link href="/app" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <LanguageSwitch />
      </header>
      <main id="content" className="mx-auto w-full max-w-2xl flex-1 px-5 pb-20">
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
        <div className="surface mx-auto mt-10 max-w-md p-6 text-center sm:p-9">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            {known === "expired" ? <Clock className="size-5" /> : <CircleAlert className="size-5" />}
          </span>
          <h1 className="mt-5 font-display text-[1.6rem] leading-tight font-extrabold tracking-tight">{t(`state.${known}Title`)}</h1>
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
  const terms = proposal.terms;
  const installments = terms.installments;
  const equalInstallments = installments.length > 1 && installments.every((installment) => installment.amountMinor === installments[0].amountMinor);
  const dateOf = (iso: string) => formatISODate(iso, intlLocale);

  return (
    <Frame>
      <div className="mt-2 flex flex-col gap-5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
            <Ticks state="one" />
            {t("request")}
          </span>
          <h1 className="mt-3 font-display text-[2rem] leading-[1.1] font-extrabold tracking-tight">{t("heading", { name: proposer.name })}</h1>
        </div>

        {/* Who is asking */}
        <section className="surface flex items-center gap-3.5 p-4">
          <Avatar className="size-12">
            {proposer.image && <AvatarImage src={proposer.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-primary font-display text-base font-extrabold text-primary-foreground">{proposer.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 text-sm">
            <p className="font-bold">{t("from", { name: proposer.name })}</p>
            {proposer.email && <p className="break-all text-muted-foreground">{t("fromEmail", { email: proposer.email })}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("sentOn", { date: formatISODate(toISODate(proposal.proposedAt), intlLocale) })} · {t("expires", { date: formatISODate(toISODate(view.expiresAt), intlLocale) })}
            </p>
          </div>
        </section>

        {/* The amount, like the hero of a transfer request */}
        <section aria-label={t("amountLabel")} className="account-card relative isolate overflow-hidden p-6 sm:p-8">
          <SymmetryMark state="waiting" className="pointer-events-none absolute -top-12 -right-12 -z-10 size-56 text-white opacity-[0.07]" />
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
            {iOwe ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownLeft className="size-4" aria-hidden />}
            {iOwe ? t("roleDebtor", { name: proposer.name }) : t("roleCreditor", { name: proposer.name })}
          </p>
          <p className="mt-3 font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
            <Money minor={terms.principalMinor} currency={terms.currency} display />
          </p>
          <p className="mt-3 text-lg font-semibold break-words">{terms.concept}</p>
          <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-ink-muted">{t("plan")}</p>
              <p className="mt-1 font-semibold">
                {installments.length === 0
                  ? t("noSchedule")
                  : installments.length === 1
                    ? t("single", { date: dateOf(installments[0].dueDate) })
                    : t("scheduleSummary", { count: installments.length, first: dateOf(installments[0].dueDate), last: dateOf(installments[installments.length - 1].dueDate) })}
              </p>
              {equalInstallments && (
                <p className="text-xs text-ink-muted">
                  {t("each")} <Money minor={installments[0].amountMinor} currency={terms.currency} />
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-muted">{t("status")}</p>
              <p className="mt-1 flex items-center gap-1.5 font-semibold">
                <Ticks state="one" className="text-ink-muted" />
                {t("proposerAccepted", { name: proposer.name })}
              </p>
              <p className="text-xs text-ink-muted">{t("waitingYou")}</p>
            </div>
          </div>
        </section>

        {proposal.changeNote && <blockquote className="surface px-4 py-3 text-sm whitespace-pre-line">{proposal.changeNote}</blockquote>}

        <section aria-label={t("details")} className="surface p-5 sm:p-6" data-testid="invitation-terms">
          <h2 className="mb-4 text-[1.05rem] font-bold">{t("details")}</h2>
          <TermsSummary terms={proposal.terms} />
          {proposal.receipts.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-sm font-semibold">{t("receipts")}</p>
              <AttachmentList items={proposal.receipts.map((receipt) => ({ ...receipt, canDelete: false }))} invite={key} />
            </div>
          )}
        </section>

        <section className="surface p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[1.05rem] font-bold">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            {t("what.title")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed text-muted-foreground">
            {(["a", "b", "c"] as const).map((point) => (
              <li key={point} className="flex gap-2.5">
                <Ticks state="both" className="mt-1 text-[0.95rem]" />
                <span>{t(`what.${point}`)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-xs leading-relaxed text-foreground/80">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {view.identity === "matches"
              ? t("identity.matches")
              : view.identity === "different_account"
                ? t("identity.different_account", { hint: view.intendedFor ?? "", name: proposer.name })
                : t("identity.not_specified", { name: proposer.name })}
          </p>

          <div className="mt-6">
            <InvitationResponse invitationKey={key} versionId={proposal.versionId} termsHash={proposal.termsHash} proposerName={proposer.name} />
          </div>

          <form action={signOutAction} className="mt-6 flex flex-wrap items-center gap-x-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>{t("signedInAs", { email: actor.email })}</span>
            <button type="submit" className="rounded font-semibold underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              {t("switchAccount")}
            </button>
          </form>
        </section>
      </div>
    </Frame>
  );
}
