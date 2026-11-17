import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { confirmCounterpartyIdentity, decideVersion } from "@/server/services/agreements";
import { addAttachment, readAttachment } from "@/server/services/attachments";
import { proposeConversion } from "@/server/services/conversion";
import { getInvitationView, respondToInvitation } from "@/server/services/invitations";
import { decideMovement, recordMovement } from "@/server/services/movements";
import { createPersonalDebt, deletePersonalDebt, updatePersonalDebt } from "@/server/services/personal";
import { getDashboard } from "@/server/services/overview";
import { getDebtView, listDebts } from "@/server/services/views";
import { createUser, daysAgo, expectAppError, key, monthsAhead, payment, personalDebt, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** Ana tracks privately that Luis owes her 10,000 and has paid 1,000 + 2,000 + 500. */
async function personalWithHistory() {
  const ana = await createUser("Ana");
  const luis = await createUser("Luis");
  const { debtId } = await createPersonalDebt(
    ana,
    personalDebt({
      myRole: "CREDITOR",
      amount: "10000",
      originDate: daysAgo(120),
      concept: "Préstamo a Luis",
      privateNotes: "Dijo que paga cuando venda el coche",
      counterparty: { kind: "new", name: "Luis", email: null, phone: null },
    }),
  );
  const p1 = await recordMovement(ana, debtId, payment("1000", { effectiveDate: daysAgo(90), notes: "Nota privada del primer abono" }));
  const p2 = await recordMovement(ana, debtId, payment("2000", { effectiveDate: daysAgo(60) }));
  const p3 = await recordMovement(ana, debtId, payment("500", { effectiveDate: daysAgo(10) }));
  return { ana, luis, debtId, paymentIds: [p1.paymentId, p2.paymentId, p3.paymentId] };
}

function conversion(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key(),
    history: "FULL_HISTORY" as const,
    paymentIds: [] as string[],
    includeNotes: false,
    includeReceipts: false,
    inviteEmail: null as string | null,
    shareAccountId: null,
    ...overrides,
  };
}

async function snapshot(debtId: string) {
  const debt = await prisma.debt.findUniqueOrThrow({
    where: { id: debtId },
    include: { payments: { orderBy: { recordedAt: "asc" } }, installments: true },
  });
  return JSON.stringify(debt, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

describe("turning a personal record into a shared agreement", () => {
  it("writes a proposal and leaves the personal record exactly as it was", async () => {
    const { ana, luis, debtId, paymentIds } = await personalWithHistory();
    const before = await snapshot(debtId);

    const created = await proposeConversion(ana, debtId, conversion({ paymentIds: [paymentIds[0], paymentIds[1]], inviteEmail: luis.email }));
    expect(created.invitation?.token).toBeTruthy();
    expect(created.debtId).not.toBe(debtId);

    // Byte for byte the same personal record (only its private history gained an entry).
    const after = JSON.parse(await snapshot(debtId));
    const original = JSON.parse(before);
    expect({ ...after, updatedAt: null, lockVersion: null }).toEqual({ ...original, updatedAt: null, lockVersion: null });

    const personal = await getDebtView(ana, debtId);
    expect(personal.status).toBe("ACTIVE");
    expect(personal.balance).toMatchObject({ level: "RECORDED", paidMinor: 350000n, outstandingMinor: 650000n });
    expect(personal.personal?.conversion).toMatchObject({ debtId: created.debtId, status: "PENDING_APPROVAL" });
    expect(personal.can.convert).toBe(false);
    expect(personal.timeline[0].type).toBe("CONVERSION_PROPOSED");

    // The proposal carries the amount and only the two payments Ana picked — as payments to be
    // recognised, not as confirmed payments.
    const proposal = await getDebtView(ana, created.debtId);
    expect(proposal).toMatchObject({ mode: "SHARED", status: "PENDING_APPROVAL", role: "CREDITOR", termsAreProposal: true });
    expect(proposal.terms.principalMinor).toBe("1000000");
    expect(proposal.terms.historicalPayments.map((item) => item.amountMinor)).toEqual(["100000", "200000"]);
    expect(proposal.terms.historicalPayments.every((item) => item.note === null)).toBe(true);
    expect(proposal.terms.sharedNotes).toBeNull();
    expect(proposal.movements).toHaveLength(0);
    expect(proposal.balance.paidMinor).toBe(0n);
    expect(proposal.shared?.sourceDebtId).toBe(debtId);
    expect(await prisma.payment.count({ where: { debtId: created.debtId } })).toBe(0);

    // While it is pending the totals still count the personal record once, and the proposal
    // separately as a proposal.
    const totals = (await getDashboard(ana, "all")).totals[0];
    expect(totals.owedToMe).toMatchObject({ recordedMinor: 650000n, confirmedMinor: 0n, proposedMinor: 1000000n });
  });

  it("confirms the selected payments only when the other person accepts, and archives the record", async () => {
    const { ana, luis, debtId, paymentIds } = await personalWithHistory();
    const created = await proposeConversion(ana, debtId, conversion({ paymentIds: [paymentIds[0], paymentIds[1]], inviteEmail: luis.email }));

    const invite = await getInvitationView(luis, created.invitation!.token);
    // Luis sees what he is asked to recognise — and nothing of Ana's private record.
    expect(invite?.proposal?.terms.historicalPayments).toHaveLength(2);
    expect(JSON.stringify(invite)).not.toContain("Dijo que paga");
    expect(JSON.stringify(invite)).not.toContain("Nota privada");
    await expectAppError(getDebtView(luis, debtId), "not_found");

    await respondToInvitation(luis, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "accept",
    });

    const shared = await getDebtView(luis, created.debtId);
    expect(shared.status).toBe("ACTIVE");
    expect(shared.balance).toMatchObject({ level: "CONFIRMED", totalOwedMinor: 1000000n, paidMinor: 300000n, outstandingMinor: 700000n });
    expect(shared.movements.map((movement) => [movement.origin, movement.status, movement.amountMinor])).toEqual([
      ["HISTORICAL", "CONFIRMED", 200000n],
      ["HISTORICAL", "CONFIRMED", 100000n],
    ]);
    // Luis never gets a way back to the personal record.
    expect(shared.shared?.sourceDebtId).toBeNull();

    // The personal record is now a read-only archive with its whole history intact — including
    // the 500 payment that was NOT shared.
    const personal = await getDebtView(ana, debtId);
    expect(personal.status).toBe("CONVERTED");
    expect(personal.movements).toHaveLength(3);
    expect(personal.movements.every((movement) => movement.status === "PERSONAL_RECORD")).toBe(true);
    expect(personal.balance.paidMinor).toBe(350000n);
    expect(personal.personal?.privateNotes).toBe("Dijo que paga cuando venda el coche");
    expect(personal.can).toMatchObject({ edit: false, recordPayment: false, convert: false, delete: true });
    expect(personal.timeline[0].type).toBe("CONVERSION_COMPLETED");
    await expectAppError(recordMovement(ana, debtId, payment("100")), "invalid_state");

    // Counted once: the archive drops out of the totals, the agreement comes in as confirmed.
    const totals = (await getDashboard(ana, "all")).totals[0];
    expect(totals.owedToMe).toMatchObject({ recordedMinor: 0n, confirmedMinor: 700000n, proposedMinor: 0n });
    expect((await listDebts(ana, "all")).map((item) => item.id)).toEqual([created.debtId]);
    expect((await listDebts(ana, "archived")).map((item) => item.id)).toEqual([debtId]);

    // From here on, movements go through bilateral approval.
    const next = await recordMovement(luis, created.debtId, payment("700"));
    expect((await getDebtView(ana, created.debtId)).balance.paidMinor).toBe(300000n);
    await decideMovement(ana, next.paymentId, "approve");
    expect((await getDebtView(ana, created.debtId)).balance.paidMinor).toBe(370000n);
  });

  it("keeps the personal record untouched when the other person says no", async () => {
    const { ana, luis, debtId, paymentIds } = await personalWithHistory();
    const before = await snapshot(debtId);
    const created = await proposeConversion(ana, debtId, conversion({ paymentIds, inviteEmail: luis.email }));
    const invite = await getInvitationView(luis, created.invitation!.token);
    await respondToInvitation(luis, created.invitation!.token, {
      versionId: invite!.proposal!.versionId,
      termsHash: invite!.proposal!.termsHash,
      action: "reject",
      comment: "No estoy de acuerdo",
    });

    const after = JSON.parse(await snapshot(debtId));
    expect({ ...after, updatedAt: null, lockVersion: null }).toEqual({ ...JSON.parse(before), updatedAt: null, lockVersion: null });

    const personal = await getDebtView(ana, debtId);
    expect(personal.status).toBe("ACTIVE");
    expect(personal.personal?.conversion).toBeNull();
    expect(personal.can).toMatchObject({ convert: true, edit: true, recordPayment: true });
    expect(personal.timeline.map((entry) => entry.type).slice(0, 2)).toEqual(["CONVERSION_CLOSED", "CONVERSION_PROPOSED"]);
    expect(await prisma.payment.count({ where: { status: "CONFIRMED" } })).toBe(0);

    // She can keep using it, and try again later.
    await recordMovement(ana, debtId, payment("100"));
    const again = await proposeConversion(ana, debtId, conversion());
    expect(again.debtId).not.toBe(created.debtId);
  });

  it("can share just the balance owed today, with no history at all", async () => {
    const { ana, luis, debtId } = await personalWithHistory();
    const created = await proposeConversion(ana, debtId, conversion({ history: "BALANCE_ONLY", inviteEmail: luis.email, includeNotes: true }));

    const proposal = await getDebtView(ana, created.debtId);
    expect(proposal.terms).toMatchObject({ principalMinor: "650000", historicalPayments: [], sharedNotes: "Dijo que paga cuando venda el coche" });
    expect(proposal.terms.balanceAsOf).not.toBeNull();

    const invite = await getInvitationView(luis, created.invitation!.token);
    await respondToInvitation(luis, created.invitation!.token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" });
    const shared = await getDebtView(luis, created.debtId);
    expect(shared.balance).toMatchObject({ totalOwedMinor: 650000n, paidMinor: 0n, outstandingMinor: 650000n });
    expect(shared.movements).toHaveLength(0);
  });

  it("carries the schedule over, adjusted to what is being shared", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(
      ana,
      personalDebt({
        myRole: "CREDITOR",
        amount: "3000",
        originDate: daysAgo(40),
        schedule: { type: "MONTHLY", installments: [{ dueDate: daysAgo(10), amount: "1000" }, { dueDate: monthsAhead(1), amount: "1000" }, { dueDate: monthsAhead(2), amount: "1000" }] },
      }),
    );
    await recordMovement(ana, debtId, payment("1400", { effectiveDate: daysAgo(5) }));

    const full = await proposeConversion(ana, debtId, conversion());
    expect((await getDebtView(ana, full.debtId)).terms).toMatchObject({ scheduleType: "MONTHLY", dueDate: monthsAhead(2) });
    expect((await getDebtView(ana, full.debtId)).terms.installments.map((item) => item.amountMinor)).toEqual(["100000", "100000", "100000"]);

    const open = (await getDebtView(ana, full.debtId)).shared!.open!;
    await decideVersion(ana, full.debtId, { versionId: open.id, termsHash: open.termsHash, action: "withdraw" });

    const balanceOnly = await proposeConversion(ana, debtId, conversion({ history: "BALANCE_ONLY" }));
    const terms = (await getDebtView(ana, balanceOnly.debtId)).terms;
    expect(terms.principalMinor).toBe("160000");
    expect(terms.scheduleType).toBe("CUSTOM");
    expect(terms.installments.map((item) => [item.dueDate, item.amountMinor])).toEqual([
      [monthsAhead(1), "60000"],
      [monthsAhead(2), "100000"],
    ]);
  });

  it("allows only one live proposal per record, and only for its owner", async () => {
    const { ana, luis, debtId, paymentIds } = await personalWithHistory();
    const input = conversion();
    const [first, second] = await Promise.all([proposeConversion(ana, debtId, input), proposeConversion(ana, debtId, input)]);
    expect(first.debtId).toBe(second.debtId);
    await expectAppError(proposeConversion(ana, debtId, conversion()), "conversion_pending");
    expect(await prisma.debt.count({ where: { sourceDebtId: debtId } })).toBe(1);

    await expectAppError(proposeConversion(luis, debtId, conversion()), "not_found");
    const eva = await createUser("Eva");
    await expectAppError(proposeConversion(eva, debtId, conversion()), "not_found");
    // Payments from another record cannot be smuggled into the proposal.
    const other = await createPersonalDebt(ana, personalDebt());
    await expectAppError(proposeConversion(ana, other.debtId, conversion({ paymentIds: [paymentIds[0]] })), "not_found");
  });

  it("does not let anybody take over a private record because a name or an email matches", async () => {
    const ana = await createUser("Ana");
    // A registered user who happens to have the same name and address as Ana's private contact.
    const luis = await createUser("Luis", { email: "luis@example.com" });
    const { debtId } = await createPersonalDebt(
      ana,
      personalDebt({ myRole: "CREDITOR", counterparty: { kind: "new", name: "Luis", email: "luis@example.com", phone: null } }),
    );

    await expectAppError(getDebtView(luis, debtId), "not_found");
    expect(await listDebts(luis, "all")).toHaveLength(0);
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    expect(contact.linkedUserId).toBeNull();
    expect(await prisma.notification.count({ where: { userId: luis.id } })).toBe(0);

    // Even after Ana proposes to share it, Luis only gets what the proposal contains, and only
    // by answering it.
    const created = await proposeConversion(ana, debtId, conversion({ inviteEmail: "luis@example.com" }));
    expect((await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } })).linkedUserId).toBeNull();
    await expectAppError(getDebtView(luis, created.debtId), "not_found");
    await expectAppError(getDebtView(luis, debtId), "not_found");
  });

  it("copies receipts only when asked, and the file survives until nobody uses it", async () => {
    const { ana, luis, debtId, paymentIds } = await personalWithHistory();
    const onPayment = await addAttachment(ana, { debtId, paymentId: paymentIds[0], fileName: "abono1.png", bytes: PNG });
    await addAttachment(ana, { debtId, paymentId: paymentIds[2], fileName: "abono3.png", bytes: PNG });
    await addAttachment(ana, { debtId, fileName: "pagaré.png", bytes: PNG });

    const created = await proposeConversion(ana, debtId, conversion({ paymentIds: [paymentIds[0]], includeReceipts: true, inviteEmail: luis.email }));
    const copies = await prisma.attachment.findMany({ where: { debtId: created.debtId }, orderBy: { fileName: "asc" } });
    // The receipt of the shared payment and the one of the debt itself — not the unshared one.
    expect(copies.map((copy) => copy.fileName)).toEqual(["abono1.png", "pagaré.png"]);

    // Luis can look at them while reviewing the proposal, through his invitation only.
    const token = created.invitation!.token;
    await expectAppError(readAttachment(luis, copies[0].id), "not_found");
    expect(Array.from((await readAttachment(luis, copies[0].id, token)).body)).toEqual(Array.from(PNG));
    // …but never at the originals in Ana's private record.
    await expectAppError(readAttachment(luis, onPayment.id, token), "not_found");
    const eva = await createUser("Eva");
    await expectAppError(readAttachment(eva, copies[0].id, token + "x"), "not_found");

    // Deleting the personal record keeps the shared copies readable.
    await deletePersonalDebt(ana, debtId);
    expect(Array.from((await readAttachment(ana, copies[0].id)).body)).toEqual(Array.from(PNG));
    expect((await getDebtView(ana, created.debtId)).shared?.sourceDebtId).toBeNull();
  });

  it("stays a proposal if the record changes afterwards, and still needs the identity check", async () => {
    const { ana, luis, debtId } = await personalWithHistory();
    const created = await proposeConversion(ana, debtId, conversion());
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });

    // Ana keeps editing her own record while she waits.
    await updatePersonalDebt(ana, debtId, {
      myRole: "CREDITOR",
      counterparty: { kind: "existing", id: contact.id },
      concept: "Préstamo a Luis (corregido)",
      currency: "MXN",
      amount: "10000",
      originDate: daysAgo(120),
      schedule: { type: "NONE", installments: [] },
      plannedMethod: null,
      privateNotes: null,
      receivingAccountId: null,
    });
    expect((await getDebtView(ana, created.debtId)).terms.concept).toBe("Préstamo a Luis");

    const invite = await getInvitationView(luis, created.invitation!.token);
    const outcome = await respondToInvitation(luis, created.invitation!.token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" });
    expect(outcome.awaitingIdentity).toBe(true);
    expect((await getDebtView(ana, debtId)).status).toBe("ACTIVE");

    await confirmCounterpartyIdentity(ana, created.debtId);
    expect((await getDebtView(ana, debtId)).status).toBe("CONVERTED");
    expect((await getDebtView(ana, created.debtId)).status).toBe("ACTIVE");
  });
});
