import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { deletePersonalMovement, recordMovement, updatePersonalMovement } from "@/server/services/movements";
import { createPersonalDebt, deletePersonalDebt, setPersonalDebtCancelled, updatePersonalDebt } from "@/server/services/personal";
import { getDebtView, listDebts } from "@/server/services/views";
import { createUser, daysAgo, daysAhead, expectAppError, key, monthsAhead, notificationsOf, payment, personalDebt, resetDatabase, today } from "./helpers";

beforeEach(resetDatabase);

describe("personal tracking", () => {
  it("creates a record without involving anybody else", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ myRole: "CREDITOR", amount: "1,500.50", concept: "  Renta  de  marzo " }));

    const view = await getDebtView(ana, debtId);
    expect(view.mode).toBe("PERSONAL");
    expect(view.status).toBe("ACTIVE");
    expect(view.role).toBe("CREDITOR");
    expect(view.terms.concept).toBe("Renta de marzo");
    expect(view.balance.level).toBe("RECORDED");
    expect(view.balance.totalOwedMinor).toBe(150050n);
    expect(view.balance.outstandingMinor).toBe(150050n);
    expect(view.counterparty.name).toBe("Luis");
    // The other person has no account and is not needed for anything.
    expect(view.counterparty.joined).toBe(false);
    expect(view.shared).toBeNull();

    // The counterparty is a private contact, linked to nobody.
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    expect(contact.linkedUserId).toBeNull();
    // Nobody is notified about a personal record.
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it("records payments and partial payments, and keeps the balance up to date", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "10000" }));

    await recordMovement(ana, debtId, payment("2500", { method: "BANK_TRANSFER", originBank: "BBVA", destinationText: "Cuenta de Luis", trackingKey: "MBAN01002603050000000001" }));
    await recordMovement(ana, debtId, payment("1500.25", { method: "CASH", place: "En su casa", effectiveDate: daysAgo(2) }));

    const view = await getDebtView(ana, debtId);
    expect(view.balance.paidMinor).toBe(400025n);
    expect(view.balance.outstandingMinor).toBe(599975n);
    expect(view.movements).toHaveLength(2);
    expect(view.movements.every((movement) => movement.status === "PERSONAL_RECORD")).toBe(true);
    expect(view.movements.every((movement) => movement.canEdit && movement.canDelete)).toBe(true);
    // No bilateral machinery on a personal record.
    expect(view.movements.every((movement) => movement.actions.length === 0 && movement.approvals.length === 0)).toBe(true);

    const transfer = view.movements.find((movement) => movement.method === "BANK_TRANSFER");
    expect(transfer?.bank).toMatchObject({ originBank: "BBVA", destinationLabel: "Cuenta de Luis", trackingKey: "MBAN01002603050000000001" });
    const cash = view.movements.find((movement) => movement.method === "CASH");
    expect(cash?.place).toBe("En su casa");
    expect(cash?.effectiveDate).toBe(daysAgo(2));
  });

  it("settles automatically with the last payment and reopens if that payment is removed", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "1000" }));
    await recordMovement(ana, debtId, payment("400"));
    const last = await recordMovement(ana, debtId, payment("600"));

    let view = await getDebtView(ana, debtId);
    expect(view.status).toBe("SETTLED");
    expect(view.settledAt).not.toBeNull();
    expect(view.can.recordPayment).toBe(false);

    await deletePersonalMovement(ana, last.paymentId);
    view = await getDebtView(ana, debtId);
    expect(view.status).toBe("ACTIVE");
    expect(view.balance.outstandingMinor).toBe(60000n);
    expect(view.timeline.map((entry) => entry.type)).toEqual(expect.arrayContaining(["DEBT_SETTLED", "DEBT_REOPENED", "PAYMENT_DELETED"]));
  });

  it("does not allow paying more than what is owed", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "1000" }));
    await recordMovement(ana, debtId, payment("900"));
    const error = await expectAppError(recordMovement(ana, debtId, payment("100.01")), "exceeds_balance");
    expect(error.fields).toEqual({ amount: "amountExceedsBalance" });
  });

  it("rejects invalid amounts and dates", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "1000", originDate: daysAgo(10) }));
    expect((await expectAppError(recordMovement(ana, debtId, payment("abc")), "validation")).fields).toEqual({ amount: "amountInvalid" });
    expect((await expectAppError(recordMovement(ana, debtId, payment("0")), "validation")).fields).toEqual({ amount: "amountNotPositive" });
    expect((await expectAppError(recordMovement(ana, debtId, payment("10.999")), "validation")).fields).toEqual({ amount: "amountDecimals" });
    expect((await expectAppError(recordMovement(ana, debtId, payment("10", { effectiveDate: daysAhead(5) })), "validation")).fields).toEqual({ effectiveDate: "dateInFuture" });
    expect((await expectAppError(recordMovement(ana, debtId, payment("10", { effectiveDate: daysAgo(11) })), "validation")).fields).toEqual({ effectiveDate: "dateBeforeOrigin" });
    expect((await expectAppError(createPersonalDebt(ana, personalDebt({ amount: "" })), "validation")).fields).toEqual({ amount: "amountEmpty" });
    expect((await expectAppError(createPersonalDebt(ana, personalDebt({ originDate: daysAhead(10) })), "terms_invalid")).fields).toEqual({ originDate: "dateInFuture" });
  });

  it("lets the owner edit their own payments freely, keeping a trace", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "1000" }));
    const { paymentId } = await recordMovement(ana, debtId, payment("300"));

    await updatePersonalMovement(ana, paymentId, { ...payment("350", { method: "OTHER", notes: "Corregido" }) });
    const view = await getDebtView(ana, debtId);
    expect(view.balance.paidMinor).toBe(35000n);
    expect(view.movements[0]).toMatchObject({ amountMinor: 35000n, method: "OTHER", notes: "Corregido" });

    const edit = view.timeline.find((entry) => entry.type === "PAYMENT_UPDATED");
    expect(edit?.data).toMatchObject({ amountMinor: "35000", before: { amountMinor: "30000" } });

    // Editing cannot overshoot the balance either.
    await expectAppError(updatePersonalMovement(ana, paymentId, { ...payment("1000.01") }), "exceeds_balance");
  });

  it("accepts previous payments when creating the record", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(
      ana,
      personalDebt({
        amount: "5000",
        originDate: daysAgo(60),
        previousPayments: [
          { amount: "1000", effectiveDate: daysAgo(40), method: "CASH", note: "Primer abono" },
          { amount: "500", effectiveDate: daysAgo(10), method: null, note: null },
        ],
      }),
    );
    const view = await getDebtView(ana, debtId);
    expect(view.balance.paidMinor).toBe(150000n);
    expect(view.movements.map((movement) => movement.status)).toEqual(["PERSONAL_RECORD", "PERSONAL_RECORD"]);

    await expectAppError(
      createPersonalDebt(ana, personalDebt({ amount: "100", previousPayments: [{ amount: "100", effectiveDate: daysAgo(1), method: null, note: null }] })),
      "terms_invalid",
    );
  });

  it("is idempotent: the same submission twice creates one record and one payment", async () => {
    const ana = await createUser("Ana");
    const input = personalDebt();
    const [first, second] = await Promise.all([createPersonalDebt(ana, input), createPersonalDebt(ana, input)]);
    expect(first.debtId).toBe(second.debtId);
    expect(await prisma.debt.count()).toBe(1);
    // …and a third time, later.
    expect((await createPersonalDebt(ana, input)).debtId).toBe(first.debtId);
    expect(await prisma.contact.count()).toBe(1);

    const pay = payment("100");
    const results = await Promise.all([recordMovement(ana, first.debtId, pay), recordMovement(ana, first.debtId, pay), recordMovement(ana, first.debtId, pay)]);
    expect(new Set(results.map((result) => result.paymentId)).size).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("never lets two concurrent payments overshoot the balance", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "1000" }));
    const results = await Promise.allSettled([
      recordMovement(ana, debtId, payment("700")),
      recordMovement(ana, debtId, payment("700")),
      recordMovement(ana, debtId, payment("700")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getDebtView(ana, debtId)).balance.outstandingMinor).toBe(30000n);
  });

  it("supports a monthly schedule with early and partial payments", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(
      ana,
      personalDebt({
        amount: "3000",
        originDate: daysAgo(40),
        schedule: {
          type: "MONTHLY",
          installments: [
            { dueDate: daysAgo(10), amount: "1000" },
            { dueDate: monthsAhead(1), amount: "1000" },
            { dueDate: monthsAhead(2), amount: "1000" },
          ],
        },
      }),
    );

    let view = await getDebtView(ana, debtId);
    expect(view.terms.dueDate).toBe(monthsAhead(2));
    expect(view.progress.rows.map((row) => row.state)).toEqual(["OVERDUE", "UPCOMING", "UPCOMING"]);
    expect(view.progress.overdueMinor).toBe(100000n);
    expect(view.timeline.some((entry) => entry.type === "INSTALLMENT_OVERDUE")).toBe(true);

    await recordMovement(ana, debtId, payment("1400"));
    view = await getDebtView(ana, debtId);
    expect(view.progress.rows.map((row) => [row.paidMinor, row.remainingMinor, row.state])).toEqual([
      [100000n, 0n, "PAID"],
      [40000n, 60000n, "PARTIAL"],
      [0n, 100000n, "UPCOMING"],
    ]);

    const list = await listDebts(ana, "all");
    expect(list[0]).toMatchObject({ nextDueDate: monthsAhead(1), nextDueMinor: 60000n, overdueMinor: 0n });
  });

  it("refuses a schedule that does not add up", async () => {
    const ana = await createUser("Ana");
    const error = await expectAppError(
      createPersonalDebt(ana, personalDebt({ amount: "3000", schedule: { type: "CUSTOM", installments: [{ dueDate: daysAhead(5), amount: "1000" }, { dueDate: daysAhead(40), amount: "1500" }] } })),
      "terms_invalid",
    );
    expect(error.fields).toEqual({ schedule: "scheduleSum" });
  });

  it("lets the owner change the terms and reschedule without asking anybody", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt({ amount: "3000" }));
    await recordMovement(ana, debtId, payment("500"));
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });

    const update = {
      myRole: "DEBTOR" as const,
      counterparty: { kind: "existing" as const, id: contact.id },
      concept: "Préstamo (renegociado)",
      currency: "MXN",
      amount: "3600",
      originDate: daysAgo(30),
      schedule: { type: "CUSTOM" as const, installments: [{ dueDate: daysAhead(10), amount: "1600" }, { dueDate: daysAhead(40), amount: "2000" }] },
      plannedMethod: "BANK_TRANSFER",
      privateNotes: "Hablamos por teléfono",
      receivingAccountId: null,
    };
    await updatePersonalDebt(ana, debtId, update);

    const view = await getDebtView(ana, debtId);
    expect(view.terms).toMatchObject({ concept: "Préstamo (renegociado)", principalMinor: "360000", plannedMethod: "BANK_TRANSFER" });
    expect(view.balance.outstandingMinor).toBe(310000n);
    expect(view.progress.rows).toHaveLength(2);
    expect(view.personal?.privateNotes).toBe("Hablamos por teléfono");
    expect(view.timeline.some((entry) => entry.type === "DEBT_UPDATED")).toBe(true);

    // The amount cannot drop below what was already recorded as paid.
    const error = await expectAppError(updatePersonalDebt(ana, debtId, { ...update, amount: "400", schedule: { type: "NONE", installments: [] } }), "validation");
    expect(error.fields).toEqual({ amount: "amountBelowPaid" });
  });

  it("can be cancelled, reopened and deleted by its owner", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt());
    await setPersonalDebtCancelled(ana, debtId, true);
    expect((await getDebtView(ana, debtId)).status).toBe("CANCELLED");
    await expectAppError(recordMovement(ana, debtId, payment("10")), "invalid_state");
    expect(await listDebts(ana, "all")).toHaveLength(0);
    expect(await listDebts(ana, "archived")).toHaveLength(1);

    await setPersonalDebtCancelled(ana, debtId, false);
    expect((await getDebtView(ana, debtId)).status).toBe("ACTIVE");

    await deletePersonalDebt(ana, debtId);
    expect(await prisma.debt.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { debtId } })).toBe(0);
  });

  it("is invisible to everybody else", async () => {
    const ana = await createUser("Ana");
    const eva = await createUser("Eva");
    const { debtId } = await createPersonalDebt(ana, personalDebt());
    const { paymentId } = await recordMovement(ana, debtId, payment("100"));

    await expectAppError(getDebtView(eva, debtId), "not_found");
    await expectAppError(recordMovement(eva, debtId, payment("100")), "not_found");
    await expectAppError(updatePersonalMovement(eva, paymentId, { ...payment("1") }), "not_found");
    await expectAppError(deletePersonalMovement(eva, paymentId), "not_found");
    await expectAppError(deletePersonalDebt(eva, debtId), "not_found");
    await expectAppError(setPersonalDebtCancelled(eva, debtId, true), "not_found");
    await expectAppError(
      updatePersonalDebt(eva, debtId, { myRole: "DEBTOR", counterparty: { kind: "new", name: "X", email: null, phone: null }, concept: "x", currency: "MXN", amount: "1", originDate: daysAgo(1), schedule: { type: "NONE", installments: [] }, plannedMethod: null, privateNotes: null, receivingAccountId: null }),
      "not_found",
    );
    expect(await listDebts(eva, "all")).toHaveLength(0);
    expect(await notificationsOf(eva)).toEqual([]);

    // Nor can somebody else's contact be used.
    const contact = await prisma.contact.findFirstOrThrow({ where: { ownerId: ana.id } });
    await expectAppError(createPersonalDebt(eva, personalDebt({ counterparty: { kind: "existing", id: contact.id } })), "contact_not_found");
    expect(key()).not.toBe(key());
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
