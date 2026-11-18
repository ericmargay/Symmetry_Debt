import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarClock, CircleCheck, Clock, FileStack, Flag, History, Info, Link2, ListChecks, PartyPopper, TriangleAlert, UserCheck, UserPlus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AttachmentList, UploadButton } from "@/components/debts/detail/attachments";
import {
  BankSharePanel,
  CancellationActions,
  CommentBox,
  DebtMenu,
  DisputeActions,
  DraftActions,
  IdentityActions,
  NewLinkButton,
  PrivateNoteEditor,
  SharedBankDetailsList,
} from "@/components/debts/detail/debt-actions";
import { InstallmentList } from "@/components/debts/detail/installments";
import { MovementsSection } from "@/components/debts/detail/movements-section";
import { MarkPaymentButton, PaymentLauncher } from "@/components/debts/detail/payment-launcher";
import { ProposalCard } from "@/components/debts/detail/proposal-card";
import { TermsSummary } from "@/components/debts/detail/terms-summary";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { DateTimeText } from "@/components/shared/dates";
import { EventText, eventNote, isEventType } from "@/components/shared/event-text";
import { Money } from "@/components/shared/money";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DebtStatusBadge } from "@/components/shared/status-badge";
import { SupportHint } from "@/components/shared/support";
import { DateText } from "@/components/shared/dates";
import { WeightBadge, WeightMark, type Weight } from "@/components/shared/weight-badge";
import { Button } from "@/components/ui/button";
import { formatISODate, todayInTimeZone, toISODate } from "@/domain/dates";
import { isNegotiating } from "@/domain/lifecycle";
import { formatMoney, percentOf } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { env } from "@/server/env";
import { isAppError } from "@/server/errors";
import { emailEnabled } from "@/server/mail";
import { listBankAccounts, maskedLabel } from "@/server/services/bank-accounts";
import { markDebtNotificationsRead } from "@/server/services/inbox";
import { getDebtView, type DebtView } from "@/server/services/views";
import { requireActor } from "@/server/session";

async function loadView(id: string): Promise<{ view: DebtView; actor: Awaited<ReturnType<typeof requireActor>> }> {
  const actor = await requireActor();
  try {
    return { view: await getDebtView(actor, id), actor };
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { view } = await loadView(id);
  return { title: view.terms.concept };
}

function Banner({ tone, icon, title, children, actions }: { tone: "info" | "waiting" | "success" | "danger" | "muted"; icon: React.ReactNode; title?: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  const tones = {
    info: "border-primary/25 bg-secondary/70",
    waiting: "border-waiting/40 bg-waiting-soft/60",
    success: "border-owed/30 bg-owed-soft/60",
    danger: "border-destructive/30 bg-destructive/5",
    muted: "border-border bg-muted/50",
  } as const;
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 text-sm leading-relaxed">
          {title && <p className="font-semibold">{title}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="shrink-0 sm:pl-3">{actions}</div>}
    </div>
  );
}

/** A round quick action on the account card, as banking apps lay them out. */
const quickAction =
  "group flex w-[4.75rem] flex-col items-center gap-1.5 rounded-2xl text-center text-xs leading-tight font-semibold text-ink-foreground outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const quickIcon = "grid size-12 place-items-center rounded-full bg-white/12 ring-1 ring-white/15 transition-colors group-hover:bg-white/22 [&_svg]:size-5";

const TIMELINE_PREVIEW = 12;

export default async function DebtPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ history?: string }> }) {
  const [{ id }, query, t, locale] = await Promise.all([params, searchParams, getTranslations(), getLocale()]);
  const { view, actor } = await loadView(id);
  const intlLocale = intlLocales[locale as Locale] ?? intlLocales.es;
  const money = (minor: bigint) => formatMoney(minor, view.terms.currency, intlLocale);
  await markDebtNotificationsRead(actor, view.id);

  const isPersonal = view.mode === "PERSONAL";
  const owes = view.role === "DEBTOR";
  const name = view.counterparty.name;
  const currency = view.terms.currency;
  const { balance, progress, can, shared, personal } = view;
  const negotiating = !isPersonal && isNegotiating(view.status);
  const weight: Weight = view.termsAreProposal ? "proposal" : isPersonal ? "personal" : "both_sides";
  const paidPercent = percentOf(balance.paidMinor, balance.totalOwedMinor);
  const roomMinor = balance.outstandingMinor - balance.pendingPaymentsMinor - balance.pendingDecreasesMinor;
  const accounts = (await listBankAccounts(actor)).map((account) => ({ id: account.id, alias: account.alias, label: maskedLabel(account) }));

  // Where a payment can be said to have gone: my own accounts when I receive, the ones the
  // other side shared with me when I pay.
  const destinations = owes
    ? (shared?.bankDetails ?? []).map((detail) => ({ id: detail.accountId, label: `${detail.bankName} · ${detail.holderName}` }))
    : accounts.map((account) => ({ id: account.id, label: `${account.alias} · ${account.label}` }));

  const showAllHistory = query.history === "all";
  const timeline = view.timeline.filter((entry) => isEventType(entry.type));
  const visibleTimeline = showAllHistory ? timeline : timeline.slice(0, TIMELINE_PREVIEW);
  const adjustments = balance.increasesMinor - balance.decreasesMinor;
  const ledger = view.ledger;
  const nextOpen = view.termsAreProposal ? null : (ledger.find((row) => row.openMinor > 0n) ?? null);
  const toValidate = view.movements.filter((movement) => movement.actions.includes("approve")).length;
  const movementContext = {
    debtId: view.id,
    mode: view.mode,
    currency,
    counterpartyName: name,
    today: todayInTimeZone(actor.timeZone),
    originDate: view.terms.originDate,
    roomMinor: roomMinor > 0n ? roomMinor : 0n,
    destinations,
    maxUploadMb: env().MAX_UPLOAD_MB,
  };

  return (
    <PaymentLauncher
      context={movementContext}
      next={nextOpen ? { sequence: nextOpen.sequence, dueDate: nextOpen.dueDate, fullMinor: nextOpen.cumulativeOpenMinor, earlierOpen: 0, firstOpenSequence: nextOpen.sequence } : null}
    >
      <PageHeader
        back={{ href: "/app/debts", label: t("detail.back") }}
        title={view.terms.concept}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              {owes ? <ArrowUpRight className="size-4 text-owe" aria-hidden /> : <ArrowDownLeft className="size-4 text-owed" aria-hidden />}
              {owes ? t("labels.role.youOwe", { name }) : t("labels.role.owesYou", { name })}
            </span>
            <WeightBadge weight={weight} label={view.termsAreProposal ? undefined : t(`labels.mode.${view.mode}`)} />
            <DebtStatusBadge status={view.status} />
          </span>
        }
        actions={
          <DebtMenu debtId={view.id} counterpartyName={name} can={can} negotiating={negotiating} />
        }
      />

      <div className="flex flex-col gap-5">
        {/* ── What needs attention right now ─────────────────────────────── */}
        {view.status === "SETTLED" && (
          <Banner tone="success" icon={<PartyPopper className="text-owed" aria-hidden />} title={t("detail.banner.settledTitle")}>
            <p>{isPersonal ? t("detail.banner.settledPersonal") : t("detail.banner.settledShared")}</p>
            <SupportHint className="mt-2" />
          </Banner>
        )}

        {view.status === "CONVERTED" && personal && (
          <Banner
            tone="muted"
            icon={<FileStack aria-hidden />}
            actions={
              personal.conversion && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/app/debts/${personal.conversion.debtId}`}>{t("detail.banner.viewAgreement")}</Link>
                </Button>
              )
            }
          >
            <p>{t("detail.banner.converted")}</p>
          </Banner>
        )}

        {isPersonal && view.status !== "CONVERTED" && personal?.conversion && (
          <Banner
            tone="waiting"
            icon={<Clock className="text-waiting" aria-hidden />}
            actions={
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/debts/${personal.conversion.debtId}`}>{t("detail.banner.viewProposal")}</Link>
              </Button>
            }
          >
            <p>{t("detail.banner.conversionPending")}</p>
          </Banner>
        )}

        {view.status === "CANCELLED" && (
          <Banner tone="muted" icon={<Info aria-hidden />}>
            <p>{isPersonal ? t("detail.banner.cancelledPersonal") : t("detail.banner.cancelledShared", { reason: view.closedReason ?? "other" })}</p>
          </Banner>
        )}

        {shared?.sourceDebtId && (
          <Banner
            tone="muted"
            icon={<Info aria-hidden />}
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link href={`/app/debts/${shared.sourceDebtId}`}>{t("detail.banner.viewRecord")}</Link>
              </Button>
            }
          >
            <p>{t("detail.banner.fromRecord")}</p>
          </Banner>
        )}

        {view.status === "DRAFT" && can.sendDraft && (
          <Banner tone="info" icon={<Info className="text-primary" aria-hidden />} actions={<DraftActions debtId={view.id} suggestedEmail={null} emailEnabled={emailEnabled()} />}>
            <p>{t("detail.banner.draft")}</p>
          </Banner>
        )}

        {shared?.identityToConfirm && can.confirmIdentity && (
          <Banner tone="waiting" icon={<UserCheck className="text-waiting" aria-hidden />} title={t("detail.banner.identityTitle")} actions={<IdentityActions debtId={view.id} />}>
            <p>{t("detail.banner.identityText", { name: shared.identityToConfirm.name })}</p>
            {shared.identityToConfirm.email && <p className="mt-1 font-medium break-all">{t("detail.banner.identityEmail", { email: shared.identityToConfirm.email })}</p>}
          </Banner>
        )}

        {shared?.awaitingMyIdentity && (
          <Banner tone="waiting" icon={<Clock className="text-waiting" aria-hidden />}>
            <p>{t("detail.banner.awaitingIdentity", { name })}</p>
          </Banner>
        )}

        {shared && !view.counterparty.joined && (view.status === "PENDING_APPROVAL" || view.status === "CHANGES_REQUESTED") && can.regenerateInvitation && (
          <Banner
            tone="waiting"
            icon={<Link2 className="text-waiting" aria-hidden />}
            actions={<NewLinkButton debtId={view.id} currentEmail={shared.invitation?.email ?? null} emailEnabled={emailEnabled()} />}
          >
            <p>{shared.invitation?.expired || !shared.invitation ? t("detail.banner.linkExpired") : t("detail.banner.waitingLink", { name })}</p>
            {shared.invitation && !shared.invitation.expired && (
              <p className="mt-1 text-xs text-muted-foreground">
                {shared.invitation.email && shared.invitation.sendCount > 0 && `${t("detail.banner.linkSentTo", { email: shared.invitation.email })} `}
                {t("detail.banner.linkExpires", { date: formatISODate(toISODate(shared.invitation.expiresAt), intlLocale) })}
              </p>
            )}
          </Banner>
        )}

        {shared?.dispute && (
          <Banner tone="danger" icon={<Flag className="text-destructive" aria-hidden />} title={t("detail.banner.disputeTitle")} actions={<DisputeActions debtId={view.id} canResolve={can.resolveDispute} />}>
            <p>{shared.dispute.openedByMe ? t("detail.banner.disputeByMe") : t("detail.banner.disputeByOther", { name })}</p>
            <p className="mt-1 text-muted-foreground">“{shared.dispute.reason}”</p>
          </Banner>
        )}

        {shared?.cancellation && (
          <Banner
            tone="waiting"
            icon={<Info className="text-waiting" aria-hidden />}
            title={t("detail.banner.cancelTitle")}
            actions={<CancellationActions debtId={view.id} canAnswer={can.answerCancellation} canWithdraw={can.withdrawCancellation} />}
          >
            <p>{shared.cancellation.requestedByMe ? t("detail.banner.cancelByMe", { name }) : t("detail.banner.cancelByOther", { name })}</p>
            <p className="mt-1 text-muted-foreground">“{shared.cancellation.reason}”</p>
          </Banner>
        )}

        {view.status === "CHANGES_REQUESTED" && shared && (
          <Banner
            tone="waiting"
            icon={<Info className="text-waiting" aria-hidden />}
            actions={
              can.proposeTerms && (
                <Button asChild size="sm">
                  <Link href={`/app/debts/${view.id}/terms`}>{t("detail.actions.proposeNewTerms")}</Link>
                </Button>
              )
            }
          >
            <p>{t("detail.banner.changesRequested")}</p>
            {shared.versions.at(-1)?.approvals.find((approval) => approval.decision === "CHANGES_REQUESTED")?.comment && (
              <p className="mt-1 text-muted-foreground">“{shared.versions.at(-1)?.approvals.find((approval) => approval.decision === "CHANGES_REQUESTED")?.comment}”</p>
            )}
          </Banner>
        )}

        {shared?.open && !shared.awaitingMyIdentity && (
          <>
            {shared.open.kind === "AMENDMENT" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4 shrink-0" aria-hidden />
                {t("detail.banner.amendmentOpen")}
              </p>
            )}
            <ProposalCard debtId={view.id} version={shared.open} counterpartyName={name} />
          </>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* ── The account card ───────────────────────────────────────── */}
            <section
              aria-labelledby="balance-title"
              className={cn("relative isolate overflow-hidden p-6 sm:p-7", isPersonal || view.termsAreProposal ? "account-card-personal" : "account-card")}
              data-testid="balance"
            >
              <SymmetryMark state={weight === "both_sides" ? "both" : weight === "proposal" ? "none" : "one"} className="pointer-events-none absolute -top-10 -right-10 -z-10 size-56 opacity-[0.09]" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 id="balance-title" className="text-sm font-semibold text-ink-muted">
                  {view.termsAreProposal ? t("detail.balance.proposedAmount") : view.status === "SETTLED" ? t("detail.balance.settled") : t("detail.balance.outstanding")}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15" title={t(`labels.weight.${weight}Hint`)}>
                  <SymmetryMark state={weight === "both_sides" ? "both" : weight === "proposal" ? "none" : "one"} className="size-3.5" />
                  {view.termsAreProposal ? t("labels.weight.proposal") : t(`labels.level.${balance.level}`)}
                </span>
              </div>
              <p className="mt-2 font-display text-[2.75rem] leading-none font-extrabold tracking-tight sm:text-[3.25rem]" data-testid="outstanding">
                <Money minor={view.termsAreProposal ? BigInt(view.terms.principalMinor) : balance.outstandingMinor} currency={currency} display />
              </p>

              {!view.termsAreProposal && (
                <>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent} aria-label={t("detail.schedule.paid")}>
                    <div className="h-full rounded-full bg-white" style={{ width: `${paidPercent}%` }} />
                  </div>
                  <p className="tabular mt-2 text-sm text-ink-muted">
                    {t("detail.balance.paidOf", { paid: money(balance.paidMinor), total: money(balance.totalOwedMinor) })}
                    {adjustments !== 0n && ` · ${t("detail.balance.adjustments", { amount: `${adjustments < 0n ? "−" : "+"}${money(adjustments < 0n ? -adjustments : adjustments)}` })}`}
                  </p>
                </>
              )}

              {(nextOpen || (progress.overdueMinor > 0n && (view.status === "ACTIVE" || view.status === "DISPUTED"))) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {nextOpen && (view.status === "ACTIVE" || view.status === "DISPUTED") && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm ring-1 ring-white/15">
                      <CalendarClock className="size-4 text-ink-muted" aria-hidden />
                      <span className="text-ink-muted">{t("detail.hero.next")}</span>
                      <span className="font-semibold">
                        <DateText iso={nextOpen.dueDate} /> · <Money minor={nextOpen.openMinor} currency={currency} />
                      </span>
                    </span>
                  )}
                  {progress.overdueMinor > 0n && (view.status === "ACTIVE" || view.status === "DISPUTED") && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-owe px-3 py-1.5 text-sm font-semibold text-white">
                      <TriangleAlert className="size-4" aria-hidden />
                      {t("detail.balance.overdue", { amount: money(progress.overdueMinor) })}
                    </span>
                  )}
                </div>
              )}

              {balance.pendingCount > 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-white/30 bg-white/8 p-3.5" data-testid="pending-balance">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <SymmetryMark state="waiting" className="size-4" />
                      {t("detail.balance.pending")}
                    </span>
                    <Money minor={balance.pendingPaymentsMinor + balance.pendingDecreasesMinor + balance.pendingIncreasesMinor + balance.pendingReversalsMinor} currency={currency} className="font-bold" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {t("detail.balance.pendingHint")} {t("detail.balance.ifConfirmed", { amount: money(balance.projectedOutstandingMinor) })}
                  </p>
                </div>
              )}

              <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                {view.termsAreProposal ? t("detail.balance.proposalHint") : isPersonal ? t("detail.balance.recordedHint") : t("detail.balance.confirmedHint")}
              </p>

              {!view.termsAreProposal && (
                <div className="mt-6 flex flex-wrap gap-x-2 gap-y-3 border-t border-white/12 pt-5">
                  {can.recordPayment && (
                    <MarkPaymentButton className={quickAction}>
                      <span className={quickIcon}>
                        <Wallet aria-hidden />
                      </span>
                      {t("detail.actions.markPayment")}
                    </MarkPaymentButton>
                  )}
                  {can.convert && (
                    <Link href={`/app/debts/${view.id}/share`} className={quickAction}>
                      <span className={quickIcon}>
                        <UserPlus aria-hidden />
                      </span>
                      {t("detail.actions.invite", { name })}
                    </Link>
                  )}
                  {ledger.length > 0 && (
                    <a href="#cuotas" className={quickAction}>
                      <span className={quickIcon}>
                        <ListChecks aria-hidden />
                      </span>
                      {t("detail.actions.installments")}
                    </a>
                  )}
                  <a href="#movimientos" className={quickAction}>
                    <span className={quickIcon}>
                      <History aria-hidden />
                    </span>
                    {t("detail.actions.movements")}
                  </a>
                </div>
              )}
            </section>

            {/* ── Waiting for me ────────────────────────────────────────── */}
            {toValidate > 0 && (
              <Banner
                tone="waiting"
                icon={<BellRing className="text-waiting" aria-hidden />}
                title={t("detail.attention.title", { count: toValidate })}
                actions={
                  <Button asChild size="sm">
                    <a href={ledger.length > 0 ? "#cuotas" : "#movimientos"}>{t("detail.attention.cta")}</a>
                  </Button>
                }
              >
                <p>{t("detail.attention.text", { name })}</p>
              </Banner>
            )}

            {/* ── A personal record can become an agreement ─────────────── */}
            {isPersonal && can.convert && (
              <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                  <SymmetryMark state="both" className="size-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[1.05rem] font-bold">{t("detail.inviteCard.title", { name })}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("detail.inviteCard.text", { name })}</p>
                </div>
                <Button asChild className="shrink-0">
                  <Link href={`/app/debts/${view.id}/share`}>
                    <UserPlus aria-hidden />
                    {t("detail.inviteCard.cta", { name })}
                  </Link>
                </Button>
              </section>
            )}

            {/* ── Instalments: the checklist ────────────────────────────── */}
            {ledger.length > 0 && (
              <section id="cuotas" aria-labelledby="cuotas-title" className="surface scroll-mt-24 overflow-hidden pb-4">
                <div className="px-4 pt-5 pb-4 sm:px-5 sm:pt-6">
                  <h2 id="cuotas-title" className="text-[1.05rem] font-bold">
                    {t("detail.installments.title")}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {view.termsAreProposal ? t("detail.installments.subtitleProposal") : isPersonal ? t("detail.installments.subtitlePersonal") : t("detail.installments.subtitleShared", { name })}
                  </p>
                </div>
                <InstallmentList
                  ledger={ledger}
                  movements={view.movements}
                  mode={view.mode}
                  currency={currency}
                  counterpartyName={name}
                  canMark={can.recordPayment}
                  proposal={view.termsAreProposal}
                />
                {progress.unscheduledMinor - progress.unscheduledPaidMinor > 0n && !view.termsAreProposal && (
                  <p className="mt-3 flex justify-between gap-3 px-4 text-sm text-muted-foreground sm:px-5">
                    <span>{t("detail.installments.unscheduled")}</span>
                    <Money minor={progress.unscheduledMinor - progress.unscheduledPaidMinor} currency={currency} className="font-semibold text-foreground" />
                  </p>
                )}
              </section>
            )}

            {/* ── Movements ─────────────────────────────────────────────── */}
            {!view.termsAreProposal && (
              <div id="movimientos" className="scroll-mt-24">
                <MovementsSection
                  movements={view.movements}
                  timeZone={actor.timeZone}
                  canRecordPayment={can.recordPayment}
                  canRecordAdjustment={can.recordAdjustment}
                  canAttach={can.attach}
                  context={movementContext}
                />
              </div>
            )}

            {/* ── History ───────────────────────────────────────────────── */}
            <Section title={t("detail.timeline.title")}>
              {can.comment && (
                <div className="mb-5">
                  <CommentBox debtId={view.id} hint={isPersonal ? t("detail.timeline.commentHintPersonal") : t("detail.timeline.commentHintShared", { name })} />
                </div>
              )}
              <ol className="flex flex-col">
                {visibleTimeline.map((entry) => {
                  const note = eventNote(entry.data);
                  return (
                    <li key={entry.id} className="flex gap-3 border-l border-border pb-4 pl-4 last:pb-0">
                      <span className="-ml-[1.55rem] grid size-5 shrink-0 place-items-center rounded-full bg-card">
                        {entry.weight === "neutral" ? (
                          <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
                        ) : (
                          <WeightMark weight={entry.weight} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">
                          <EventText type={entry.type} data={entry.data} actorName={entry.actorName} actorIsMe={entry.actorIsMe} personal={isPersonal} />
                        </p>
                        {note && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">“{note}”</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          <DateTimeText date={entry.at} timeZone={actor.timeZone} dateOnly={entry.type === "INSTALLMENT_OVERDUE"} />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {!showAllHistory && timeline.length > TIMELINE_PREVIEW && (
                <Link href={`/app/debts/${view.id}?history=all`} scroll={false} className="mt-4 inline-block rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  {t("detail.timeline.showAll", { count: timeline.length })}
                </Link>
              )}
            </Section>
          </div>

          {/* ── Side column ─────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-5">
            <Section title={t("detail.terms.title")}>
              <TermsSummary terms={view.terms} showSchedule={false} />
              {personal?.privateNotes && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">{t("detail.terms.privateNotes")}</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{personal.privateNotes}</p>
                </div>
              )}
              {personal?.receivingAccount && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">{t("detail.terms.receivingAccount")}</p>
                  <p className="mt-1 text-sm">
                    {personal.receivingAccount.alias} · {personal.receivingAccount.label}
                  </p>
                </div>
              )}
            </Section>

            <Section title={t("detail.terms.person")}>
              <p className="text-sm font-medium break-words">{name}</p>
              {view.counterparty.email && <p className="text-sm break-all text-muted-foreground">{view.counterparty.email}</p>}
              {!isPersonal && !view.counterparty.joined && <p className="mt-1 text-xs text-muted-foreground">{t("detail.terms.notJoined")}</p>}
              {!isPersonal && view.counterparty.joined && view.counterparty.identityConfirmed && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleCheck className="size-3.5 text-agreed" aria-hidden />
                  {t("labels.weight.both_sidesHint")}
                </p>
              )}
              {view.counterparty.contactId && (
                <Link href={`/app/people/${view.counterparty.contactId}`} className="mt-3 inline-block rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  {t("detail.terms.viewPerson")}
                </Link>
              )}
            </Section>

            {shared && shared.bankDetails.length > 0 && (
              <Section title={t("detail.bank.title")} description={t("detail.bank.sharedWithYou", { name })}>
                <SharedBankDetailsList details={shared.bankDetails} />
              </Section>
            )}

            {shared && can.shareBankAccount && (
              <Section title={t("detail.bank.myShares")} description={view.termsAreProposal ? t("detail.bank.visibleWhenActive") : undefined}>
                <BankSharePanel debtId={view.id} counterpartyName={name} shares={shared.myShares} accounts={accounts} />
              </Section>
            )}

            <Section title={t("detail.attachments.title")} action={can.attach ? <UploadButton debtId={view.id} maxUploadMb={env().MAX_UPLOAD_MB} /> : undefined}>
              {view.attachments.length > 0 ? <AttachmentList items={view.attachments} /> : <p className="text-sm text-muted-foreground">{t("detail.attachments.empty")}</p>}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("detail.attachments.notProof")}</p>
            </Section>

            {shared && (
              <Section title={t("detail.terms.privateNote")}>
                <PrivateNoteEditor debtId={view.id} initial={shared.privateNote} />
              </Section>
            )}

            {shared && shared.versions.length > 1 && (
              <Section title={t("detail.proposal.history")}>
                <ol className="flex flex-col gap-2 text-sm">
                  {[...shared.versions].reverse().map((version) => (
                    <li key={version.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-medium">{t("detail.proposal.version", { number: version.number })}</span>
                        <span className="block text-xs text-muted-foreground">
                          {version.proposedByMe ? t("detail.proposal.byMe") : t("detail.proposal.byOther", { name: version.proposedByName })}
                          {" · "}
                          <DateTimeText date={version.createdAt} timeZone={actor.timeZone} dateOnly />
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", version.id === shared.current?.id ? "bg-agreed-soft text-agreed" : "bg-muted text-muted-foreground")}>
                        {version.id === shared.current?.id ? t("detail.proposal.current") : t(`labels.versionStatus.${version.status}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        </div>
      </div>
    </PaymentLauncher>
  );
}
