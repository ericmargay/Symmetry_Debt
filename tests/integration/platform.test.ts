import { beforeEach, describe, expect, it } from "vitest";
import { createAuthAdapter, isClaimable } from "@/server/auth/adapter";
import { sha256Hex } from "@/server/crypto";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { deleteAccount, exportUserData, revokeSessions, updatePreferences } from "@/server/services/account";
import { createSharedAgreement } from "@/server/services/agreements";
import { createBankAccount } from "@/server/services/bank-accounts";
import { createContact, deleteContact, setContactArchived, updateContact } from "@/server/services/contacts";
import { listNotifications, markAllNotificationsRead, markNotificationRead, unreadNotificationCount } from "@/server/services/inbox";
import { getInvitationView, respondToInvitation } from "@/server/services/invitations";
import { decideMovement, recordMovement } from "@/server/services/movements";
import { getDashboard, getPersonView, listActivity, listPeople } from "@/server/services/overview";
import { createPersonalDebt } from "@/server/services/personal";
import { runReminders } from "@/server/services/reminders";
import { getDebtView, listDebts } from "@/server/services/views";
import { createUser, daysAgo, daysAhead, expectAppError, notificationsOf, payment, personalDebt, resetDatabase, sharedDebt } from "./helpers";

beforeEach(resetDatabase);

async function accept(invitee: Awaited<ReturnType<typeof createUser>>, token: string) {
  const invite = await getInvitationView(invitee, token);
  await respondToInvitation(invitee, token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" });
}

describe("dashboard", () => {
  it("never adds up figures that do not carry the same weight", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");

    // What Ana wrote down for herself.
    const owes = await createPersonalDebt(ana, personalDebt({ myRole: "DEBTOR", amount: "3000", counterparty: { kind: "new", name: "Marta", email: null, phone: null } }));
    await recordMovement(ana, owes.debtId, payment("500"));
    await createPersonalDebt(ana, personalDebt({ myRole: "CREDITOR", amount: "800", counterparty: { kind: "new", name: "Pepe", email: null, phone: null } }));
    await createPersonalDebt(ana, personalDebt({ myRole: "CREDITOR", amount: "100", currency: "USD", counterparty: { kind: "new", name: "Pepe USD", email: null, phone: null } }));

    // What Ana and Luis agreed on.
    const shared = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, amount: "10000" }));
    await accept(luis, shared.invitation!.token);
    const confirmed = await recordMovement(luis, shared.debtId, payment("1000"));
    await decideMovement(ana, confirmed.paymentId, "approve");
    await recordMovement(luis, shared.debtId, payment("2000")); // recorded, not confirmed

    // What is only a proposal.
    await createSharedAgreement(ana, sharedDebt({ amount: "7000", counterparty: { kind: "new", name: "Rosa", email: null, phone: null } }));

    const dashboard = await getDashboard(ana, "all");
    const mxn = dashboard.totals.find((totals) => totals.currency === "MXN")!;
    const usd = dashboard.totals.find((totals) => totals.currency === "USD")!;

    expect(mxn.iOwe).toEqual({ recordedMinor: 250000n, confirmedMinor: 0n, awaitingMinor: 0n, proposedMinor: 0n });
    expect(mxn.owedToMe).toEqual({ recordedMinor: 80000n, confirmedMinor: 900000n, awaitingMinor: 200000n, proposedMinor: 700000n });
    // Net = firm figures only (recorded + confirmed), never proposals or unconfirmed payments.
    expect(mxn.netMinor).toBe(80000n + 900000n - 250000n);
    // Currencies are never mixed.
    expect(usd.owedToMe.recordedMinor).toBe(10000n);
    expect(usd.netMinor).toBe(10000n);

    expect(dashboard.counts).toMatchObject({ all: 5, personal: 3, shared: 2, pending: 2, settled: 0, archived: 0 });
    expect(dashboard.needsMe.map((item) => item.id)).toEqual([shared.debtId]); // a payment to confirm
    expect(dashboard.waitingOnOther).toHaveLength(1); // the proposal sent to Rosa

    // Filters narrow the totals to one kind.
    const personalOnly = (await getDashboard(ana, "personal")).totals.find((totals) => totals.currency === "MXN")!;
    expect(personalOnly.owedToMe).toMatchObject({ recordedMinor: 80000n, confirmedMinor: 0n, proposedMinor: 0n });
    const sharedOnly = (await getDashboard(ana, "shared")).totals.find((totals) => totals.currency === "MXN")!;
    expect(sharedOnly.owedToMe).toMatchObject({ recordedMinor: 0n, confirmedMinor: 900000n, proposedMinor: 700000n });
    expect(sharedOnly.iOwe.recordedMinor).toBe(0n);

    // Luis sees the same agreement from the other side, and nothing of Ana's personal records.
    const luisTotals = (await getDashboard(luis, "all")).totals;
    expect(luisTotals).toHaveLength(1);
    expect(luisTotals[0].iOwe).toEqual({ recordedMinor: 0n, confirmedMinor: 900000n, awaitingMinor: 200000n, proposedMinor: 0n });
    expect(luisTotals[0].netMinor).toBe(-900000n);
  });

  it("lists what is due soon and what is overdue", async () => {
    const ana = await createUser("Ana");
    await createPersonalDebt(
      ana,
      personalDebt({
        amount: "3000",
        originDate: daysAgo(60),
        schedule: { type: "CUSTOM", installments: [{ dueDate: daysAgo(5), amount: "1000" }, { dueDate: daysAhead(7), amount: "1000" }, { dueDate: daysAhead(90), amount: "1000" }] },
      }),
    );
    const dashboard = await getDashboard(ana, "all");
    expect(dashboard.overdue.map((item) => [item.sequence, item.remainingMinor, item.state])).toEqual([[1, 100000n, "OVERDUE"]]);
    expect(dashboard.upcoming.map((item) => item.sequence)).toEqual([2]);
    expect(dashboard.hasAnyDebt).toBe(true);
    expect((await getDashboard(await createUser("Nueva"), "all")).hasAnyDebt).toBe(false);
  });

  it("shows each person what they owe and are owed, without offsetting one against the other", async () => {
    const ana = await createUser("Ana");
    const contact = await createContact(ana, { name: "Marta", email: null, phone: null, notes: "Vecina" });
    const ref = { kind: "existing" as const, id: contact.id };
    await createPersonalDebt(ana, personalDebt({ myRole: "DEBTOR", amount: "1000", counterparty: ref }));
    await createPersonalDebt(ana, personalDebt({ myRole: "CREDITOR", amount: "1000", counterparty: ref }));

    const [person] = await listPeople(ana);
    expect(person).toMatchObject({ name: "Marta", linked: false, personalCount: 2, sharedCount: 0 });
    // Both amounts stay visible. They are not netted to zero.
    expect(person.totals).toEqual([
      { currency: "MXN", iOweRecordedMinor: 100000n, iOweConfirmedMinor: 0n, owedToMeRecordedMinor: 100000n, owedToMeConfirmedMinor: 0n },
    ]);
    expect((await listDebts(ana, "all")).every((item) => item.status === "ACTIVE")).toBe(true);

    const view = await getPersonView(ana, contact.id);
    expect(view.debts).toHaveLength(2);
    expect(view.canDelete).toBe(false);
    expect(view.notes).toBe("Vecina");
    await expectAppError(deleteContact(ana, contact.id), "contact_in_use");
    await setContactArchived(ana, contact.id, true);
    expect(await listPeople(ana)).toHaveLength(0);
    expect(await listPeople(ana, true)).toHaveLength(1);

    const eva = await createUser("Eva");
    await expectAppError(getPersonView(eva, contact.id), "contact_not_found");
    await expectAppError(updateContact(eva, contact.id, { name: "x", email: null, phone: null, notes: null }), "contact_not_found");
    await expectAppError(deleteContact(eva, contact.id), "contact_not_found");
  });
});

describe("activity", () => {
  it("is each person's own view of the history", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    await createPersonalDebt(ana, personalDebt({ concept: "Solo de Ana" }));
    const shared = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, concept: "De los dos" }));
    await accept(luis, shared.invitation!.token);

    const anaActivity = await listActivity(ana, { limit: 50 });
    expect(anaActivity.map((item) => item.concept)).toEqual(expect.arrayContaining(["Solo de Ana", "De los dos"]));
    expect(anaActivity.find((item) => item.type === "AGREEMENT_ACTIVATED")).toMatchObject({ weight: "both_sides", counterpartyName: "Luis" });
    expect(anaActivity.find((item) => item.concept === "Solo de Ana")).toMatchObject({ weight: "personal", mode: "PERSONAL" });

    const luisActivity = await listActivity(luis, { limit: 50 });
    expect(luisActivity.every((item) => item.concept === "De los dos")).toBe(true);
    expect(JSON.stringify(luisActivity)).not.toContain("Solo de Ana");
    // Who the link was meant for is not Luis's business.
    expect(luisActivity.some((item) => item.type === "INVITATION_CREATED")).toBe(false);
    expect(anaActivity.some((item) => item.type === "INVITATION_CREATED")).toBe(true);

    const page = await listActivity(ana, { limit: 2 });
    expect(page).toHaveLength(2);
    const older = await listActivity(ana, { limit: 50, before: page[1].at });
    expect(older.every((item) => item.at < page[1].at)).toBe(true);
  });
});

describe("notifications and reminders", () => {
  it("can be read and marked as read by their recipient only", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const shared = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email }));
    await accept(luis, shared.invitation!.token);
    await recordMovement(luis, shared.debtId, payment("100"));

    expect(await unreadNotificationCount(ana)).toBeGreaterThanOrEqual(2);
    const list = await listNotifications(ana);
    const toConfirm = list.find((item) => item.type === "PAYMENT_TO_CONFIRM")!;
    expect(toConfirm).toMatchObject({ category: "ACTION_REQUIRED", read: false, href: `/app/debts/${shared.debtId}` });
    expect(toConfirm.data).toMatchObject({ actor: "Luis", amountMinor: "10000", currency: "MXN" });

    await markNotificationRead(luis, toConfirm.id); // not his: nothing happens
    expect((await listNotifications(ana)).find((item) => item.id === toConfirm.id)?.read).toBe(false);
    await markNotificationRead(ana, toConfirm.id);
    expect((await listNotifications(ana)).find((item) => item.id === toConfirm.id)?.read).toBe(true);
    await markAllNotificationsRead(ana);
    expect(await unreadNotificationCount(ana)).toBe(0);

    const invitation = (await listNotifications(luis)).find((item) => item.type === "INVITATION_RECEIVED")!;
    expect(invitation.href).toMatch(/^\/invite\//);
  });

  it("reminds about due dates once, and only the right people", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    const eva = await createUser("Eva");

    // Personal record: only its owner is reminded.
    await createPersonalDebt(
      ana,
      personalDebt({
        amount: "3000",
        originDate: daysAgo(60),
        schedule: { type: "CUSTOM", installments: [{ dueDate: daysAgo(3), amount: "1000" }, { dueDate: daysAhead(0), amount: "1000" }, { dueDate: daysAhead(2), amount: "1000" }] },
      }),
    );
    // Shared agreement: both participants.
    const shared = await createSharedAgreement(
      ana,
      sharedDebt({ inviteEmail: luis.email, amount: "500", schedule: { type: "SINGLE", installments: [{ dueDate: daysAhead(1), amount: "500" }] } }),
    );
    await accept(luis, shared.invitation!.token);
    // A proposal nobody accepted reminds nobody.
    await createSharedAgreement(eva, sharedDebt({ amount: "900", schedule: { type: "SINGLE", installments: [{ dueDate: daysAgo(1), amount: "900" }] } }));

    const first = await runReminders();
    expect(first.created).toBe(5);
    const reminders = (types: string[]) => types.filter((type) => type.startsWith("INSTALLMENT_")).sort();
    expect(reminders(await notificationsOf(ana))).toEqual(["INSTALLMENT_DUE_SOON", "INSTALLMENT_DUE_SOON", "INSTALLMENT_DUE_TODAY", "INSTALLMENT_OVERDUE"]);
    expect(reminders(await notificationsOf(luis))).toEqual(["INSTALLMENT_DUE_SOON"]);
    expect(reminders(await notificationsOf(eva))).toEqual([]);

    const luisReminder = (await listNotifications(luis)).find((item) => item.type === "INSTALLMENT_DUE_SOON")!;
    expect(luisReminder).toMatchObject({ category: "REMINDER", data: { role: "DEBTOR", amountMinor: "50000", counterparty: "Ana", days: 1 } });

    // Running it again (another instance, an external scheduler…) repeats nothing.
    expect((await runReminders()).created).toBe(0);
    expect((await runReminders()).created).toBe(0);

    // Somebody who switched reminders off gets none.
    await prisma.notification.deleteMany({ where: { userId: luis.id, category: "REMINDER" } });
    await updatePreferences(luis, { locale: "es", timeZone: "America/Mexico_City", defaultCurrency: "MXN", remindersEnabled: false, emailActionRequired: true, emailActivity: false, emailReminders: false });
    expect((await runReminders()).created).toBe(0);
    expect(reminders(await notificationsOf(luis))).toEqual([]);
  });
});

describe("export and account deletion", () => {
  it("exports everything that belongs to the user and nothing that belongs to somebody else", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    await createBankAccount(ana, { alias: "Nómina", bankName: "IXE", holderName: "Ana", clabe: "032180000118359719", accountNumber: null, currency: "MXN", isPreferred: true });
    await createBankAccount(luis, { alias: "Secreta de Luis", bankName: "BBVA", holderName: "Luis", clabe: "002010077777777771", accountNumber: null, currency: "MXN", isPreferred: true });
    const personal = await createPersonalDebt(ana, personalDebt({ concept: "Personal de Ana", privateNotes: "nota privada de Ana" }));
    await recordMovement(ana, personal.debtId, payment("100"));
    await createPersonalDebt(luis, personalDebt({ concept: "Personal de Luis", privateNotes: "nota privada de Luis" }));
    const shared = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, concept: "Compartida" }));
    await accept(luis, shared.invitation!.token);

    const data = await exportUserData(ana);
    const json = JSON.stringify(data);
    expect(data.format).toBe("symmetry-debt-export");
    expect(data.profile.email).toBe(ana.email);
    expect(data.bankAccounts).toEqual([expect.objectContaining({ alias: "Nómina", clabe: "032180000118359719" })]);
    expect(data.personalRecords).toHaveLength(1);
    expect(data.personalRecords[0]).toMatchObject({ concept: "Personal de Ana", amountMinor: "1000000", privateNotes: "nota privada de Ana" });
    expect(data.personalRecords[0].movements[0]).toMatchObject({ status: "PERSONAL_RECORD", amountMinor: "10000" });
    expect(data.sharedAgreements).toHaveLength(1);
    expect(data.sharedAgreements[0]).toMatchObject({ concept: "Compartida", myRole: "CREDITOR", counterparty: "Luis" });
    expect(data.sharedAgreements[0].versions[0].answers).toHaveLength(2);

    expect(json).not.toContain("Personal de Luis");
    expect(json).not.toContain("nota privada de Luis");
    expect(json).not.toContain("Secreta de Luis");
    expect(json).not.toContain("002010077777777771");
    // No secrets of the app either.
    expect(json).not.toContain("sessionToken");
    expect(json).not.toMatch(/v1\.[A-Za-z0-9_-]{8}\./);
    expect((await listActivity(ana, { limit: 5 }))[0].type).toBe("DATA_EXPORTED");
  });

  it("deletes the account and what is only the user's, keeping agreements for the other person", async () => {
    const ana = await createUser("Ana");
    const luis = await createUser("Luis");
    await createBankAccount(ana, { alias: "Nómina", bankName: "IXE", holderName: "Ana", clabe: "032180000118359719", accountNumber: null, currency: "MXN", isPreferred: true });
    await createPersonalDebt(ana, personalDebt());
    const settled = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, amount: "100", concept: "Ya pagada" }));
    await accept(luis, settled.invitation!.token);
    const pay = await recordMovement(luis, settled.debtId, payment("100"));
    await decideMovement(ana, pay.paymentId, "approve");
    const open = await createSharedAgreement(ana, sharedDebt({ counterparty: { kind: "existing", id: (await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id, linkedUserId: luis.id } })).id }, concept: "En curso" }));
    const view = await getDebtView(luis, open.debtId);
    await (await import("@/server/services/agreements")).decideVersion(luis, open.debtId, { versionId: view.shared!.open!.id, termsHash: view.shared!.open!.termsHash, action: "accept" });
    const proposalOnly = await createSharedAgreement(ana, sharedDebt({ counterparty: { kind: "new", name: "Rosa", email: null, phone: null }, concept: "Solo propuesta" }));

    // It has to be typed on purpose…
    await expectAppError(deleteAccount(ana, "otra@example.com"), "confirmation_mismatch");
    // …and it is refused while an agreement with a pending balance is in force.
    const blocked = await expectAppError(deleteAccount(ana, ana.email), "account_has_active_agreements");
    expect(blocked.params).toEqual({ count: 1 });
    expect(await prisma.user.count({ where: { id: ana.id } })).toBe(1);

    const last = await recordMovement(luis, open.debtId, payment("10000"));
    await decideMovement(ana, last.paymentId, "approve");
    await deleteAccount(ana, ana.email.toUpperCase());

    expect(await prisma.user.count({ where: { id: ana.id } })).toBe(0);
    expect(await prisma.debt.count({ where: { mode: "PERSONAL" } })).toBe(0);
    expect(await prisma.bankAccount.count()).toBe(0);
    expect(await prisma.contact.count({ where: { ownerId: ana.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
    // The proposal nobody else joined is gone with her.
    expect(await prisma.debt.count({ where: { id: proposalOnly.debtId } })).toBe(0);

    // Luis keeps the two agreements and their confirmed history, with Ana's name as it appeared.
    const kept = await getDebtView(luis, settled.debtId);
    expect(kept.status).toBe("SETTLED");
    expect(kept.counterparty).toMatchObject({ name: "Ana", joined: false, email: null });
    expect(kept.movements[0]).toMatchObject({ status: "CONFIRMED", amountMinor: 10000n });
    expect(kept.timeline.length).toBeGreaterThan(3);
    expect((await listDebts(luis, "settled")).map((item) => item.concept).sort()).toEqual(["En curso", "Ya pagada"]);
    // His contact for her is no longer linked to any account.
    expect((await prisma.contact.findFirstOrThrow({ where: { ownerId: luis.id } })).linkedUserId).toBeNull();
  });
});

describe("sign-in adapter", () => {
  const profile = (email: string, name = "Persona") => ({ id: "ignored", email, emailVerified: null, name, image: null });

  it("stores session tokens hashed and never returns them from the database", async () => {
    const adapter = createAuthAdapter();
    const user = await adapter.createUser!(profile("Nueva@Example.com"));
    expect(user.email).toBe("nueva@example.com");
    expect(user.emailVerified).toBeInstanceOf(Date);

    const expires = new Date(Date.now() + 3600_000);
    await adapter.createSession!({ sessionToken: "raw-token-value", userId: user.id, expires });
    const row = await prisma.session.findFirstOrThrow();
    expect(row.sessionToken).toBe(sha256Hex("raw-token-value"));
    expect(JSON.stringify(row)).not.toContain("raw-token-value");

    expect((await adapter.getSessionAndUser!("raw-token-value"))?.user.id).toBe(user.id);
    // The hash itself is not a valid token.
    expect(await adapter.getSessionAndUser!(row.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!("something-else")).toBeNull();

    const later = new Date(Date.now() + 7200_000);
    expect((await adapter.updateSession!({ sessionToken: "raw-token-value", expires: later }))?.expires.getTime()).toBe(later.getTime());
    await adapter.deleteSession!("raw-token-value");
    expect(await prisma.session.count()).toBe(0);
    await adapter.deleteSession!("raw-token-value"); // already gone: not an error
  });

  it("does not keep the provider's tokens", async () => {
    const adapter = createAuthAdapter();
    const user = await adapter.createUser!(profile("tokens@example.com"));
    await adapter.linkAccount!({
      userId: user.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "1234567890",
      access_token: "ya29.secret-access-token",
      refresh_token: "1//secret-refresh-token",
      id_token: "eyJ.secret.id-token",
    });
    const row = await prisma.account.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain("secret");
    expect(row).toMatchObject({ provider: "google", providerAccountId: "1234567890" });
    expect((await adapter.getUserByAccount!({ provider: "google", providerAccountId: "1234567890" }))?.id).toBe(user.id);
  });

  it("lets the verified owner of an address claim a row nobody has ever signed in to", async () => {
    const adapter = createAuthAdapter();
    // Created by an import script before the person ever signed in.
    const seeded = await prisma.user.create({ data: { email: "eric@example.com", name: "Eric" } });
    const contact = await prisma.contact.create({ data: { ownerId: seeded.id, name: "Marta" } });
    await prisma.debt.create({
      data: {
        mode: "PERSONAL",
        status: "ACTIVE",
        ownerId: seeded.id,
        createdById: seeded.id,
        ownerRole: "DEBTOR",
        contactId: contact.id,
        concept: "Préstamo",
        currency: "MXN",
        principalMinor: 3319700n,
        originDate: new Date("2026-10-16T00:00:00Z"),
      },
    });

    // Auth.js: "is there a user with this email?" → not one that somebody already owns.
    expect(await adapter.getUserByEmail!("Eric@Example.com")).toBeNull();
    const claimed = await adapter.createUser!(profile("eric@example.com", "Eric Google"));
    expect(claimed.id).toBe(seeded.id);
    expect(claimed.name).toBe("Eric"); // what was already there is kept
    await adapter.linkAccount!({ userId: claimed.id, type: "oidc", provider: "google", providerAccountId: "g-real-1" });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.debt.count({ where: { ownerId: claimed.id } })).toBe(1);

    // From now on the address belongs to that Google identity: it cannot be claimed again.
    expect((await adapter.getUserByEmail!("eric@example.com"))?.id).toBe(seeded.id);
    await expect(adapter.createUser!(profile("eric@example.com"))).rejects.toThrow();
    expect(await prisma.account.count()).toBe(1);
  });

  it("upgrades identities created with the local mock issuer, and only those", async () => {
    const adapter = createAuthAdapter();
    const local = await adapter.createUser!(profile("ana@example.com", "Ana"));
    await adapter.linkAccount!({ userId: local.id, type: "oidc", provider: "google", providerAccountId: "mock-abc123" });
    await adapter.createSession!({ sessionToken: "local-session", userId: local.id, expires: new Date(Date.now() + 1000) });

    expect(await adapter.getUserByEmail!("ana@example.com")).toBeNull();
    const real = await adapter.createUser!(profile("ana@example.com"));
    await adapter.linkAccount!({ userId: real.id, type: "oidc", provider: "google", providerAccountId: "1122334455" });
    expect(real.id).toBe(local.id);
    const accounts = await prisma.account.findMany();
    expect(accounts.map((account) => account.providerAccountId)).toEqual(["1122334455"]);
    // Sessions opened through the unverified identity are ended.
    expect(await prisma.session.count()).toBe(0);

    expect(isClaimable([])).toBe(true);
    expect(isClaimable([{ providerAccountId: "mock-1" }])).toBe(true);
    expect(isClaimable([{ providerAccountId: "1122334455" }])).toBe(false);
    expect(isClaimable([{ providerAccountId: "mock-1" }, { providerAccountId: "1122334455" }])).toBe(false);
  });

  it("signs the user out everywhere on request", async () => {
    const ana = await createUser("Ana");
    const adapter = createAuthAdapter();
    for (const token of ["a", "b", "c"]) {
      await adapter.createSession!({ sessionToken: token, userId: ana.id, expires: new Date(Date.now() + 3600_000) });
    }
    expect(await revokeSessions(ana, sha256Hex("b"))).toBe(2);
    expect((await adapter.getSessionAndUser!("b"))?.user.id).toBe(ana.id);
    expect(await adapter.getSessionAndUser!("a")).toBeNull();
    expect(await revokeSessions(ana)).toBe(1);
  });
});

describe("rate limiting", () => {
  it("counts per key and per window, across callers", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetEnvCache();
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit("test:key", 5, 60)));
      expect(results.filter((result) => result.ok)).toHaveLength(5);
      expect(results.filter((result) => !result.ok)).toHaveLength(3);
      expect(results.find((result) => !result.ok)?.retryAfterSeconds).toBeGreaterThan(0);
      expect((await rateLimit("test:other", 5, 60)).ok).toBe(true);
    } finally {
      process.env.RATE_LIMIT_ENABLED = "false";
      resetEnvCache();
    }
  });

  it("takes the client address from the trusted end of X-Forwarded-For", async () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    // With one trusted proxy, anything a client puts in front of the list is ignored.
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
