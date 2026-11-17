/**
 * Life cycle of debts and movements: which states exist in each mode and what each person may
 * do in each of them. Pure functions, shared by the server (to enforce) and the interface
 * (to decide what to offer).
 */
import type { DebtMode, MovementKind, MovementStatus } from "./balance";

export const DEBT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "CHANGES_REQUESTED",
  "ACTIVE",
  "DISPUTED",
  "SETTLED",
  "CANCELLED",
  "CONVERTED",
] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const PARTY_ROLES = ["DEBTOR", "CREDITOR"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export function otherRole(role: PartyRole): PartyRole {
  return role === "DEBTOR" ? "CREDITOR" : "DEBTOR";
}

const STATUSES_BY_MODE: Record<DebtMode, readonly DebtStatus[]> = {
  PERSONAL: ["ACTIVE", "SETTLED", "CANCELLED", "CONVERTED"],
  SHARED: ["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "ACTIVE", "DISPUTED", "SETTLED", "CANCELLED"],
};

export function isStatusValidForMode(mode: DebtMode, status: DebtStatus): boolean {
  return STATUSES_BY_MODE[mode].includes(status);
}

/** Has both sides' agreement been reached at some point? (Shared only.) */
export function hasBeenActivated(status: DebtStatus): boolean {
  return status === "ACTIVE" || status === "DISPUTED" || status === "SETTLED";
}

/** Shared agreement whose terms are still being negotiated. */
export function isNegotiating(status: DebtStatus): boolean {
  return status === "DRAFT" || status === "PENDING_APPROVAL" || status === "CHANGES_REQUESTED";
}

/** Money is still owed and counted in the totals. */
export function isOutstanding(status: DebtStatus): boolean {
  return status === "ACTIVE" || status === "DISPUTED";
}

export function isClosed(status: DebtStatus): boolean {
  return status === "SETTLED" || status === "CANCELLED" || status === "CONVERTED";
}

/** Statuses in which a new movement of this kind may be recorded. */
export function canRecordMovement(mode: DebtMode, status: DebtStatus, kind: MovementKind): boolean {
  if (mode === "PERSONAL") {
    if (kind === "REVERSAL") return false; // the owner simply edits or deletes their own records
    if (kind === "ADJUSTMENT_INCREASE") return status === "ACTIVE" || status === "SETTLED";
    return status === "ACTIVE";
  }
  if (kind === "REVERSAL" || kind === "ADJUSTMENT_INCREASE") {
    return status === "ACTIVE" || status === "DISPUTED" || status === "SETTLED";
  }
  return status === "ACTIVE" || status === "DISPUTED";
}

/**
 * What the status should be once the balance is known.
 * A disputed agreement stays disputed until somebody resolves the dispute.
 */
export function statusAfterBalanceChange(status: DebtStatus, outstandingMinor: bigint): DebtStatus {
  if (status === "ACTIVE" && outstandingMinor <= 0n) return "SETTLED";
  if (status === "SETTLED" && outstandingMinor > 0n) return "ACTIVE";
  return status;
}

export type MovementAction = "approve" | "reject" | "ask" | "clarify" | "withdraw";

/**
 * Bilateral rule for movements in a shared agreement: whoever recorded a movement cannot be the
 * one who confirms it. The other side approves, rejects or asks; the recorder answers or
 * withdraws.
 */
export function allowedMovementActions(
  status: MovementStatus,
  viewerRole: PartyRole,
  recordedByRole: PartyRole | null,
): MovementAction[] {
  if (recordedByRole === null) return [];
  const isRecorder = viewerRole === recordedByRole;
  if (status === "PENDING") return isRecorder ? ["withdraw"] : ["approve", "reject", "ask"];
  if (status === "CLARIFICATION") return isRecorder ? ["clarify", "withdraw"] : ["approve", "reject"];
  return [];
}

export function movementStatusAfter(action: MovementAction): MovementStatus {
  switch (action) {
    case "approve":
      return "CONFIRMED";
    case "reject":
      return "REJECTED";
    case "ask":
      return "CLARIFICATION";
    case "clarify":
      return "PENDING";
    case "withdraw":
      return "WITHDRAWN";
  }
}

export const VERSION_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "SUPERSEDED",
  "WITHDRAWN",
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export type VersionAction = "accept" | "reject" | "request_changes" | "withdraw";

/** The proposer may withdraw; only the other side answers. Nobody accepts their own proposal twice. */
export function allowedVersionActions(
  status: VersionStatus,
  viewerRole: PartyRole,
  proposedByRole: PartyRole,
): VersionAction[] {
  if (status !== "PROPOSED") return [];
  return viewerRole === proposedByRole ? ["withdraw"] : ["accept", "reject", "request_changes"];
}
