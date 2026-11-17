import "server-only";
import type { ConfirmationLevel, DebtMode } from "@/domain/balance";
import { addDays, compareISO, todayInTimeZone, type ISODate } from "@/domain/dates";
import type { DebtStatus, PartyRole } from "@/domain/lifecycle";
import type { InstallmentState } from "@/domain/schedule";
import type { Actor } from "../actor";
import type { AuditType } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { listInvitationsForActor } from "./invitations";
import {
  filterDebts,
  listAllDebtSummaries,
  matchesDebtFilter,
  type DebtFilter,
  type DebtListItem,
} from "./views";

/**
 * Dashboard, people and activity.
 *
 * Totals are always kept apart by currency (amounts in different currencies are never added
 * together) and by how firm they are: what the user wrote down for themselves, what both sides
 * confirmed, what is still waiting for a confirmation and what is only a proposal. Those are
 * four different things and they are shown as four different things.
 */

export interface SideTotals {
  /** Personal records: the user's own figures. */
  recordedMinor: bigint;
  /** Shared agreements: confirmed by both sides. */
  confirmedMinor: bigint;
  /** Shared: payments recorded but not confirmed yet (not subtracted from anything). */
  awaitingMinor: bigint;
  /** Shared: amounts in proposals nobody has agreed to yet. */
  proposedMinor: bigint;
}

export interface CurrencyTotals {
  currency: string;
  iOwe: SideTotals;
  owedToMe: SideTotals;
  /** (recorded + confirmed owed to me) − (recorded + confirmed I owe). A summary, never a netting of debts. */
  netMinor: bigint;
  settledCount: number;
}

export interface DueItem {
  debtId: string;
  concept: string;
  counterpartyName: string;
  mode: DebtMode;
  level: ConfirmationLevel;
  role: PartyRole;
  currency: string;
  sequence: number;
  dueDate: ISODate;
  remainingMinor: bigint;
  state: InstallmentState;
}

export interface ActivityItem {
  id: string;
  type: AuditType;
  at: Date;
  actorIsMe: boolean;
  actorName: string | null;
  debtId: string | null;
  concept: string | null;
  counterpartyName: string | null;
  mode: DebtMode | null;
  weight: "personal" | "one_side" | "both_sides" | "neutral";
  data: Record<string, unknown>;
}

export interface DashboardView {
  filter: DebtFilter;
  totals: CurrencyTotals[];
  counts: Record<DebtFilter, number>;
  upcoming: DueItem[];
  overdue: DueItem[];
  /** Agreements where somebody is waiting for the user. */
  needsMe: DebtListItem[];
  /** Agreements where the user is waiting for the other side. */
  waitingOnOther: DebtListItem[];
  invitations: Awaited<ReturnType<typeof listInvitationsForActor>>;
  recent: ActivityItem[];
  hasAnyDebt: boolean;
}

function emptySide(): SideTotals {
  return { recordedMinor: 0n, confirmedMinor: 0n, awaitingMinor: 0n, proposedMinor: 0n };
}

function totalsFor(items: readonly DebtListItem[]): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const item of items) {
    let totals = byCurrency.get(item.currency);
    if (!totals) {
      totals = { currency: item.currency, iOwe: emptySide(), owedToMe: emptySide(), netMinor: 0n, settledCount: 0 };
      byCurrency.set(item.currency, totals);
    }
    const side = item.role === "DEBTOR" ? totals.iOwe : totals.owedToMe;

    if (item.status === "SETTLED") {
      totals.settledCount += 1;
      continue;
    }
    if (item.proposalOnly) {
      side.proposedMinor += item.totalOwedMinor;
      continue;
    }
    if (item.status !== "ACTIVE" && item.status !== "DISPUTED") continue;

    if (item.mode === "PERSONAL") side.recordedMinor += item.outstandingMinor;
    else {
      side.confirmedMinor += item.outstandingMinor;
      side.awaitingMinor += item.pendingPaymentsMinor;
    }
  }
  for (const totals of byCurrency.values()) {
    totals.netMinor =
      totals.owedToMe.recordedMinor + totals.owedToMe.confirmedMinor - totals.iOwe.recordedMinor - totals.iOwe.confirmedMinor;
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

const UPCOMING_WINDOW_DAYS = 30;

export async function getDashboard(actor: Actor, filter: DebtFilter): Promise<DashboardView> {
  const summaries = await listAllDebtSummaries(actor);
  const all = summaries.map((summary) => summary.item);
  const visible = summaries.filter((summary) => matchesDebtFilter(summary.item, filter));
  const items = visible.map((summary) => summary.item);

  const today = todayInTimeZone(actor.timeZone);
  const horizon = addDays(today, UPCOMING_WINDOW_DAYS);
  const upcoming: DueItem[] = [];
  const overdue: DueItem[] = [];
  for (const { item, progress } of visible) {
    if (!progress) continue;
    for (const row of progress.rows) {
      if (row.remainingMinor <= 0n) continue;
      const due: DueItem = {
        debtId: item.id,
        concept: item.concept,
        counterpartyName: item.counterpartyName,
        mode: item.mode,
        level: item.level,
        role: item.role,
        currency: item.currency,
        sequence: row.sequence,
        dueDate: row.dueDate,
        remainingMinor: row.remainingMinor,
        state: row.state,
      };
      if (row.state === "OVERDUE") overdue.push(due);
      else if (compareISO(row.dueDate, horizon) <= 0) upcoming.push(due);
    }
  }
  upcoming.sort((a, b) => compareISO(a.dueDate, b.dueDate));
  overdue.sort((a, b) => compareISO(a.dueDate, b.dueDate));

  const counts = {
    all: 0,
    personal: 0,
    shared: 0,
    pending: 0,
    settled: 0,
    archived: 0,
  } satisfies Record<DebtFilter, number>;
  for (const key of Object.keys(counts) as DebtFilter[]) {
    counts[key] = all.filter((item) => matchesDebtFilter(item, key)).length;
  }

  return {
    filter,
    totals: totalsFor(items),
    counts,
    upcoming: upcoming.slice(0, 12),
    overdue: overdue.slice(0, 12),
    needsMe: filterDebts(all, "all").filter((item) => item.needsMe),
    waitingOnOther: filterDebts(all, "all").filter((item) => item.waitingOnOther && !item.needsMe),
    invitations: await listInvitationsForActor(actor),
    recent: await listActivity(actor, { limit: 8, debtIds: filter === "all" ? undefined : items.map((item) => item.id) }),
    hasAnyDebt: all.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────────────────────

const BOTH_SIDES: ReadonlySet<string> = new Set(["PAYMENT_CONFIRMED", "AGREEMENT_ACTIVATED", "AMENDMENT_APPLIED", "DEBT_SETTLED"]);
const NEUTRAL: ReadonlySet<string> = new Set([
  "COMMENT_ADDED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "INVITATION_CREATED",
  "INVITATION_REVOKED",
  "DEBT_CREATED",
  "DEBT_CANCELLED",
  "DEBT_REOPENED",
  "BANK_DETAILS_SHARED",
  "BANK_DETAILS_REVOKED",
  "PARTICIPANT_JOINED",
  "PARTICIPANT_REMOVED",
  "IDENTITY_CONFIRMED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "CANCELLATION_REQUESTED",
  "CANCELLATION_DECLINED",
  "CANCELLATION_WITHDRAWN",
]);

export interface ActivityQuery {
  limit: number;
  /** Only events older than this (for "load more"). */
  before?: Date;
  debtIds?: string[];
}

/** The actor's history across everything they can see, newest first. */
export async function listActivity(actor: Pick<Actor, "id" | "name" | "email">, query: ActivityQuery): Promise<ActivityItem[]> {
  if (query.debtIds && query.debtIds.length === 0) return [];

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(query.before ? { createdAt: { lt: query.before } } : {}),
      ...(query.debtIds ? { debtId: { in: query.debtIds } } : {}),
      OR: [
        { scope: "PERSONAL", debt: { mode: "PERSONAL", ownerId: actor.id } },
        { scope: "SHARED", debt: { mode: "SHARED", participants: { some: { userId: actor.id } } } },
        ...(query.debtIds ? [] : [{ scope: "ACCOUNT" as const, userId: actor.id }]),
      ],
    },
    orderBy: { createdAt: "desc" },
    // A few extra, because some entries are hidden from one of the two sides.
    take: query.limit + 20,
    include: {
      debt: {
        select: {
          id: true,
          mode: true,
          concept: true,
          contact: { select: { name: true } },
          participants: { select: { role: true, userId: true, displayName: true } },
        },
      },
    },
  });

  const items: ActivityItem[] = [];
  for (const event of events) {
    const data = (event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {}) as Record<string, unknown>;
    const debt = event.debt;
    let counterpartyName: string | null = null;
    let actorName: string | null = null;
    const actorIsMe = event.actorId === actor.id;

    if (debt?.mode === "SHARED") {
      const me = debt.participants.find((participant) => participant.userId === actor.id);
      if (!me) continue;
      if (typeof data.onlyRole === "string" && data.onlyRole !== me.role) continue;
      const participantIds = new Set(debt.participants.map((participant) => participant.userId));
      const byOutsider = event.actorId !== null && !participantIds.has(event.actorId);
      if (byOutsider && event.actorRole === me.role) continue;
      const other = debt.participants.find((participant) => participant.role !== me.role);
      counterpartyName = other?.displayName ?? null;
      if (!actorIsMe && event.actorId !== null && !byOutsider) {
        actorName = debt.participants.find((participant) => participant.role === event.actorRole)?.displayName ?? null;
      }
    } else if (debt) {
      counterpartyName = debt.contact?.name ?? null;
    }
    if (actorIsMe) actorName = actor.name ?? actor.email;

    items.push({
      id: event.id,
      type: event.type as AuditType,
      at: event.createdAt,
      actorIsMe,
      actorName,
      debtId: debt?.id ?? null,
      concept: debt?.concept ?? null,
      counterpartyName,
      mode: debt?.mode ?? null,
      weight:
        debt?.mode === "PERSONAL"
          ? "personal"
          : BOTH_SIDES.has(event.type)
            ? "both_sides"
            : NEUTRAL.has(event.type) || !debt
              ? "neutral"
              : "one_side",
      data,
    });
    if (items.length >= query.limit) break;
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonTotals {
  currency: string;
  /** What I owe this person / what this person owes me — shown side by side, never offset. */
  iOweRecordedMinor: bigint;
  iOweConfirmedMinor: bigint;
  owedToMeRecordedMinor: bigint;
  owedToMeConfirmedMinor: bigint;
}

export interface PersonSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Linked to a registered user through an accepted invitation. */
  linked: boolean;
  archived: boolean;
  totals: PersonTotals[];
  personalCount: number;
  sharedCount: number;
  /** Movements and proposals still waiting for one of the two sides. */
  pendingCount: number;
  lastActivityAt: Date | null;
}

function personTotals(items: readonly DebtListItem[]): PersonTotals[] {
  const byCurrency = new Map<string, PersonTotals>();
  for (const item of items) {
    if (item.status !== "ACTIVE" && item.status !== "DISPUTED") continue;
    let totals = byCurrency.get(item.currency);
    if (!totals) {
      totals = {
        currency: item.currency,
        iOweRecordedMinor: 0n,
        iOweConfirmedMinor: 0n,
        owedToMeRecordedMinor: 0n,
        owedToMeConfirmedMinor: 0n,
      };
      byCurrency.set(item.currency, totals);
    }
    if (item.role === "DEBTOR") {
      if (item.mode === "PERSONAL") totals.iOweRecordedMinor += item.outstandingMinor;
      else totals.iOweConfirmedMinor += item.outstandingMinor;
    } else if (item.mode === "PERSONAL") totals.owedToMeRecordedMinor += item.outstandingMinor;
    else totals.owedToMeConfirmedMinor += item.outstandingMinor;
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

function summarizePerson(
  contact: { id: string; name: string; email: string | null; phone: string | null; linkedUserId: string | null; archivedAt: Date | null },
  items: readonly DebtListItem[],
): PersonSummary {
  const live = items.filter((item) => item.status !== "CANCELLED" && item.status !== "CONVERTED");
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    linked: contact.linkedUserId !== null,
    archived: contact.archivedAt !== null,
    totals: personTotals(live),
    personalCount: live.filter((item) => item.mode === "PERSONAL").length,
    sharedCount: live.filter((item) => item.mode === "SHARED").length,
    pendingCount: live.filter((item) => item.needsMe || item.waitingOnOther || item.pendingCount > 0).length,
    lastActivityAt: items.reduce<Date | null>((latest, item) => (latest === null || item.updatedAt > latest ? item.updatedAt : latest), null),
  };
}

export async function listPeople(actor: Pick<Actor, "id" | "timeZone">, includeArchived = false): Promise<PersonSummary[]> {
  const [contacts, summaries] = await Promise.all([
    prisma.contact.findMany({
      where: { ownerId: actor.id, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { name: "asc" },
    }),
    listAllDebtSummaries(actor),
  ]);
  const byContact = new Map<string, DebtListItem[]>();
  for (const { item } of summaries) {
    if (!item.counterpartyContactId) continue;
    const list = byContact.get(item.counterpartyContactId);
    if (list) list.push(item);
    else byContact.set(item.counterpartyContactId, [item]);
  }
  return contacts.map((contact) => summarizePerson(contact, byContact.get(contact.id) ?? []));
}

export interface PersonView extends PersonSummary {
  notes: string | null;
  debts: DebtListItem[];
  recent: ActivityItem[];
  canDelete: boolean;
}

export async function getPersonView(actor: Actor, contactId: string): Promise<PersonView> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, ownerId: actor.id } });
  if (!contact) throw new AppError("contact_not_found");

  const summaries = await listAllDebtSummaries(actor);
  const debts = summaries.map((summary) => summary.item).filter((item) => item.counterpartyContactId === contact.id);
  const recent = await listActivity(actor, { limit: 15, debtIds: debts.map((item) => item.id) });

  return {
    ...summarizePerson(contact, debts),
    notes: contact.notes,
    debts: [...debts].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    recent,
    canDelete: debts.length === 0,
  };
}

export type { DebtStatus };
