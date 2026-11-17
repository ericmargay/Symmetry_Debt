import { ArrowDownLeft, ArrowUpRight, CircleCheck, Clock, FileStack, Flag, Info, Link2, PartyPopper, Share2, UserCheck } from "lucide-react";
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
import { MovementsSection } from "@/components/debts/detail/movements-section";
import { ProposalCard } from "@/components/debts/detail/proposal-card";
import { ScheduleTable } from "@/components/debts/detail/schedule-table";
import { TermsSummary } from "@/components/debts/detail/terms-summary";
import { DateTimeText } from "@/components/shared/dates";
import { EventText, eventNote, isEventType } from "@/components/shared/event-text";
import { Money } from "@/components/shared/money";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DebtStatusBadge } from "@/components/shared/status-badge";
import { SupportHint } from "@/components/shared/support";
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
    info: "border-primary/30 bg-secondary/50",
    waiting: "border-waiting/40 bg-waiting-soft/60",
    success: "border-owed/30 bg-owed-soft/60",
    danger: "border-destructive/30 bg-destructive/5",
    muted: "border-border bg-muted/50",
  } as const;
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
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

  return (
    <>
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
          <>
            {can.convert && (
              <Button asChild variant="outline">
                <Link href={`/app/debts/${view.id}/share`}>
                  <Share2 aria-hidden />
                  {t("detail.actions.convert")}
                </Link>
              </Button>
            )}
            <DebtMenu debtId={view.id} counterpartyName={name} can={can} negotiating={negotiating} />
          </>
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

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* ── Balance ───────────────────────────────────────────────── */}
            <section aria-labelledby="balance-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid="balance">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="balance-title" className="text-sm font-medium text-muted-foreground">
                    {view.termsAreProposal ? t("detail.balance.proposedAmount") : view.status === "SETTLED" ? t("detail.balance.settled") : t("detail.balance.outstanding")}
                  </h2>
                  <p className={cn("mt-1.5 text-4xl leading-none font-semibold tracking-tight", view.termsAreProposal ? "text-foreground" : owes ? "text-owe" : "text-owed")} data-testid="outstanding">
                    <Money minor={view.termsAreProposal ? BigInt(view.terms.principalMinor) : balance.outstandingMinor} currency={currency} />
                  </p>
                </div>
                <WeightBadge
                  weight={weight}
                  label={view.termsAreProposal ? undefined : t(`labels.level.${balance.level}`)}
                  className="text-[0.8rem]"
                />
              </div>

              {!view.termsAreProposal && (
                <>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent} aria-label={t("detail.schedule.paid")}>
                    <div className={cn("h-full rounded-full", isPersonal ? "bg-personal" : "bg-agreed")} style={{ width: `${paidPercent}%` }} />
                  </div>
                  <p className="tabular mt-2 text-sm text-muted-foreground">
                    {t("detail.balance.paidOf", { paid: money(balance.paidMinor), total: money(balance.totalOwedMinor) })}
                    {adjustments !== 0n && ` · ${t("detail.balance.adjustments", { amount: `${adjustments < 0n ? "−" : "+"}${money(adjustments < 0n ? -adjustments : adjustments)}` })}`}
                  </p>
                </>
              )}

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {view.termsAreProposal ? t("detail.balance.proposalHint") : isPersonal ? t("detail.balance.recordedHint") : t("detail.balance.confirmedHint")}
              </p>

              {balance.pendingCount > 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-waiting/50 bg-waiting-soft/50 p-3" data-testid="pending-balance">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <WeightMark weight="one_side" />
                      {t("detail.balance.pending")}
                    </span>
                    <Money minor={balance.pendingPaymentsMinor + balance.pendingDecreasesMinor + balance.pendingIncreasesMinor + balance.pendingReversalsMinor} currency={currency} className="font-semibold" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("detail.balance.pendingHint")}{" "}
                    {t("detail.balance.ifConfirmed", { amount: money(balance.projectedOutstandingMinor) })}
                  </p>
                </div>
              )}

              {progress.overdueMinor > 0n && (view.status === "ACTIVE" || view.status === "DISPUTED") && (
                <p className="mt-3 text-sm font-medium text-destructive">
                  {t("detail.balance.overdue", { amount: money(progress.overdueMinor) })}
                </p>
              )}
            </section>

            {/* ── Schedule ──────────────────────────────────────────────── */}
            {progress.rows.length > 0 && (
              <Section
                title={view.termsAreProposal ? t("detail.schedule.proposed") : t("detail.schedule.title")}
                description={view.termsAreProposal ? undefined : isPersonal ? t("detail.schedule.basisRecorded") : t("detail.schedule.basisConfirmed")}
              >
                <ScheduleTable progress={progress} currency={currency} showProgress={!view.termsAreProposal} />
              </Section>
            )}

            {/* ── Movements ─────────────────────────────────────────────── */}
            {!view.termsAreProposal && (
              <MovementsSection
                movements={view.movements}
                timeZone={actor.timeZone}
                canRecordPayment={can.recordPayment}
                canRecordAdjustment={can.recordAdjustment}
                canAttach={can.attach}
                context={{
                  debtId: view.id,
                  mode: view.mode,
                  currency,
                  counterpartyName: name,
                  today: todayInTimeZone(actor.timeZone),
                  originDate: view.terms.originDate,
                  roomMinor: roomMinor > 0n ? roomMinor : 0n,
                  destinations,
                  maxUploadMb: env().MAX_UPLOAD_MB,
                }}
              />
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
    </>
  );
}
