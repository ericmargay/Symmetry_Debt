import "server-only";
import {
  computeBalance,
  countsTowardBalance,
  isAwaitingConfirmation,
  isOpenMovement,
  type Balance,
  type ConfirmationLevel,
  type DebtMode,
  type MovementKind,
  type MovementStatus,
} from "@/domain/balance";
import { toISODate, todayInTimeZone, type ISODate } from "@/domain/dates";
import {
  allowedMovementActions,
  allowedVersionActions,
  canRecordMovement,
  hasBeenActivated,
  isNegotiating,
  otherRole,
  type DebtStatus,
  type MovementAction,
  type PartyRole,
  type VersionAction,
  type VersionStatus,
} from "@/domain/lifecycle";
import type { PaymentMethod } from "@/domain/payment-methods";
import { allocatePayments, type ScheduleProgress, type ScheduleType } from "@/domain/schedule";
import { diffTerms, parseTerms, type TermsField, type TermsSnapshot } from "@/domain/terms";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "../actor";
import type { AuditType } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { mySharesFor, sharedBankDetailsFor, type SharedBankDetails } from "./bank-accounts";

/**
 * Read models: what the pages show. Everything here is derived for ONE viewer — which side they
 * are on, what is waiting for them, what they are allowed to do — so the interface never has to
 * work out permissions by itself.
 */

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

export const DEBT_FILTERS = ["all", "personal", "shared", "pending", "settled", "archived"] as const;
export type DebtFilter = (typeof DEBT_FILTERS)[number];

export function isDebtFilter(value: unknown): value is DebtFilter {
  return typeof value === "string" && (DEBT_FILTERS as readonly string[]).includes(value);
}

export interface DebtListItem {
  id: string;
  mode: DebtMode;
  status: DebtStatus;
  level: ConfirmationLevel;
  concept: string;
  currency: string;
  /** The viewer's side. */
  role: PartyRole;
  counterpartyName: string;
  counterpartyContactId: string | null;
  /** Has the other person joined? (Shared only.) */
  counterpartyJoined: boolean;
  totalOwedMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
  /** Shared: payments recorded but not confirmed yet. Never part of the balance. */
  pendingPaymentsMinor: bigint;
  pendingCount: number;
  dueDate: ISODate | null;
  nextDueDate: ISODate | null;
  nextDueMinor: bigint;
  overdueMinor: bigint;
  overdueCount: number;
  /** Something on this debt is waiting for the viewer. */
  needsMe: boolean;
  /** The viewer is waiting for the other side. */
  waitingOnOther: boolean;
  /** Terms are still being negotiated: the amounts above are a proposal, not an agreement. */
  proposalOnly: boolean;
  hasOpenAmendment: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const summaryInclude = {
  contact: { select: { id: true, name: true } },
  participants: {
    select: {
      role: true,
      userId: true,
      displayName: true,
      identityConfirmedAt: true,
      counterpartyContactId: true,
    },
  },
  installments: { select: { sequence: true, dueDate: true, amountMinor: true } },
  payments: { select: { kind: true, status: true, amountMinor: true, recordedByRole: true } },
  versions: {
    where: { status: { in: ["PROPOSED", "CHANGES_REQUESTED", "DRAFT"] } },
    orderBy: { number: "desc" },
    select: { status: true, proposedByRole: true, kind: true, number: true },
  },
} satisfies Prisma.DebtInclude;

type SummaryRow = Prisma.DebtGetPayload<{ include: typeof summaryInclude }>;

function accessWhere(actorId: string): Prisma.DebtWhereInput {
  return {
    OR: [
      { mode: "PERSONAL", ownerId: actorId },
      { mode: "SHARED", participants: { some: { userId: actorId } } },
    ],
  };
}

interface Summary {
  item: DebtListItem;
  /** Null while the terms are only a proposal. */
  progress: ScheduleProgress | null;
}

function summarize(row: SummaryRow, actorId: string, today: ISODate): Summary | null {
  let role: PartyRole;
  let counterpartyName: string;
  let counterpartyContactId: string | null;
  let counterpartyJoined = true;
  let needsMe = false;
  let waitingOnOther = false;

  const balance = computeBalance(row.mode, row.principalMinor, row.payments);

  if (row.mode === "PERSONAL") {
    if (!row.ownerRole) return null;
    role = row.ownerRole;
    counterpartyName = row.contact?.name ?? "";
    counterpartyContactId = row.contact?.id ?? null;
  } else {
    const me = row.participants.find((participant) => participant.userId === actorId);
    if (!me) return null;
    const other = row.participants.find((participant) => participant.role !== me.role);
    role = me.role;
    counterpartyName = other?.displayName ?? "";
    counterpartyContactId = me.counterpartyContactId;
    counterpartyJoined = Boolean(other?.userId);

    const open = row.versions.find((version) => version.status === "PROPOSED");
    const latest = row.versions[0];

    if (row.status === "DRAFT") needsMe = true;
    if (open) {
      if (open.proposedByRole === role) waitingOnOther = true;
      else needsMe = true;
    }
    if (row.status === "CHANGES_REQUESTED" && latest) {
      // Whoever proposed the terms that were sent back is the one expected to revise them.
      if (latest.proposedByRole === role) needsMe = true;
      else waitingOnOther = true;
    }
    if (other?.userId && !other.identityConfirmedAt && me.identityConfirmedAt) needsMe = true;
    if (!me.identityConfirmedAt) waitingOnOther = true;
    if (row.cancelRequestedByRole) {
      if (row.cancelRequestedByRole === role) waitingOnOther = true;
      else needsMe = true;
    }
    for (const payment of row.payments) {
      if (payment.status === "PENDING") {
        if (payment.recordedByRole === role) waitingOnOther = true;
        else needsMe = true;
      } else if (payment.status === "CLARIFICATION") {
        if (payment.recordedByRole === role) needsMe = true;
        else waitingOnOther = true;
      }
    }
  }

  const inForce = row.mode === "PERSONAL" || hasBeenActivated(row.status);
  const progress = inForce
    ? allocatePayments(
        row.installments.map((installment) => ({
          sequence: installment.sequence,
          dueDate: toISODate(installment.dueDate),
          amountMinor: installment.amountMinor,
        })),
        { totalOwedMinor: balance.totalOwedMinor, paidMinor: balance.paidMinor, today },
      )
    : null;
  const stillOwed = row.status === "ACTIVE" || row.status === "DISPUTED";

  const item: DebtListItem = {
    id: row.id,
    mode: row.mode,
    status: row.status,
    level: balance.level,
    concept: row.concept,
    currency: row.currency,
    role,
    counterpartyName,
    counterpartyContactId,
    counterpartyJoined,
    totalOwedMinor: balance.totalOwedMinor,
    paidMinor: balance.paidMinor,
    outstandingMinor: balance.outstandingMinor,
    pendingPaymentsMinor: balance.pendingPaymentsMinor,
    pendingCount: balance.pendingCount,
    dueDate: row.dueDate ? toISODate(row.dueDate) : null,
    nextDueDate: stillOwed ? (progress?.next?.dueDate ?? null) : null,
    nextDueMinor: stillOwed ? (progress?.next?.remainingMinor ?? 0n) : 0n,
    overdueMinor: stillOwed ? (progress?.overdueMinor ?? 0n) : 0n,
    overdueCount: stillOwed ? (progress?.overdueCount ?? 0) : 0,
    needsMe,
    waitingOnOther,
    proposalOnly: row.mode === "SHARED" && isNegotiating(row.status),
    hasOpenAmendment: row.versions.some((version) => version.status === "PROPOSED" && version.kind === "AMENDMENT"),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return { item, progress: stillOwed ? progress : null };
}

function matchesFilter(item: DebtListItem, filter: DebtFilter): boolean {
  const archived = item.status === "CANCELLED" || item.status === "CONVERTED";
  switch (filter) {
    case "all":
      return !archived;
    case "personal":
      return item.mode === "PERSONAL" && !archived;
    case "shared":
      return item.mode === "SHARED" && !archived;
    case "pending":
      return item.mode === "SHARED" && !archived && (item.proposalOnly || item.pendingCount > 0 || item.hasOpenAmendment || item.needsMe || item.waitingOnOther);
    case "settled":
      return item.status === "SETTLED";
    case "archived":
      return archived;
  }
}

const STATUS_ORDER: Record<DebtStatus, number> = {
  DISPUTED: 0,
  ACTIVE: 1,
  PENDING_APPROVAL: 2,
  CHANGES_REQUESTED: 2,
  DRAFT: 3,
  SETTLED: 4,
  CANCELLED: 5,
  CONVERTED: 5,
};

/** Every debt the actor can see, with its schedule progress. */
export async function listAllDebtSummaries(actor: Pick<Actor, "id" | "timeZone">): Promise<Summary[]> {
  const rows = await prisma.debt.findMany({
    where: accessWhere(actor.id),
    include: summaryInclude,
    orderBy: { updatedAt: "desc" },
  });
  const today = todayInTimeZone(actor.timeZone);
  return rows
    .map((row) => summarize(row, actor.id, today))
    .filter((summary): summary is Summary => summary !== null);
}

/** Every debt the actor can see, as list rows. */
export async function listAllDebts(actor: Pick<Actor, "id" | "timeZone">): Promise<DebtListItem[]> {
  return (await listAllDebtSummaries(actor)).map((summary) => summary.item);
}

export function debtAccessWhere(actorId: string): Prisma.DebtWhereInput {
  return accessWhere(actorId);
}

export function matchesDebtFilter(item: DebtListItem, filter: DebtFilter): boolean {
  return matchesFilter(item, filter);
}

export function filterDebts(items: readonly DebtListItem[], filter: DebtFilter): DebtListItem[] {
  return items
    .filter((item) => matchesFilter(item, filter))
    .sort(
      (a, b) =>
        Number(b.needsMe) - Number(a.needsMe) ||
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
}

export async function listDebts(actor: Pick<Actor, "id" | "timeZone">, filter: DebtFilter): Promise<DebtListItem[]> {
  return filterDebts(await listAllDebts(actor), filter);
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────────────────────

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  paymentId: string | null;
  uploadedByMe: boolean;
  canDelete: boolean;
}

export interface MovementView {
  id: string;
  kind: MovementKind;
  status: MovementStatus;
  origin: "RECORDED" | "HISTORICAL";
  amountMinor: bigint;
  effectiveDate: ISODate;
  recordedAt: Date;
  confirmedAt: Date | null;
  recordedByRole: PartyRole | null;
  recordedByMe: boolean;
  recordedByName: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  place: string | null;
  bank: { originBank: string | null; destinationLabel: string | null; destinationAccountId: string | null; trackingKey: string | null } | null;
  reversesId: string | null;
  /** A live reversal of this payment, if any. */
  reversal: { id: string; status: MovementStatus } | null;
  approvals: Array<{ role: PartyRole; byMe: boolean; decision: string; comment: string | null; at: Date }>;
  attachments: AttachmentView[];
  /** Shared: what the viewer may answer. */
  actions: MovementAction[];
  /** Personal: the owner may edit or delete their own record. */
  canEdit: boolean;
  canDelete: boolean;
  /** Shared: the viewer may propose undoing this confirmed payment. */
  canReverse: boolean;
}

export interface VersionView {
  id: string;
  number: number;
  kind: "INITIAL" | "AMENDMENT";
  status: VersionStatus;
  proposedByRole: PartyRole;
  proposedByMe: boolean;
  proposedByName: string;
  terms: TermsSnapshot;
  termsHash: string;
  changeNote: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  approvals: Array<{ role: PartyRole; byMe: boolean; decision: string; comment: string | null; at: Date }>;
  /** What differs from the terms in force (or from the previous version while negotiating). */
  changes: TermsField[];
  actions: VersionAction[];
}

export interface TimelineEntry {
  id: string;
  type: AuditType | "INSTALLMENT_OVERDUE";
  at: Date;
  actorName: string | null;
  actorIsMe: boolean;
  actorRole: PartyRole | null;
  /** How much weight the entry carries, for the visual marker. */
  weight: "personal" | "one_side" | "both_sides" | "neutral";
  paymentId: string | null;
  versionId: string | null;
  data: Record<string, unknown>;
}

export interface DebtView {
  id: string;
  mode: DebtMode;
  status: DebtStatus;
  lockVersion: number;
  role: PartyRole;
  me: { name: string };
  counterparty: {
    name: string;
    contactId: string | null;
    email: string | null;
    image: string | null;
    joined: boolean;
    identityConfirmed: boolean;
  };
  /** Terms shown at the top: the ones in force, or the latest proposal while negotiating. */
  terms: TermsSnapshot;
  /** True when `terms` have not been accepted by both sides. */
  termsAreProposal: boolean;
  balance: Balance;
  progress: ScheduleProgress;
  scheduleType: ScheduleType;
  movements: MovementView[];
  attachments: AttachmentView[];
  timeline: TimelineEntry[];
  createdAt: Date;
  settledAt: Date | null;
  cancelledAt: Date | null;
  closedReason: string | null;

  personal: {
    privateNotes: string | null;
    receivingAccount: { id: string; alias: string; label: string } | null;
    contact: { id: string; name: string; email: string | null };
    /** A shared agreement proposed from this record that is still alive. */
    conversion: { debtId: string; status: DebtStatus } | null;
  } | null;

  shared: {
    sharedNotes: string | null;
    privateNote: string | null;
    createdByMe: boolean;
    /** Came from one of the viewer's own personal records. */
    sourceDebtId: string | null;
    current: VersionView | null;
    open: VersionView | null;
    versions: VersionView[];
    /** The live share link, as seen by whoever sent it. The link itself cannot be shown again. */
    invitation: { id: string; email: string | null; expiresAt: Date; expired: boolean; sendCount: number } | null;
    /** Somebody joined through the link and the viewer still has to say whether it is the right person. */
    identityToConfirm: { name: string; email: string | null; image: string | null } | null;
    /** The viewer joined through a link and is waiting for the proposer to confirm them. */
    awaitingMyIdentity: boolean;
    dispute: { openedByMe: boolean; openedAt: Date; reason: string } | null;
    cancellation: { requestedByMe: boolean; requestedAt: Date; reason: string } | null;
    /** Details the other side shared so the viewer can pay them. */
    bankDetails: SharedBankDetails[];
    /** Accounts of the viewer currently shared here. */
    myShares: Array<{ accountId: string; alias: string; label: string }>;
  } | null;

  can: {
    edit: boolean;
    delete: boolean;
    cancelPersonal: boolean;
    reopenPersonal: boolean;
    convert: boolean;
    recordPayment: boolean;
    recordAdjustment: boolean;
    attach: boolean;
    comment: boolean;
    editDraft: boolean;
    sendDraft: boolean;
    discardDraft: boolean;
    proposeTerms: boolean;
    regenerateInvitation: boolean;
    confirmIdentity: boolean;
    removeCounterparty: boolean;
    openDispute: boolean;
    resolveDispute: boolean;
    requestCancellation: boolean;
    answerCancellation: boolean;
    withdrawCancellation: boolean;
    shareBankAccount: boolean;
  };
}

const detailInclude = {
  contact: true,
  receivingAccount: true,
  participants: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
  installments: { orderBy: { sequence: "asc" } },
  payments: {
    orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }],
    include: { approvals: { orderBy: { createdAt: "asc" } }, bankDetails: true },
  },
  versions: { orderBy: { number: "asc" }, include: { approvals: { orderBy: { createdAt: "asc" } } } },
  attachments: { orderBy: { createdAt: "asc" } },
  invitations: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
  events: { orderBy: { createdAt: "desc" }, take: 400 },
  derivedDebts: { where: { status: { not: "CANCELLED" } }, select: { id: true, status: true } },
} satisfies Prisma.DebtInclude;

type DetailRow = Prisma.DebtGetPayload<{ include: typeof detailInclude }>;

function termsOfDebt(row: DetailRow): TermsSnapshot {
  return {
    v: 1,
    concept: row.concept,
    currency: row.currency,
    principalMinor: row.principalMinor.toString(),
    originDate: toISODate(row.originDate),
    dueDate: row.dueDate ? toISODate(row.dueDate) : null,
    balanceAsOf: row.balanceAsOf ? toISODate(row.balanceAsOf) : null,
    scheduleType: row.scheduleType,
    installments: row.installments.map((installment) => ({
      sequence: installment.sequence,
      dueDate: toISODate(installment.dueDate),
      amountMinor: installment.amountMinor.toString(),
    })),
    plannedMethod: row.plannedMethod,
    sharedNotes: row.sharedNotes,
    historicalPayments: [],
  };
}

const EVENT_WEIGHT: Partial<Record<AuditType, TimelineEntry["weight"]>> = {
  PAYMENT_CONFIRMED: "both_sides",
  AGREEMENT_ACTIVATED: "both_sides",
  AMENDMENT_APPLIED: "both_sides",
  DEBT_SETTLED: "both_sides",
  PAYMENT_RECORDED: "one_side",
  VERSION_PROPOSED: "one_side",
  VERSION_ACCEPTED: "one_side",
  PAYMENT_CLARIFIED: "one_side",
  PAYMENT_CLARIFICATION_REQUESTED: "one_side",
  PAYMENT_REJECTED: "one_side",
  PAYMENT_WITHDRAWN: "one_side",
  VERSION_REJECTED: "one_side",
  VERSION_CHANGES_REQUESTED: "one_side",
  VERSION_WITHDRAWN: "one_side",
};

export async function getDebtView(actor: Actor, debtId: string): Promise<DebtView> {
  const row = await prisma.debt.findFirst({
    where: { id: debtId, ...accessWhere(actor.id) },
    include: detailInclude,
  });
  if (!row) throw new AppError("not_found");

  const today = todayInTimeZone(actor.timeZone);
  const isPersonal = row.mode === "PERSONAL";
  const me = isPersonal ? null : (row.participants.find((participant) => participant.userId === actor.id) ?? null);
  const other = me ? (row.participants.find((participant) => participant.role !== me.role) ?? null) : null;
  const role = isPersonal ? row.ownerRole : me?.role;
  if (!role) throw new AppError("not_found");

  const identityConfirmed = isPersonal || Boolean(me?.identityConfirmedAt);
  const inForce = isPersonal || hasBeenActivated(row.status);
  const nameOfRole = (target: PartyRole | null): string => {
    if (target === null) return "";
    if (isPersonal) return target === role ? (actor.name ?? actor.email) : (row.contact?.name ?? "");
    return row.participants.find((participant) => participant.role === target)?.displayName ?? "";
  };

  // ── Versions ───────────────────────────────────────────────────────────────
  const currentRow = row.versions.find((version) => version.id === row.currentVersionId) ?? null;
  const currentTerms = currentRow ? parseTerms(currentRow.terms) : null;
  const versions: VersionView[] = row.versions.map((version, index) => {
    const terms = parseTerms(version.terms);
    const previous = index > 0 ? parseTerms(row.versions[index - 1].terms) : null;
    const baseline = version.kind === "AMENDMENT" && currentTerms && version.id !== currentRow?.id ? currentTerms : previous;
    return {
      id: version.id,
      number: version.number,
      kind: version.kind,
      status: version.status,
      proposedByRole: version.proposedByRole,
      proposedByMe: version.proposedById === actor.id,
      proposedByName: nameOfRole(version.proposedByRole),
      terms,
      termsHash: version.termsHash,
      changeNote: version.changeNote,
      createdAt: version.createdAt,
      decidedAt: version.decidedAt,
      approvals: version.approvals.map((approval) => ({
        role: approval.role,
        byMe: approval.userId === actor.id,
        decision: approval.decision,
        comment: approval.comment,
        at: approval.createdAt,
      })),
      changes: baseline ? diffTerms(baseline, terms) : [],
      actions: me ? allowedVersionActions(version.status, role, version.proposedByRole) : [],
    };
  });
  const openVersion = versions.find((version) => version.status === "PROPOSED") ?? null;
  const currentVersion = versions.find((version) => version.id === row.currentVersionId) ?? null;
  const latestVersion = versions[versions.length - 1] ?? null;

  const terms = isPersonal
    ? termsOfDebt(row)
    : inForce && currentVersion
      ? { ...currentVersion.terms, ...pickLive(termsOfDebt(row)) }
      : (openVersion ?? latestVersion)?.terms ?? termsOfDebt(row);

  // ── Balance and schedule ───────────────────────────────────────────────────
  const balance = computeBalance(row.mode, row.principalMinor, row.payments);
  const scheduleSource = inForce
    ? row.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: toISODate(installment.dueDate),
        amountMinor: installment.amountMinor,
      }))
    : terms.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: installment.dueDate,
        amountMinor: BigInt(installment.amountMinor),
      }));
  const progress = allocatePayments(scheduleSource, {
    totalOwedMinor: inForce ? balance.totalOwedMinor : BigInt(terms.principalMinor),
    paidMinor: inForce ? balance.paidMinor : 0n,
    today,
  });

  // ── Attachments ────────────────────────────────────────────────────────────
  const paymentStatus = new Map(row.payments.map((payment) => [payment.id, payment.status]));
  const closedForFiles = row.status === "SETTLED" || row.status === "CANCELLED" || row.status === "CONVERTED";
  const toAttachmentView = (attachment: DetailRow["attachments"][number]): AttachmentView => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
    paymentId: attachment.paymentId,
    uploadedByMe: attachment.uploaderId === actor.id,
    canDelete: isPersonal
      ? true
      : attachment.uploaderId === actor.id &&
        !closedForFiles &&
        (attachment.paymentId === null || paymentStatus.get(attachment.paymentId) !== "CONFIRMED"),
  });

  // ── Movements ──────────────────────────────────────────────────────────────
  const canMove = (kind: MovementKind) => identityConfirmed && canRecordMovement(row.mode, row.status, kind);
  const movements: MovementView[] = row.payments.map((payment) => {
    const reversal = row.payments.find((candidate) => candidate.reversesId === payment.id && isOpenMovement(candidate.status)) ?? null;
    const counted = countsTowardBalance(row.mode, payment.status);
    const editable = isPersonal && (row.status === "ACTIVE" || row.status === "SETTLED");
    return {
      id: payment.id,
      kind: payment.kind,
      status: payment.status,
      origin: payment.origin,
      amountMinor: payment.amountMinor,
      effectiveDate: toISODate(payment.effectiveDate),
      recordedAt: payment.recordedAt,
      confirmedAt: payment.confirmedAt,
      recordedByRole: payment.recordedByRole,
      recordedByMe: payment.recordedByRole === role,
      recordedByName: nameOfRole(payment.recordedByRole),
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      place: payment.place,
      bank: payment.bankDetails
        ? {
            originBank: payment.bankDetails.originBank,
            destinationLabel: payment.bankDetails.destinationLabel,
            destinationAccountId: payment.bankDetails.destinationAccountId,
            trackingKey: payment.bankDetails.trackingKey,
          }
        : null,
      reversesId: payment.reversesId,
      reversal: reversal ? { id: reversal.id, status: reversal.status } : null,
      approvals: payment.approvals.map((approval) => ({
        role: approval.role,
        byMe: approval.role === role,
        decision: approval.decision,
        comment: approval.comment,
        at: approval.createdAt,
      })),
      attachments: row.attachments.filter((attachment) => attachment.paymentId === payment.id).map(toAttachmentView),
      actions:
        !isPersonal && identityConfirmed && payment.origin === "RECORDED"
          ? allowedMovementActions(payment.status, role, payment.recordedByRole)
          : [],
      canEdit: editable,
      canDelete: editable,
      canReverse: !isPersonal && payment.kind === "PAYMENT" && counted && reversal === null && canMove("REVERSAL"),
    };
  });

  // ── Timeline ───────────────────────────────────────────────────────────────
  const participantIds = new Set(row.participants.map((participant) => participant.userId).filter(Boolean));
  const timeline: TimelineEntry[] = [];
  for (const event of row.events) {
    const data = (event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {}) as Record<string, unknown>;
    if (!isPersonal) {
      // Entries meant for one side only (who a link was sent to, who was taken off…).
      if (typeof data.onlyRole === "string" && data.onlyRole !== role) continue;
      // Things done by somebody who is no longer on the agreement are shown only to the side
      // that dealt with them.
      const byOutsider = event.actorId !== null && !participantIds.has(event.actorId);
      if (byOutsider && event.actorRole === role) continue;
    }
    const actorIsMe = event.actorId === actor.id;
    const actorIsParticipant = isPersonal || (event.actorId !== null && participantIds.has(event.actorId));
    timeline.push({
      id: event.id,
      type: event.type as AuditType,
      at: event.createdAt,
      actorName: event.actorId === null ? null : actorIsMe ? (actor.name ?? actor.email) : actorIsParticipant ? nameOfRole(event.actorRole) : null,
      actorIsMe,
      actorRole: event.actorRole,
      weight: isPersonal ? "personal" : (EVENT_WEIGHT[event.type as AuditType] ?? "neutral"),
      paymentId: event.paymentId,
      versionId: event.versionId,
      data,
    });
  }
  if (inForce && (row.status === "ACTIVE" || row.status === "DISPUTED")) {
    for (const installment of progress.rows) {
      if (installment.state !== "OVERDUE") continue;
      timeline.push({
        id: `overdue-${installment.sequence}`,
        type: "INSTALLMENT_OVERDUE",
        at: new Date(`${installment.dueDate}T12:00:00.000Z`),
        actorName: null,
        actorIsMe: false,
        actorRole: null,
        weight: "neutral",
        paymentId: null,
        versionId: null,
        data: {
          sequence: installment.sequence,
          dueDate: installment.dueDate,
          amountMinor: installment.remainingMinor.toString(),
          currency: row.currency,
        },
      });
    }
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  // ── Shared-only extras ─────────────────────────────────────────────────────
  const createdByMe = row.createdById === actor.id;
  const negotiating = isNegotiating(row.status);
  const invitation = row.invitations[0] ?? null;
  const otherUnconfirmed = Boolean(other?.userId && !other.identityConfirmedAt);

  const shared: DebtView["shared"] = isPersonal
    ? null
    : {
        sharedNotes: terms.sharedNotes,
        privateNote: me?.privateNote ?? null,
        createdByMe,
        sourceDebtId: createdByMe ? row.sourceDebtId : null,
        current: currentVersion,
        open: openVersion,
        versions,
        invitation:
          invitation && invitation.invitedById === actor.id && !other?.userId
            ? {
                id: invitation.id,
                email: invitation.email,
                expiresAt: invitation.expiresAt,
                expired: invitation.expiresAt.getTime() < Date.now(),
                sendCount: invitation.sendCount,
              }
            : null,
        identityToConfirm:
          identityConfirmed && otherUnconfirmed && other
            ? { name: other.displayName, email: other.user?.email ?? null, image: other.user?.image ?? null }
            : null,
        awaitingMyIdentity: !identityConfirmed,
        dispute:
          row.status === "DISPUTED" && row.disputeOpenedByRole && row.disputeOpenedAt
            ? { openedByMe: row.disputeOpenedByRole === role, openedAt: row.disputeOpenedAt, reason: row.disputeReason ?? "" }
            : null,
        cancellation:
          row.cancelRequestedByRole && row.cancelRequestedAt
            ? {
                requestedByMe: row.cancelRequestedByRole === role,
                requestedAt: row.cancelRequestedAt,
                reason: row.cancelRequestReason ?? "",
              }
            : null,
        bankDetails: await sharedBankDetailsFor(prisma, actor, row.id),
        myShares: await mySharesFor(prisma, actor, row.id),
      };

  const liveConversion = row.derivedDebts[0] ?? null;
  const personal: DebtView["personal"] =
    isPersonal && row.contact
      ? {
          privateNotes: row.privateNotes,
          receivingAccount: row.receivingAccount
            ? {
                id: row.receivingAccount.id,
                alias: row.receivingAccount.alias,
                label: `${row.receivingAccount.bankName} •••• ${row.receivingAccount.clabeLast4 ?? row.receivingAccount.accountLast4 ?? ""}`.trim(),
              }
            : null,
          contact: { id: row.contact.id, name: row.contact.name, email: row.contact.email },
          conversion: liveConversion ? { debtId: liveConversion.id, status: liveConversion.status } : null,
        }
      : null;

  const activeOrDisputed = row.status === "ACTIVE" || row.status === "DISPUTED";

  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    lockVersion: row.lockVersion,
    role,
    me: { name: actor.name ?? actor.email },
    counterparty: isPersonal
      ? {
          name: row.contact?.name ?? "",
          contactId: row.contact?.id ?? null,
          email: row.contact?.email ?? null,
          image: null,
          joined: false,
          identityConfirmed: false,
        }
      : {
          name: other?.displayName ?? "",
          contactId: me?.counterpartyContactId ?? null,
          // The other person's address is theirs to reveal: it is shown once they are a
          // confirmed participant (or to the proposer, who has to recognise them).
          email: other?.userId && (other.identityConfirmedAt || identityConfirmed) ? (other.user?.email ?? null) : null,
          image: other?.user?.image ?? null,
          joined: Boolean(other?.userId),
          identityConfirmed: Boolean(other?.identityConfirmedAt),
        },
    terms,
    termsAreProposal: !inForce,
    balance,
    progress,
    scheduleType: terms.scheduleType,
    movements,
    attachments: row.attachments.filter((attachment) => attachment.paymentId === null).map(toAttachmentView),
    timeline,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
    cancelledAt: row.cancelledAt,
    closedReason: row.closedReason,
    personal,
    shared,
    can: {
      edit: isPersonal && (row.status === "ACTIVE" || row.status === "SETTLED"),
      delete: isPersonal,
      cancelPersonal: isPersonal && row.status === "ACTIVE",
      reopenPersonal: isPersonal && row.status === "CANCELLED",
      convert: isPersonal && row.status === "ACTIVE" && balance.outstandingMinor > 0n && liveConversion === null,
      recordPayment: canMove("PAYMENT") && balance.outstandingMinor - balance.pendingPaymentsMinor - balance.pendingDecreasesMinor > 0n,
      recordAdjustment: canMove("ADJUSTMENT_INCREASE"),
      attach: identityConfirmed && row.status !== "CANCELLED" && row.status !== "CONVERTED",
      comment: row.status !== "CONVERTED",
      editDraft: !isPersonal && row.status === "DRAFT" && createdByMe,
      sendDraft: !isPersonal && row.status === "DRAFT" && createdByMe,
      discardDraft: !isPersonal && row.status === "DRAFT" && createdByMe,
      proposeTerms:
        !isPersonal &&
        identityConfirmed &&
        (row.status === "PENDING_APPROVAL" || row.status === "CHANGES_REQUESTED" || activeOrDisputed),
      regenerateInvitation:
        !isPersonal && identityConfirmed && !other?.userId && (row.status === "PENDING_APPROVAL" || row.status === "CHANGES_REQUESTED"),
      confirmIdentity: !isPersonal && identityConfirmed && otherUnconfirmed,
      removeCounterparty: !isPersonal && identityConfirmed && otherUnconfirmed && negotiating && row.status !== "DRAFT",
      openDispute: !isPersonal && identityConfirmed && row.status === "ACTIVE",
      resolveDispute: !isPersonal && identityConfirmed && row.status === "DISPUTED" && row.disputeOpenedByRole === role,
      requestCancellation:
        !isPersonal &&
        identityConfirmed &&
        !row.cancelRequestedByRole &&
        (row.status === "PENDING_APPROVAL" || row.status === "CHANGES_REQUESTED" || activeOrDisputed),
      answerCancellation: !isPersonal && identityConfirmed && activeOrDisputed && row.cancelRequestedByRole === otherRole(role),
      withdrawCancellation: !isPersonal && identityConfirmed && activeOrDisputed && row.cancelRequestedByRole === role,
      shareBankAccount: !isPersonal && identityConfirmed && role === "CREDITOR" && row.status !== "CANCELLED",
    },
  };
}

/** Fields of the terms that live on the debt row once the agreement is in force. */
function pickLive(live: TermsSnapshot): Pick<TermsSnapshot, "installments" | "dueDate" | "scheduleType"> {
  return { installments: live.installments, dueDate: live.dueDate, scheduleType: live.scheduleType };
}

export { isAwaitingConfirmation };
