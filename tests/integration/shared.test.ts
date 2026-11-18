import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db";
import {
  answerCancellation,
  confirmCounterpartyIdentity,
  createSharedAgreement,
  decideVersion,
  discardDraft,
  openDispute,
  proposeVersion,
  regenerateInvitation,
  removeCounterparty,
  requestCancellation,
  resolveDispute,
  sendDraft,
  updateDraft,
} from "@/server/services/agreements";
import { getInvitationView, listInvitationsForActor, respondToInvitation } from "@/server/services/invitations";
import { addComment, decideMovement, recordMovement } from "@/server/services/movements";
import { getDebtView, listDebts } from "@/server/services/views";
import {
  createUser,
  daysAgo,
  daysAhead,
  expectAppError,
  key,
  monthsAhead,
  notificationsOf,
  payment,
  resetDatabase,
  sharedDebt,
} from "./helpers";

beforeEach(resetDatabase);

/** Ana (creditor) proposes to Luis (debtor); Luis accepts through the link sent to his email. */
async function activeAgreement(overrides: Parameters<typeof sharedDebt>[0] = {}) {
  const ana = await createUser("Ana");
  const luis = await createUser("Luis");
  const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, ...overrides }));
  const token = created.invitation!.token;
  const view = await getInvitationView(luis, token);
  const outcome = await respondToInvitation(luis, token, {
    versionId: view!.proposal!.versionId,
    termsHash: view!.proposal!.termsHash,
    action: "accept",
  });
  expect(outcome.activated).toBe(true);
  return { ana, luis, debtId: created.debtId, token };
}

async function acceptOpen(actor: Actor, debtId: string) {
  const view = await getDebtView(actor, debtId);
  await decideVersion(actor, debtId, { versionId: view.shared!.open!.id, termsHash: view.shared!.open!.termsHash, action: "accept" });
}

describe("proposing a shared agreement", () => {
  it("creates a proposal with a share link and nothing confirmed yet", async () => {
    const ana = await createUser("Ana");
    const created = await createSharedAgreement(ana, sharedDebt({ amount: "10000" }));

    expect(created.invitation?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // Only a hash of the link is stored.
    const invitation = await prisma.invitation.findFirstOrThrow();
    expect(invitation.tokenHash).not.toBe(created.invitation!.token);
    expect(invitation.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(invitation.email).toBeNull();

    const view = await getDebtView(ana, created.debtId);
    expect(view.mode).toBe("SHARED");
    expect(view.status).toBe("PENDING_APPROVAL");
    expect(view.termsAreProposal).toBe(true);
    expect(view.counterparty).toMatchObject({ name: "Luis", joined: false, identityConfirmed: false });
    expect(view.shared?.open).toMatchObject({ number: 1, status: "PROPOSED", proposedByMe: true, actions: ["withdraw"] });
    // The proposer accepted their own terms by proposing them; the other side has not answered.
    expect(view.shared?.open?.approvals.map((approval) => [approval.role, approval.decision])).toEqual([["CREDITOR", "ACCEPTED"]]);
    expect(view.shared?.invitation).toMatchObject({ email: null, expired: false });
    expect(view.can).toMatchObject({ recordPayment: false, regenerateInvitation: true, proposeTerms: true });
    // A proposal is not money owed.
    expect(view.balance.level).toBe("CONFIRMED");
    const [item] = await listDebts(ana, "all");
    expect(item).toMatchObject({ proposalOnly: true, waitingOnOther: true, needsMe: false });
  });

  it("cannot be accepted by its own proposer, in any way", async () => {
    const ana = await createUser("Ana");
    const created = await createSharedAgreement(ana, sharedDebt());
    const view = await getDebtView(ana, created.debtId);
    const open = view.shared!.open!;

    await expectAppError(decideVersion(ana, created.debtId, { versionId: open.id, termsHash: open.termsHash, action: "accept" }), "own_proposal");
    await expectAppError(
      respondToInvitation(ana, created.invitation!.token, { versionId: open.id, termsHash: open.termsHash, action: "accept" }),
      "invitation_self",
    );
    expect((await getInvitationView(ana, created.invitation!.token))?.state).toBe("own");
    await expectAppError(createSharedAgreement(ana, sharedDebt({ inviteEmail: ana.email })), "invitation_self");
    expect((await getDebtView(ana, created.debtId)).status).toBe("PENDING_APPROVAL");
  });

  it("keeps a draft private until it is sent", async () => {
    const ana = await createUser("Ana");
    const created = await createSharedAgreement(ana, sharedDebt({ send: false }));
    expect(created.invitation).toBeNull();
    expect(await prisma.invitation.count()).toBe(0);

    let view = await getDebtView(ana, created.debtId);
    expect(view.status).toBe("DRAFT");
    expect(view.can).toMatchObject({ editDraft: true, sendDraft: true, discardDraft: true });

    await updateDraft(ana, created.debtId, {
      idempotencyKey: key(),
      concept: "Préstamo coche (editado)",
      currency: "MXN",
      amount: "12000",
      originDate: daysAgo(30),
      schedule: { type: "SINGLE", installments: [{ dueDate: daysAhead(60), amount: "12000" }] },
      plannedMethod: "BANK_TRANSFER",
      previousPayments: [],
      sharedNotes: null,
      changeNote: null,
    });
    const sent = await sendDraft(ana, created.debtId, null);
    expect(sent.invitation?.token).toBeTruthy();
    view = await getDebtView(ana, created.debtId);
    expect(view.status).toBe("PENDING_APPROVAL");
    expect(view.terms).toMatchObject({ concept: "Préstamo coche (editado)", principalMinor: "1200000", dueDate: daysAhead(60) });

    const other = await createSharedAgreement(ana, sharedDebt({ send: false }));
    await discardDraft(ana, other.debtId);
    expect(await prisma.debt.count()).toBe(1);
  });
});

describe("the share link", () => {
  it("activates the agreement when the invited address accepts", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, amount: "10000" }));
    const token = created.invitation!.token;

    // Luis sees it inside the app without the link, because the invitation names his address.
    expect(await notificationsOf(luis)).toEqual(["INVITATION_RECEIVED"]);
    const inbox = await listInvitationsForActor(luis);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].proposerName).toBe("Ana");

    const invite = await getInvitationView(luis, token);
    expect(invite).toMatchObject({ state: "open", role: "DEBTOR", identity: "matches", intendedFor: null });
    expect(invite?.proposal?.terms).toMatchObject({ concept: "Préstamo coche", principalMinor: "1000000" });
    expect(invite?.proposer).toMatchObject({ name: "Ana", email: ana.email });
    // Before answering he is not part of anything.
    await expectAppError(getDebtView(luis, created.debtId), "not_found");

    const outcome = await respondToInvitation(luis, token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "accept",
    });
    expect(outcome).toEqual({ debtId: created.debtId, activated: true, awaitingIdentity: false });

    for (const viewer of [ana, luis]) {
      const view = await getDebtView(viewer, created.debtId);
      expect(view.status).toBe("ACTIVE");
      expect(view.termsAreProposal).toBe(false);
      expect(view.shared?.current).toMatchObject({ number: 1, status: "ACCEPTED" });
      expect(view.shared?.current?.approvals.map((approval) => approval.decision)).toEqual(["ACCEPTED", "ACCEPTED"]);
      expect(view.shared?.open).toBeNull();
      expect(view.balance.outstandingMinor).toBe(1000000n);
      expect(view.can.recordPayment).toBe(true);
    }
    expect((await getDebtView(ana, created.debtId)).role).toBe("CREDITOR");
    expect((await getDebtView(luis, created.debtId)).role).toBe("DEBTOR");
    expect((await getDebtView(luis, created.debtId)).counterparty).toMatchObject({ name: "Ana", email: ana.email });

    // Each side's address book now links to the other, through the accepted invitation.
    const anaContact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    const luisContact = await prisma.contact.findFirstOrThrow({ where: { ownerId: luis.id } });
    expect(anaContact.linkedUserId).toBe(luis.id);
    expect(luisContact).toMatchObject({ linkedUserId: ana.id, name: "Ana" });

    expect(await notificationsOf(ana)).toEqual(expect.arrayContaining(["AGREEMENT_ACTIVE", "PROPOSAL_ACCEPTED"]));
    expect(await notificationsOf(luis)).toContain("AGREEMENT_ACTIVE");

    // The link is single-use.
    expect((await getInvitationView(luis, token))?.state).toBe("member");
    const eva = await createUser("Eva");
    expect((await getInvitationView(eva, token))?.state).toBe("used");
    await expectAppError(
      respondToInvitation(eva, token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" }),
      "invitation_used",
    );
  });

  it("waits for the proposer to confirm who joined when the link names nobody", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt());
    const token = created.invitation!.token;

    const invite = await getInvitationView(luis, token);
    expect(invite).toMatchObject({ state: "open", identity: "not_specified" });
    const outcome = await respondToInvitation(luis, token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "accept",
    });
    expect(outcome).toEqual({ debtId: created.debtId, activated: false, awaitingIdentity: true });

    // Both accepted the same version, but it is NOT in force: Ana has not said this is Luis.
    let anaView = await getDebtView(ana, created.debtId);
    expect(anaView.status).toBe("PENDING_APPROVAL");
    expect(anaView.shared?.identityToConfirm).toMatchObject({ name: "Luis", email: luis.email });
    expect(anaView.can).toMatchObject({ confirmIdentity: true, removeCounterparty: true });
    expect(await notificationsOf(ana)).toContain("IDENTITY_CONFIRMATION_NEEDED");

    const luisView = await getDebtView(luis, created.debtId);
    expect(luisView.shared?.awaitingMyIdentity).toBe(true);
    expect(luisView.can).toMatchObject({ recordPayment: false, attach: false, proposeTerms: false });
    await expectAppError(recordMovement(luis, created.debtId, payment("100")), "invalid_state");
    // Somebody waiting to be confirmed cannot confirm themselves.
    await expectAppError(confirmCounterpartyIdentity(luis, created.debtId), "identity_unconfirmed");

    await confirmCounterpartyIdentity(ana, created.debtId);
    anaView = await getDebtView(ana, created.debtId);
    expect(anaView.status).toBe("ACTIVE");
    expect(anaView.counterparty.identityConfirmed).toBe(true);
    expect(await notificationsOf(luis)).toEqual(expect.arrayContaining(["IDENTITY_CONFIRMED", "AGREEMENT_ACTIVE"]));
  });

  it("treats a different account as unconfirmed even when the link named an address", async () => {
    const ana = await createUser("Ana");
    const other = await createUser("Luis Trabajo", { email: "luis.trabajo@example.com" });
    const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: "luis.personal@example.com" }));
    const invite = await getInvitationView(other, created.invitation!.token);
    expect(invite).toMatchObject({ state: "open", identity: "different_account", intendedFor: "l•••@e•••.com" });

    const outcome = await respondToInvitation(other, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "accept",
    });
    expect(outcome.awaitingIdentity).toBe(true);
    expect((await getDebtView(ana, created.debtId)).status).toBe("PENDING_APPROVAL");
  });

  it("lets the proposer turn away the wrong person and issue a new link", async () => {
    const ana = await createUser("Ana");
    const stranger = await createUser("Desconocido");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt());
    const first = await getInvitationView(stranger, created.invitation!.token);
    await respondToInvitation(stranger, created.invitation!.token, {
      versionId: first!.proposal!.versionId,
      termsHash: first!.proposal!.termsHash,
      action: "accept",
    });

    const fresh = await removeCounterparty(ana, created.debtId);
    expect(fresh.token).not.toBe(created.invitation!.token);

    // The stranger is out and keeps no access.
    await expectAppError(getDebtView(stranger, created.debtId), "not_found");
    expect(await listDebts(stranger, "all")).toHaveLength(0);
    expect(await notificationsOf(stranger)).toContain("PARTICIPANT_REMOVED");

    // Their acceptance does not carry over: the terms are back on the table as a new version.
    const anaView = await getDebtView(ana, created.debtId);
    expect(anaView.status).toBe("PENDING_APPROVAL");
    expect(anaView.counterparty).toMatchObject({ name: "Luis", joined: false });
    expect(anaView.shared?.open).toMatchObject({ number: 2 });
    expect(anaView.shared?.open?.approvals).toHaveLength(1);
    expect(anaView.shared?.versions[0].status).toBe("SUPERSEDED");

    const second = await getInvitationView(luis, fresh.token);
    expect(second?.state).toBe("open");
    await respondToInvitation(luis, fresh.token, { versionId: second!.proposal!.versionId, termsHash: second!.proposal!.termsHash, action: "accept" });
    await confirmCounterpartyIdentity(ana, created.debtId);
    expect((await getDebtView(luis, created.debtId)).status).toBe("ACTIVE");

    // Luis never learns who the stranger was.
    const luisTimeline = (await getDebtView(luis, created.debtId)).timeline;
    expect(JSON.stringify(luisTimeline)).not.toContain("Desconocido");
    expect(JSON.stringify(luisTimeline)).not.toContain(stranger.email);
    expect(luisTimeline.some((entry) => entry.type === "PARTICIPANT_REMOVED")).toBe(false);
    // Ana does see what happened.
    expect((await getDebtView(ana, created.debtId)).timeline.some((entry) => entry.type === "PARTICIPANT_REMOVED")).toBe(true);
  });

  it("gives nothing to somebody who only knows an email address or guesses", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const eva = await createUser("Eva");
    const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email }));
    const invitation = await prisma.invitation.findFirstOrThrow();

    // The invitation id works for the invited address only; a guessed token works for nobody.
    expect((await getInvitationView(luis, invitation.id))?.state).toBe("open");
    expect(await getInvitationView(eva, invitation.id)).toBeNull();
    expect(await getInvitationView(eva, "not-a-real-token-not-a-real-token-123456")).toBeNull();
    expect(await getInvitationView(eva, invitation.tokenHash)).toBeNull();
    expect(await listInvitationsForActor(eva)).toHaveLength(0);
    await expectAppError(
      respondToInvitation(eva, invitation.id, { versionId: "x", termsHash: "y", action: "accept" }),
      "invitation_invalid",
    );
    await expectAppError(getDebtView(eva, created.debtId), "not_found");

    // Knowing Luis's address reveals nothing about whether he has an account or anything of his.
    const view = await getDebtView(ana, created.debtId);
    expect(view.counterparty).toMatchObject({ joined: false, email: null, image: null });
    const anaContact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    expect(anaContact.linkedUserId).toBeNull();
  });

  it("expires, can be regenerated, and the old link stops working", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt());
    const oldToken = created.invitation!.token;

    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await getInvitationView(luis, oldToken);
    expect(expired).toMatchObject({ state: "expired", proposal: null });
    expect(expired?.proposer.email).toBeNull();
    await expectAppError(respondToInvitation(luis, oldToken, { versionId: "x", termsHash: "y", action: "accept" }), "invitation_expired");

    const { invitation } = await regenerateInvitation(ana, created.debtId, luis.email);
    expect((await getInvitationView(luis, oldToken))?.state).toBe("revoked");
    const fresh = await getInvitationView(luis, invitation.token);
    expect(fresh).toMatchObject({ state: "open", identity: "matches" });
    expect(await prisma.invitation.count({ where: { status: "PENDING" } })).toBe(1);

    await expectAppError(regenerateInvitation(luis, created.debtId, null), "not_found");
  });

  it("leaves no trace on somebody who declines", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt());
    const invite = await getInvitationView(luis, created.invitation!.token);
    const outcome = await respondToInvitation(luis, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "reject",
      comment: "No reconozco esta deuda",
    });
    expect(outcome).toEqual({ debtId: null, activated: false, awaitingIdentity: false });

    await expectAppError(getDebtView(luis, created.debtId), "not_found");
    expect(await listDebts(luis, "archived")).toHaveLength(0);
    expect(await prisma.contact.count({ where: { ownerId: luis.id } })).toBe(0);

    const view = await getDebtView(ana, created.debtId);
    expect(view).toMatchObject({ status: "CANCELLED", closedReason: "rejected" });
    expect(await notificationsOf(ana)).toContain("PROPOSAL_REJECTED");
    expect((await getInvitationView(luis, created.invitation!.token))?.state).toBe("declined");
  });
});

describe("negotiating terms", () => {
  it("goes back and forth until both accept the very same version", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, amount: "10000" }));
    const invite = await getInvitationView(luis, created.invitation!.token);

    // Luis asks for changes (a reason is required).
    await expectAppError(
      respondToInvitation(luis, created.invitation!.token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "request_changes" }),
      "validation",
    );
    await respondToInvitation(luis, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "request_changes",
      comment: "Son 9,500, ya te di 500",
    });
    let anaView = await getDebtView(ana, created.debtId);
    expect(anaView.status).toBe("CHANGES_REQUESTED");
    expect(await notificationsOf(ana)).toContain("CHANGES_REQUESTED");
    expect((await listDebts(ana, "pending"))[0]).toMatchObject({ needsMe: true });

    // Ana proposes version 2.
    const v2 = {
      idempotencyKey: key(),
      concept: "Préstamo coche",
      currency: "MXN",
      amount: "9500",
      originDate: daysAgo(30),
      schedule: { type: "NONE" as const, installments: [] },
      plannedMethod: null,
      previousPayments: [],
      sharedNotes: null,
      changeNote: "Tienes razón",
    };
    const first = await proposeVersion(ana, created.debtId, v2);
    const repeat = await proposeVersion(ana, created.debtId, v2);
    expect(repeat.versionId).toBe(first.versionId);

    const luisView = await getDebtView(luis, created.debtId);
    expect(luisView.status).toBe("PENDING_APPROVAL");
    expect(luisView.shared?.open).toMatchObject({ number: 2, proposedByMe: false, changes: ["principal"], actions: ["accept", "reject", "request_changes"] });

    // Answering with the hash of terms that are no longer on the table is refused.
    await expectAppError(
      decideVersion(luis, created.debtId, { versionId: luisView.shared!.open!.id, termsHash: invite!.proposal!.termsHash, action: "accept" }),
      "stale",
    );
    await expectAppError(
      decideVersion(luis, created.debtId, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" }),
      "stale",
    );

    await acceptOpen(luis, created.debtId);
    anaView = await getDebtView(ana, created.debtId);
    expect(anaView.status).toBe("ACTIVE");
    expect(anaView.balance.totalOwedMinor).toBe(950000n);
    expect(anaView.shared?.versions.map((version) => [version.number, version.status])).toEqual([
      [1, "CHANGES_REQUESTED"],
      [2, "ACCEPTED"],
    ]);
  });

  it("supersedes a proposal with a counter-proposal from the other side", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email }));
    const invite = await getInvitationView(luis, created.invitation!.token);
    await respondToInvitation(luis, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "request_changes",
      comment: "Prefiero pagar en dos partes",
    });
    await proposeVersion(luis, created.debtId, {
      idempotencyKey: key(),
      concept: "Préstamo coche",
      currency: "MXN",
      amount: "10000",
      originDate: daysAgo(30),
      schedule: { type: "CUSTOM", installments: [{ dueDate: monthsAhead(1), amount: "5000" }, { dueDate: monthsAhead(2), amount: "5000" }] },
      plannedMethod: "BANK_TRANSFER",
      previousPayments: [],
      sharedNotes: null,
      changeNote: null,
    });

    const anaView = await getDebtView(ana, created.debtId);
    expect(anaView.shared?.open).toMatchObject({ number: 2, proposedByMe: false });
    expect(anaView.shared?.open?.changes).toEqual(expect.arrayContaining(["schedule", "plannedMethod"]));
    await acceptOpen(ana, created.debtId);

    const view = await getDebtView(luis, created.debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.progress.rows.map((row) => row.scheduledMinor)).toEqual([500000n, 500000n]);
  });

  it("recognises earlier payments only because both accepted the terms that list them", async () => {
    const { ana, luis, debtId } = await activeAgreement({
      amount: "10000",
      originDate: daysAgo(90),
      previousPayments: [
        { amount: "2000", effectiveDate: daysAgo(60), method: "CASH", note: "En efectivo" },
        { amount: "1000", effectiveDate: daysAgo(20), method: "BANK_TRANSFER", note: null },
      ],
    });
    const view = await getDebtView(luis, debtId);
    expect(view.balance).toMatchObject({ totalOwedMinor: 1000000n, paidMinor: 300000n, outstandingMinor: 700000n });
    const historical = view.movements.filter((movement) => movement.origin === "HISTORICAL");
    expect(historical).toHaveLength(2);
    expect(historical.every((movement) => movement.status === "CONFIRMED" && movement.actions.length === 0)).toBe(true);
    expect((await getDebtView(ana, debtId)).timeline.find((entry) => entry.type === "AGREEMENT_ACTIVATED")?.data).toMatchObject({
      historicalPayments: 2,
      openingBalanceMinor: "700000",
    });
  });
});

describe("payments in a shared agreement", () => {
  it("only change the confirmed balance once the OTHER side confirms", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "10000" });

    const { paymentId } = await recordMovement(luis, debtId, payment("2500", { method: "BANK_TRANSFER", reference: "Abono 1" }));

    // Recorded, but nothing is confirmed.
    for (const viewer of [ana, luis]) {
      const view = await getDebtView(viewer, debtId);
      expect(view.balance.paidMinor).toBe(0n);
      expect(view.balance.outstandingMinor).toBe(1000000n);
      expect(view.balance.pendingPaymentsMinor).toBe(250000n);
      expect(view.movements[0].status).toBe("PENDING");
    }
    expect((await getDebtView(luis, debtId)).movements[0].actions).toEqual(["withdraw"]);
    expect((await getDebtView(ana, debtId)).movements[0].actions).toEqual(["approve", "reject", "ask"]);
    expect(await notificationsOf(ana)).toContain("PAYMENT_TO_CONFIRM");
    expect((await listDebts(ana, "pending"))[0]).toMatchObject({ needsMe: true, pendingPaymentsMinor: 250000n });
    expect((await listDebts(luis, "pending"))[0]).toMatchObject({ waitingOnOther: true, needsMe: false });

    // Whoever recorded it cannot confirm it.
    await expectAppError(decideMovement(luis, paymentId, "approve"), "own_movement");
    await expectAppError(decideMovement(luis, paymentId, "reject", "x"), "not_your_turn");

    await decideMovement(ana, paymentId, "approve");
    for (const viewer of [ana, luis]) {
      const view = await getDebtView(viewer, debtId);
      expect(view.balance.paidMinor).toBe(250000n);
      expect(view.balance.outstandingMinor).toBe(750000n);
      expect(view.balance.pendingPaymentsMinor).toBe(0n);
      expect(view.movements[0]).toMatchObject({ status: "CONFIRMED", actions: [] });
      expect(view.movements[0].approvals.map((approval) => [approval.role, approval.decision])).toEqual([
        ["DEBTOR", "APPROVED"],
        ["CREDITOR", "APPROVED"],
      ]);
    }
    expect(await notificationsOf(luis)).toContain("PAYMENT_CONFIRMED");

    // Approving twice (double click, retry) is harmless.
    await decideMovement(ana, paymentId, "approve");
    expect((await getDebtView(ana, debtId)).balance.paidMinor).toBe(250000n);
    expect(await prisma.paymentApproval.count({ where: { paymentId } })).toBe(2);
  });

  it("works the same when the creditor records what they received", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const { paymentId } = await recordMovement(ana, debtId, payment("400"));
    await expectAppError(decideMovement(ana, paymentId, "approve"), "own_movement");
    expect((await getDebtView(ana, debtId)).balance.paidMinor).toBe(0n);
    await decideMovement(luis, paymentId, "approve");
    expect((await getDebtView(ana, debtId)).balance.paidMinor).toBe(40000n);
  });

  it("can be rejected, and a rejected payment never counts", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "10000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("2500"));

    await expectAppError(decideMovement(ana, paymentId, "reject"), "validation");
    await decideMovement(ana, paymentId, "reject", "No recibí ese dinero");

    const view = await getDebtView(luis, debtId);
    expect(view.movements[0]).toMatchObject({ status: "REJECTED", actions: [] });
    expect(view.movements[0].approvals.at(-1)).toMatchObject({ decision: "REJECTED", comment: "No recibí ese dinero" });
    expect(view.balance).toMatchObject({ paidMinor: 0n, pendingPaymentsMinor: 0n, outstandingMinor: 1000000n });
    expect(await notificationsOf(luis)).toContain("PAYMENT_REJECTED");
    // It stays in the history and cannot be brought back.
    await expectAppError(decideMovement(ana, paymentId, "approve"), "not_your_turn");
    expect(view.timeline.some((entry) => entry.type === "PAYMENT_REJECTED")).toBe(true);
  });

  it("supports asking for a clarification before deciding", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "10000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("2500"));

    await decideMovement(ana, paymentId, "ask", "¿A qué cuenta lo mandaste?");
    expect((await getDebtView(luis, debtId)).movements[0]).toMatchObject({ status: "CLARIFICATION", actions: ["clarify", "withdraw"] });
    expect((await getDebtView(ana, debtId)).movements[0].actions).toEqual(["approve", "reject"]);
    expect(await notificationsOf(luis)).toContain("PAYMENT_CLARIFICATION_REQUESTED");
    expect((await listDebts(luis, "pending"))[0].needsMe).toBe(true);

    await decideMovement(luis, paymentId, "clarify", "A tu cuenta BBVA terminada en 9719");
    expect((await getDebtView(ana, debtId)).movements[0]).toMatchObject({ status: "PENDING", actions: ["approve", "reject", "ask"] });
    await decideMovement(ana, paymentId, "approve");
    expect((await getDebtView(ana, debtId)).balance.paidMinor).toBe(250000n);
    expect((await getDebtView(ana, debtId)).movements[0].approvals.map((approval) => approval.decision)).toEqual([
      "APPROVED",
      "CLARIFICATION_REQUESTED",
      "CLARIFIED",
      "APPROVED",
    ]);
  });

  it("can be withdrawn by whoever recorded it, before it is confirmed", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "10000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("2500"));
    await expectAppError(decideMovement(ana, paymentId, "withdraw"), "not_your_turn");
    await decideMovement(luis, paymentId, "withdraw");
    expect((await getDebtView(ana, debtId)).movements[0].status).toBe("WITHDRAWN");
    expect((await getDebtView(ana, debtId)).balance.pendingPaymentsMinor).toBe(0n);
    await expectAppError(decideMovement(ana, paymentId, "approve"), "not_your_turn");
  });

  it("keeps pending payments from adding up to more than what is owed", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    await recordMovement(luis, debtId, payment("700"));
    await expectAppError(recordMovement(luis, debtId, payment("400")), "exceeds_balance");
    const second = await recordMovement(luis, debtId, payment("300"));
    await expectAppError(recordMovement(ana, debtId, payment("1")), "nothing_to_pay");
    expect(second.paymentId).toBeTruthy();
  });

  it("settles when the last payment is confirmed, not when it is recorded", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("1000"));
    expect((await getDebtView(ana, debtId)).status).toBe("ACTIVE");

    await decideMovement(ana, paymentId, "approve");
    const view = await getDebtView(luis, debtId);
    expect(view.status).toBe("SETTLED");
    expect(view.balance.outstandingMinor).toBe(0n);
    expect(await notificationsOf(ana)).toContain("DEBT_SETTLED");
    expect(await notificationsOf(luis)).toContain("DEBT_SETTLED");
    expect((await listDebts(luis, "settled")).map((item) => item.id)).toEqual([debtId]);
    await expectAppError(recordMovement(luis, debtId, payment("1")), "invalid_state");
  });

  it("confirms exactly once under concurrent approvals", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const first = await recordMovement(luis, debtId, payment("600"));
    await Promise.all([decideMovement(ana, first.paymentId, "approve"), decideMovement(ana, first.paymentId, "approve"), decideMovement(ana, first.paymentId, "approve")]);
    const view = await getDebtView(ana, debtId);
    expect(view.balance.paidMinor).toBe(60000n);
    expect(view.timeline.filter((entry) => entry.type === "PAYMENT_CONFIRMED")).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: luis.id, type: "PAYMENT_CONFIRMED" } })).toBe(1);
  });

  it("is closed to anybody who is not one of the two participants", async () => {
    const { luis, debtId } = await activeAgreement();
    const eva = await createUser("Eva");
    const { paymentId } = await recordMovement(luis, debtId, payment("100"));
    await expectAppError(getDebtView(eva, debtId), "not_found");
    await expectAppError(recordMovement(eva, debtId, payment("100")), "not_found");
    await expectAppError(decideMovement(eva, paymentId, "approve"), "not_found");
    await expectAppError(addComment(eva, debtId, "hola"), "not_found");
    await expectAppError(proposeVersion(eva, debtId, { idempotencyKey: key(), concept: "x", currency: "MXN", amount: "1", originDate: daysAgo(1), schedule: { type: "NONE", installments: [] }, plannedMethod: null, previousPayments: [], sharedNotes: null, changeNote: null }), "not_found");
    await expectAppError(openDispute(eva, debtId, "x"), "not_found");
    await expectAppError(requestCancellation(eva, debtId, "x"), "not_found");
    expect(await listDebts(eva, "all")).toHaveLength(0);
  });
});

describe("corrections to confirmed movements", () => {
  it("are made with a reversal that both sides approve — the original is never edited", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("1000"));
    await decideMovement(ana, paymentId, "approve");
    expect((await getDebtView(ana, debtId)).status).toBe("SETTLED");

    // A reason is required, and it always undoes the whole payment.
    await expectAppError(recordMovement(ana, debtId, payment("1000", { kind: "REVERSAL", reversesId: paymentId })), "validation");
    const reversal = await recordMovement(ana, debtId, payment("5", { kind: "REVERSAL", reversesId: paymentId, notes: "El cheque rebotó" }));
    await expectAppError(recordMovement(luis, debtId, payment("0", { kind: "REVERSAL", reversesId: paymentId, notes: "otra vez" })), "reversal_already_exists");

    let view = await getDebtView(luis, debtId);
    expect(view.status).toBe("SETTLED"); // nothing changes until it is approved
    expect(view.balance.pendingReversalsMinor).toBe(100000n);
    await expectAppError(decideMovement(ana, reversal.paymentId, "approve"), "own_movement");

    await decideMovement(luis, reversal.paymentId, "approve");
    view = await getDebtView(luis, debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.balance).toMatchObject({ paidMinor: 0n, outstandingMinor: 100000n });
    // The original payment is still there, untouched, with its reversal next to it.
    const original = view.movements.find((movement) => movement.id === paymentId);
    expect(original).toMatchObject({ status: "CONFIRMED", amountMinor: 100000n, canReverse: false });
    expect(original?.reversal).toMatchObject({ id: reversal.paymentId, status: "CONFIRMED" });
    expect(view.timeline.map((entry) => entry.type)).toEqual(expect.arrayContaining(["DEBT_SETTLED", "DEBT_REOPENED"]));
  });

  it("allow a new attempt after a rejected reversal", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("300"));
    await decideMovement(ana, paymentId, "approve");
    const first = await recordMovement(ana, debtId, payment("0", { kind: "REVERSAL", reversesId: paymentId, notes: "Error" }));
    await decideMovement(luis, first.paymentId, "reject", "Sí te pagué");
    const second = await recordMovement(ana, debtId, payment("0", { kind: "REVERSAL", reversesId: paymentId, notes: "Insisto" }));
    expect(second.paymentId).not.toBe(first.paymentId);
  });

  it("change the amount owed only through adjustments both sides approve", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const increase = await recordMovement(ana, debtId, payment("150", { kind: "ADJUSTMENT_INCREASE", notes: "Recargo acordado" }));
    expect((await getDebtView(luis, debtId)).balance.totalOwedMinor).toBe(100000n);
    await decideMovement(luis, increase.paymentId, "approve");
    expect((await getDebtView(luis, debtId)).balance).toMatchObject({ totalOwedMinor: 115000n, outstandingMinor: 115000n });

    const decrease = await recordMovement(luis, debtId, payment("115", { kind: "ADJUSTMENT_DECREASE", notes: "Descuento por pronto pago" }));
    await decideMovement(ana, decrease.paymentId, "approve");
    expect((await getDebtView(ana, debtId)).balance).toMatchObject({ totalOwedMinor: 103500n, outstandingMinor: 103500n });
    await expectAppError(recordMovement(luis, debtId, payment("2000", { kind: "ADJUSTMENT_DECREASE", notes: "x" })), "exceeds_balance");
  });
});

describe("the database refuses what the application should never do", () => {
  it("does not let a confirmed movement be changed or deleted", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const { paymentId } = await recordMovement(luis, debtId, payment("300"));
    await decideMovement(ana, paymentId, "approve");

    await expect(prisma.payment.update({ where: { id: paymentId }, data: { amountMinor: 1n } })).rejects.toThrow(/SD004/);
    await expect(prisma.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", confirmedAt: null } })).rejects.toThrow(/SD004/);
    await expect(prisma.payment.delete({ where: { id: paymentId } })).rejects.toThrow(/SD004/);
    expect((await getDebtView(ana, debtId)).balance.paidMinor).toBe(30000n);
  });

  it("does not let a shared agreement hold a personal record, or a debt change mode", async () => {
    const { debtId } = await activeAgreement({ amount: "1000" });
    await expect(
      prisma.payment.create({ data: { debtId, kind: "PAYMENT", status: "PERSONAL_RECORD", amountMinor: 100n, effectiveDate: new Date() } }),
    ).rejects.toThrow(/SD003/);
    await expect(prisma.debt.update({ where: { id: debtId }, data: { mode: "PERSONAL" } })).rejects.toThrow(/SD001|Debt_shape_by_mode/);
  });

  it("keeps accepted terms, approvals and the audit trail frozen", async () => {
    const { debtId } = await activeAgreement({ amount: "1000" });
    const version = await prisma.debtVersion.findFirstOrThrow({ where: { debtId } });
    await expect(prisma.debtVersion.update({ where: { id: version.id }, data: { terms: { hacked: true } } })).rejects.toThrow(/SD006/);
    await expect(prisma.debtVersion.update({ where: { id: version.id }, data: { status: "PROPOSED" } })).rejects.toThrow(/SD007/);
    await expect(prisma.debtVersion.delete({ where: { id: version.id } })).rejects.toThrow(/SD005/);

    const approval = await prisma.debtApproval.findFirstOrThrow();
    await expect(prisma.debtApproval.update({ where: { id: approval.id }, data: { decision: "REJECTED" } })).rejects.toThrow(/SD009/);
    await expect(prisma.debtApproval.delete({ where: { id: approval.id } })).rejects.toThrow(/SD009/);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { debtId } });
    await expect(prisma.auditEvent.update({ where: { id: event.id }, data: { type: "NOPE" } })).rejects.toThrow(/SD009/);
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/SD009/);
  });
});

describe("changing an agreement that is in force", () => {
  it("keeps the current terms until the other side accepts the amendment", async () => {
    const { ana, luis, debtId } = await activeAgreement({
      amount: "3000",
      schedule: { type: "SINGLE", installments: [{ dueDate: daysAhead(10), amount: "3000" }] },
    });
    const amendment = {
      idempotencyKey: key(),
      concept: "Préstamo coche",
      currency: "MXN",
      amount: "3000",
      originDate: daysAgo(30),
      schedule: { type: "MONTHLY" as const, installments: [1, 2, 3].map((month) => ({ dueDate: monthsAhead(month), amount: "1000" })) },
      plannedMethod: null,
      previousPayments: [],
      sharedNotes: null,
      changeNote: "¿Podemos pasarlo a tres meses?",
    };
    await proposeVersion(luis, debtId, amendment);

    let view = await getDebtView(ana, debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.shared?.open).toMatchObject({ number: 2, kind: "AMENDMENT", changes: ["schedule"], changeNote: "¿Podemos pasarlo a tres meses?" });
    expect(view.progress.rows).toHaveLength(1); // still the old schedule
    expect((await listDebts(ana, "pending"))[0]).toMatchObject({ hasOpenAmendment: true, needsMe: true });

    await acceptOpen(ana, debtId);
    view = await getDebtView(luis, debtId);
    expect(view.progress.rows).toHaveLength(3);
    expect(view.terms.dueDate).toBe(monthsAhead(3));
    expect(view.shared?.versions.map((version) => [version.number, version.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "ACCEPTED"],
    ]);
    expect(await notificationsOf(luis)).toContain("AMENDMENT_APPLIED");
  });

  it("leaves everything as it was when an amendment is rejected", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "3000" });
    await proposeVersion(luis, debtId, {
      idempotencyKey: key(),
      concept: "Otro nombre",
      currency: "MXN",
      amount: "3000",
      originDate: daysAgo(30),
      schedule: { type: "NONE", installments: [] },
      plannedMethod: null,
      previousPayments: [],
      sharedNotes: null,
      changeNote: null,
    });
    const open = (await getDebtView(ana, debtId)).shared!.open!;
    await decideVersion(ana, debtId, { versionId: open.id, termsHash: open.termsHash, action: "reject", comment: "No" });
    const view = await getDebtView(ana, debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.terms.concept).toBe("Préstamo coche");
    expect(view.shared?.current?.number).toBe(1);
  });

  it("cannot change the amount by rewriting the terms", async () => {
    const { luis, debtId } = await activeAgreement({ amount: "3000" });
    await expectAppError(
      proposeVersion(luis, debtId, {
        idempotencyKey: key(),
        concept: "Préstamo coche",
        currency: "MXN",
        amount: "1000",
        originDate: daysAgo(30),
        schedule: { type: "NONE", installments: [] },
        plannedMethod: null,
        previousPayments: [],
        sharedNotes: null,
        changeNote: null,
      }),
      "terms_locked_fields",
    );
    await expectAppError(
      proposeVersion(luis, debtId, { idempotencyKey: key(), concept: "Préstamo coche", currency: "MXN", amount: "3000", originDate: daysAgo(30), schedule: { type: "NONE", installments: [] }, plannedMethod: null, previousPayments: [], sharedNotes: null, changeNote: null }),
      "terms_unchanged",
    );
  });
});

describe("disagreements and endings", () => {
  it("flags a dispute that only its author can resolve, and does not settle meanwhile", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    const pay = await recordMovement(luis, debtId, payment("1000"));
    await expectAppError(openDispute(ana, debtId, "  "), "validation");
    await openDispute(ana, debtId, "No coincide con lo que hablamos");

    let view = await getDebtView(luis, debtId);
    expect(view.status).toBe("DISPUTED");
    expect(view.shared?.dispute).toMatchObject({ openedByMe: false, reason: "No coincide con lo que hablamos" });
    expect(view.can).toMatchObject({ resolveDispute: false, openDispute: false });
    expect(await notificationsOf(luis)).toContain("DISPUTE_OPENED");
    await expectAppError(resolveDispute(luis, debtId), "not_your_turn");

    // The payment can still be confirmed, but a disputed agreement does not settle by itself.
    await decideMovement(ana, pay.paymentId, "approve");
    expect((await getDebtView(ana, debtId)).status).toBe("DISPUTED");

    await resolveDispute(ana, debtId, "Aclarado");
    view = await getDebtView(ana, debtId);
    expect(view.status).toBe("SETTLED");
    expect(view.shared?.dispute).toBeNull();
  });

  it("ends an agreement in force only when both agree", async () => {
    const { ana, luis, debtId } = await activeAgreement({ amount: "1000" });
    await requestCancellation(ana, debtId, "Ya lo arreglamos por fuera");
    let view = await getDebtView(luis, debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.shared?.cancellation).toMatchObject({ requestedByMe: false });
    expect(view.can).toMatchObject({ answerCancellation: true, withdrawCancellation: false });
    await expectAppError(answerCancellation(ana, debtId, "accept"), "not_your_turn");
    await expectAppError(requestCancellation(luis, debtId, "yo también"), "conflict");

    await answerCancellation(luis, debtId, "decline");
    expect((await getDebtView(ana, debtId)).shared?.cancellation).toBeNull();

    await requestCancellation(luis, debtId, "Mejor sí");
    await answerCancellation(ana, debtId, "accept");
    view = await getDebtView(ana, debtId);
    expect(view).toMatchObject({ status: "CANCELLED", closedReason: "mutual" });
    expect((await listDebts(ana, "all")).length).toBe(0);
    expect((await listDebts(ana, "archived")).length).toBe(1);
  });

  it("lets the proposer walk away before anything was agreed", async () => {
    const ana = await createUser("Ana");
    const created = await createSharedAgreement(ana, sharedDebt());
    await requestCancellation(ana, created.debtId, "Me equivoqué");
    const view = await getDebtView(ana, created.debtId);
    expect(view).toMatchObject({ status: "CANCELLED", closedReason: "cancelled" });
    const luis = await createUser("Luis");
    expect((await getInvitationView(luis, created.invitation!.token))?.state).toBe("revoked");
  });

  it("shares comments with the other side", async () => {
    const { ana, luis, debtId } = await activeAgreement();
    await addComment(luis, debtId, "Te pago el viernes");
    expect(await notificationsOf(ana)).toContain("COMMENT_ADDED");
    const entry = (await getDebtView(ana, debtId)).timeline.find((item) => item.type === "COMMENT_ADDED");
    expect(entry).toMatchObject({ actorName: "Luis", actorIsMe: false, data: { text: "Te pago el viernes" } });
  });
});

describe("people who already share an agreement", () => {
  it("receive new proposals directly, without a new link", async () => {
    const { ana, luis } = await activeAgreement();
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    const created = await createSharedAgreement(ana, sharedDebt({ counterparty: { kind: "existing", id: contact.id }, concept: "Segundo préstamo" }));
    expect(created.invitation).toBeNull();

    const view = await getDebtView(luis, created.debtId);
    expect(view.status).toBe("PENDING_APPROVAL");
    expect(view.shared?.open?.actions).toEqual(["accept", "reject", "request_changes"]);
    expect(await notificationsOf(luis)).toContain("PROPOSAL_RECEIVED");
    await acceptOpen(luis, created.debtId);
    expect((await getDebtView(ana, created.debtId)).status).toBe("ACTIVE");
    // Still one contact per person on each side.
    expect(await prisma.contact.count()).toBe(2);
  });
});

describe("the instalment checklist", () => {
  it("shows, instalment by instalment, what one side marked and what both validated", async () => {
    const { ana, luis, debtId } = await activeAgreement({
      amount: "3000",
      schedule: { type: "CUSTOM", installments: [1, 2, 3].map((sequence) => ({ sequence, dueDate: monthsAhead(sequence), amount: "1000" })) },
    });

    const marked = await recordMovement(luis, debtId, payment("1000"));
    let anaView = await getDebtView(ana, debtId);
    expect(anaView.ledger[0]).toMatchObject({ pendingMinor: 100000n, openMinor: 0n, pending: [{ paymentId: marked.paymentId, amountMinor: 100000n }] });
    expect(anaView.ledger[1]).toMatchObject({ pendingMinor: 0n, openMinor: 100000n, cumulativeOpenMinor: 100000n });
    expect(anaView.movements.find((movement) => movement.id === marked.paymentId)?.actions).toContain("approve");
    // Nothing counts yet: the balance only moves once Ana validates.
    expect(anaView.balance.outstandingMinor).toBe(300000n);

    const luisView = await getDebtView(luis, debtId);
    expect(luisView.ledger[0].pendingMinor).toBe(100000n);
    expect(luisView.movements.find((movement) => movement.id === marked.paymentId)?.actions).toEqual(["withdraw"]);

    await decideMovement(ana, marked.paymentId, "approve");
    anaView = await getDebtView(ana, debtId);
    expect(anaView.ledger[0]).toMatchObject({ state: "PAID", paidMinor: 100000n, pendingMinor: 0n, pending: [] });
    expect(anaView.balance.outstandingMinor).toBe(200000n);

    // A partial payment that is rejected never lands anywhere.
    const partial = await recordMovement(luis, debtId, payment("400"));
    await decideMovement(ana, partial.paymentId, "reject", "No llegó");
    anaView = await getDebtView(ana, debtId);
    expect(anaView.ledger[1]).toMatchObject({ paidMinor: 0n, pendingMinor: 0n, openMinor: 100000n });
  });

  it("personal records never wait: the ledger has nothing pending", async () => {
    const owner = await createUser("Ana");
    const { createPersonalDebt } = await import("@/server/services/personal");
    const { debtId } = await createPersonalDebt(owner, {
      mode: "PERSONAL", idempotencyKey: key(), myRole: "DEBTOR", counterparty: { kind: "new", name: "Marta", email: null, phone: null },
      concept: "Cuotas", currency: "MXN", amount: "2000", originDate: daysAgo(5),
      schedule: { type: "CUSTOM", installments: [1, 2].map((sequence) => ({ sequence, dueDate: monthsAhead(sequence), amount: "1000" })) },
      plannedMethod: null, previousPayments: [], privateNotes: null, receivingAccountId: null,
    });
    await recordMovement(owner, debtId, payment("1000"));
    const view = await getDebtView(owner, debtId);
    expect(view.ledger.map((row) => [row.state, row.pendingMinor])).toEqual([["PAID", 0n], ["UPCOMING", 0n]]);
  });
});
