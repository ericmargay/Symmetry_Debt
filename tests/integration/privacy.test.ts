import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clabeCheckDigit } from "@/domain/clabe";
import { decryptField, encryptField, needsReencryption } from "@/server/crypto";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { createSharedAgreement, requestCancellation } from "@/server/services/agreements";
import { addAttachment, deleteAttachment, readAttachment } from "@/server/services/attachments";
import {
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  revealBankAccount,
  revokeBankShare,
  setPreferredBankAccount,
  shareBankAccount,
  updateBankAccount,
} from "@/server/services/bank-accounts";
import { getInvitationView, respondToInvitation } from "@/server/services/invitations";
import { decideMovement, deletePersonalMovement, recordMovement } from "@/server/services/movements";
import { createPersonalDebt, deletePersonalDebt } from "@/server/services/personal";
import { getDebtView } from "@/server/services/views";
import { createUser, expectAppError, payment, personalDebt, resetDatabase, sharedDebt } from "./helpers";

beforeEach(resetDatabase);

const CLABE = "032180000118359719";
const OTHER_CLABE = `01218000123456789${clabeCheckDigit("01218000123456789")}`;

function account(overrides: Record<string, unknown> = {}) {
  return {
    alias: "Nómina",
    bankName: "IXE",
    holderName: "Ana Ejemplo",
    clabe: CLABE,
    accountNumber: null as string | null,
    currency: "MXN",
    isPreferred: false,
    ...overrides,
  };
}

async function agreement(shareAccountId: string | null = null) {
  const ana = await createUser("Ana");
  const luis = await createUser("Luis");
  const accountId = shareAccountId === "create" ? await createBankAccount(ana, account()) : null;
  const created = await createSharedAgreement(ana, sharedDebt({ inviteEmail: luis.email, shareAccountId: accountId, amount: "5000" }));
  return { ana, luis, debtId: created.debtId, token: created.invitation!.token, accountId };
}

async function accept(luis: Awaited<ReturnType<typeof createUser>>, token: string) {
  const invite = await getInvitationView(luis, token);
  await respondToInvitation(luis, token, { versionId: invite!.proposal!.versionId, termsHash: invite!.proposal!.termsHash, action: "accept" });
}

function storedFiles(): string[] {
  const root = process.env.STORAGE_LOCAL_DIR as string;
  const walk = (directory: string): string[] => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const full = path.join(directory, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  };
  return walk(root);
}

describe("bank accounts", () => {
  it("validates the CLABE and never stores it in clear text", async () => {
    const ana = await createUser("Ana");
    expect((await expectAppError(createBankAccount(ana, account({ clabe: "032180000118359718" })), "validation")).fields).toEqual({ clabe: "clabeChecksum" });
    expect((await expectAppError(createBankAccount(ana, account({ clabe: "12345" })), "validation")).fields).toEqual({ clabe: "clabeLength" });
    expect((await expectAppError(createBankAccount(ana, account({ clabe: "03218000011835971X" })), "validation")).fields).toEqual({ clabe: "clabeDigits" });
    expect((await expectAppError(createBankAccount(ana, account({ clabe: "", accountNumber: "" })), "validation")).fields).toEqual({ clabe: "needClabeOrAccount" });
    expect((await expectAppError(createBankAccount(ana, account({ accountNumber: "12" })), "validation")).fields).toEqual({ accountNumber: "accountNumber" });

    const id = await createBankAccount(ana, account({ clabe: "032 180 00011835971 9", accountNumber: "0011 8359 71" }));
    const row = await prisma.bankAccount.findUniqueOrThrow({ where: { id } });
    expect(row.clabeEnc).not.toContain(CLABE);
    expect(row.clabeEnc).toMatch(/^v1\./);
    expect(row.accountNumberEnc).not.toContain("0011835971");
    expect(row).toMatchObject({ clabeLast4: "9719", accountLast4: "5971", isPreferred: true });
    // Nothing in the whole row gives the number away.
    expect(JSON.stringify(row)).not.toContain("03218000011835971");

    const [summary] = await listBankAccounts(ana);
    expect(JSON.stringify(summary)).not.toContain(CLABE);
    expect(summary).toMatchObject({ alias: "Nómina", clabeLast4: "9719", isPreferred: true });
    expect(await revealBankAccount(ana, id)).toEqual({ clabe: CLABE, accountNumber: "0011835971" });
  });

  it("has no place at all for passwords, PINs or card data", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_name IN ('BankAccount', 'PaymentBankDetails', 'Account', 'User')
    `;
    const names = columns.map((column) => column.column_name.toLowerCase());
    for (const forbidden of ["password", "pin", "nip", "cvv", "cvc", "card", "token", "secret"]) {
      expect(names.filter((name) => name.includes(forbidden)), forbidden).toEqual([]);
    }
  });

  it("is private to its owner", async () => {
    const ana = await createUser("Ana");
    const eva = await createUser("Eva");
    const id = await createBankAccount(ana, account());
    await expectAppError(revealBankAccount(eva, id), "bank_account_not_found");
    await expectAppError(updateBankAccount(eva, id, account({ alias: "robada" })), "bank_account_not_found");
    await expectAppError(deleteBankAccount(eva, id), "bank_account_not_found");
    await expectAppError(setPreferredBankAccount(eva, id), "bank_account_not_found");
    expect(await listBankAccounts(eva)).toEqual([]);
    // It cannot be attached to somebody else's debts either.
    await expectAppError(createPersonalDebt(eva, personalDebt({ myRole: "CREDITOR", receivingAccountId: id })), "bank_account_not_found");
    await expectAppError(createSharedAgreement(eva, sharedDebt({ shareAccountId: id })), "bank_account_not_found");
  });

  it("keeps exactly one preferred account", async () => {
    const ana = await createUser("Ana");
    const first = await createBankAccount(ana, account());
    const second = await createBankAccount(ana, account({ alias: "Ahorro", clabe: OTHER_CLABE }));
    expect((await listBankAccounts(ana)).map((item) => [item.alias, item.isPreferred])).toEqual([["Nómina", true], ["Ahorro", false]]);
    await setPreferredBankAccount(ana, second);
    expect((await listBankAccounts(ana)).filter((item) => item.isPreferred).map((item) => item.id)).toEqual([second]);
    await updateBankAccount(ana, first, account({ isPreferred: true }));
    expect((await listBankAccounts(ana)).filter((item) => item.isPreferred).map((item) => item.id)).toEqual([first]);
    await deleteBankAccount(ana, first);
    expect((await listBankAccounts(ana)).map((item) => [item.id, item.isPreferred])).toEqual([[second, true]]);
  });

  it("shows the other side only what was explicitly shared, only while the agreement is in force", async () => {
    const { ana, luis, debtId, token, accountId } = await agreement("create");

    // Shared by Ana when proposing — but Luis is not on the agreement yet.
    await expectAppError(getDebtView(luis, debtId), "not_found");
    expect(JSON.stringify(await getInvitationView(luis, token))).not.toContain("9719");

    await accept(luis, token);
    const view = await getDebtView(luis, debtId);
    expect(view.shared?.bankDetails).toEqual([
      { accountId, bankName: "IXE", holderName: "Ana Ejemplo", currency: "MXN", clabe: CLABE, accountNumber: null },
    ]);
    // Ana's private alias for the account is not part of what is shared.
    expect(JSON.stringify(view.shared?.bankDetails)).not.toContain("Nómina");
    expect((await getDebtView(ana, debtId)).shared).toMatchObject({ bankDetails: [], myShares: [{ accountId, alias: "Nómina" }] });
    // Sharing gives no access to the account itself.
    await expectAppError(revealBankAccount(luis, accountId!), "bank_account_not_found");

    // Luis can say which account he paid into; only a masked label is kept with the payment.
    const { paymentId } = await recordMovement(luis, debtId, payment("1000", { method: "BANK_TRANSFER", destinationAccountId: accountId }));
    const recorded = (await getDebtView(ana, debtId)).movements[0];
    expect(recorded.bank?.destinationLabel).toBe("IXE •••• 9719");
    await decideMovement(ana, paymentId, "approve");

    await revokeBankShare(ana, debtId, accountId!);
    expect((await getDebtView(luis, debtId)).shared?.bankDetails).toEqual([]);
    await expectAppError(recordMovement(luis, debtId, payment("10", { method: "BANK_TRANSFER", destinationAccountId: accountId })), "bank_account_not_found");

    await shareBankAccount(ana, debtId, accountId!);
    expect((await getDebtView(luis, debtId)).shared?.bankDetails).toHaveLength(1);
    await deleteBankAccount(ana, accountId!);
    expect((await getDebtView(luis, debtId)).shared?.bankDetails).toEqual([]);
    // The confirmed payment keeps its masked label.
    expect((await getDebtView(luis, debtId)).movements[0].bank).toMatchObject({ destinationLabel: "IXE •••• 9719", destinationAccountId: null });
  });

  it("can only be shared by the creditor, with their own account, in their own agreement", async () => {
    const { ana, luis, debtId, token } = await agreement();
    await accept(luis, token);
    const anaAccount = await createBankAccount(ana, account());
    const luisAccount = await createBankAccount(luis, account({ alias: "Luis", clabe: OTHER_CLABE }));
    const eva = await createUser("Eva");
    const evaAccount = await createBankAccount(eva, account({ alias: "Eva" }));

    await expectAppError(shareBankAccount(luis, debtId, luisAccount), "forbidden"); // the debtor receives nothing
    await expectAppError(shareBankAccount(ana, debtId, luisAccount), "bank_account_not_found");
    await expectAppError(shareBankAccount(eva, debtId, evaAccount), "not_found");
    await shareBankAccount(ana, debtId, anaAccount);
    await expectAppError(revokeBankShare(luis, debtId, anaAccount), "bank_account_not_found");
    expect((await getDebtView(luis, debtId)).shared?.bankDetails).toHaveLength(1);

    // After a mutual cancellation the details are still visible to settle up… but not once revoked.
    await requestCancellation(ana, debtId, "fin");
    expect((await getDebtView(luis, debtId)).shared?.bankDetails).toHaveLength(1);
  });

  it("supports rotating the encryption key", async () => {
    const ana = await createUser("Ana");
    const id = await createBankAccount(ana, account());
    const oldKey = process.env.DATA_ENCRYPTION_KEY as string;
    const stored = (await prisma.bankAccount.findUniqueOrThrow({ where: { id } })).clabeEnc as string;

    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = oldKey;
    resetEnvCache();
    try {
      expect(await revealBankAccount(ana, id)).toMatchObject({ clabe: CLABE });
      expect(needsReencryption(stored)).toBe(true);
      const fresh = encryptField("secret");
      expect(needsReencryption(fresh)).toBe(false);
      expect(decryptField(fresh)).toBe("secret");

      // Without the old key the value cannot be read — and it fails loudly, not silently.
      delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
      resetEnvCache();
      await expectAppError(revealBankAccount(ana, id), "encryption_unavailable");
    } finally {
      process.env.DATA_ENCRYPTION_KEY = oldKey;
      delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
      resetEnvCache();
    }
    // A tampered value is rejected by the authentication tag.
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptField(tampered)).toThrow();
  });
});

describe("receipts", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
  const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);

  it("accepts PDF, JPG, PNG and WebP — judged by content, not by name", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt());
    const { paymentId } = await recordMovement(ana, debtId, payment("100"));

    for (const [name, bytes, mime] of [
      ["recibo.pdf", PDF, "application/pdf"],
      ["foto.png", PNG, "image/png"],
      ["foto.jpeg", JPG, "image/jpeg"],
      ["foto.webp", WEBP, "image/webp"],
    ] as const) {
      const { id } = await addAttachment(ana, { debtId, paymentId, fileName: name, bytes });
      const file = await readAttachment(ana, id);
      expect(file.mimeType).toBe(mime);
      expect(Array.from(file.body)).toEqual(Array.from(bytes));
    }

    // A PNG called .pdf is stored as what it is.
    const disguised = await addAttachment(ana, { debtId, fileName: "../../etc/passwd.pdf", bytes: PNG });
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: disguised.id } });
    expect(row).toMatchObject({ mimeType: "image/png", fileName: "passwd.png" });
    expect(row.storageKey).toMatch(/^receipts\/\d{4}\/\d{2}\/[0-9a-f]{40}$/);
    expect(row.storageKey).not.toContain("passwd");

    await expectAppError(addAttachment(ana, { debtId, fileName: "virus.exe", bytes: Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]) }), "file_type_not_allowed");
    await expectAppError(addAttachment(ana, { debtId, fileName: "pagina.pdf", bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>") }), "file_type_not_allowed");
    await expectAppError(addAttachment(ana, { debtId, fileName: "imagen.svg", bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>") }), "file_type_not_allowed");
    await expectAppError(addAttachment(ana, { debtId, fileName: "vacio.pdf", bytes: new Uint8Array() }), "file_empty");
    const tooBig = new Uint8Array(1024 * 1024 + 1);
    tooBig.set(PDF);
    await expectAppError(addAttachment(ana, { debtId, fileName: "enorme.pdf", bytes: tooBig }), "file_too_large");

    const view = await getDebtView(ana, debtId);
    expect(view.movements[0].attachments).toHaveLength(4);
    expect(view.attachments).toHaveLength(1);
    expect(view.timeline.filter((entry) => entry.type === "ATTACHMENT_ADDED")).toHaveLength(5);
  });

  it("can only be opened by who may see the debt", async () => {
    const ana = await createUser("Ana");
    const eva = await createUser("Eva");
    const { debtId } = await createPersonalDebt(ana, personalDebt());
    const { id } = await addAttachment(ana, { debtId, fileName: "recibo.pdf", bytes: PDF });
    await expectAppError(readAttachment(eva, id), "not_found");
    await expectAppError(readAttachment(eva, id, "anything-anything-anything"), "not_found");
    await expectAppError(deleteAttachment(eva, id), "not_found");
    await expectAppError(addAttachment(eva, { debtId, fileName: "x.pdf", bytes: PDF }), "not_found");
    await expectAppError(readAttachment(ana, "doesnotexist"), "not_found");
  });

  it("does not confirm anything: a payment with a receipt still needs the other side", async () => {
    const { ana, luis, debtId, token } = await agreement();
    await accept(luis, token);
    const { paymentId } = await recordMovement(luis, debtId, payment("1000"));
    const { id } = await addAttachment(luis, { debtId, paymentId, fileName: "transferencia.pdf", bytes: PDF });

    let view = await getDebtView(ana, debtId);
    expect(view.movements[0].attachments).toHaveLength(1);
    expect(view.movements[0].status).toBe("PENDING");
    expect(view.balance.paidMinor).toBe(0n);
    // Both participants can open it.
    expect((await readAttachment(ana, id)).fileName).toBe("transferencia.pdf");

    // Only its uploader can remove it, and not once the payment is confirmed.
    await expectAppError(deleteAttachment(ana, id), "forbidden");
    await decideMovement(ana, paymentId, "approve");
    await expectAppError(deleteAttachment(luis, id), "attachment_locked");
    view = await getDebtView(luis, debtId);
    expect(view.movements[0].attachments[0]).toMatchObject({ uploadedByMe: true, canDelete: false });
  });

  it("removes the stored file when the last reference is gone", async () => {
    const ana = await createUser("Ana");
    const { debtId } = await createPersonalDebt(ana, personalDebt());
    const { paymentId } = await recordMovement(ana, debtId, payment("100"));
    const before = storedFiles().length;

    const onDebt = await addAttachment(ana, { debtId, fileName: "a.pdf", bytes: PDF });
    await addAttachment(ana, { debtId, paymentId, fileName: "b.pdf", bytes: PDF });
    expect(storedFiles().length).toBe(before + 2);

    await deleteAttachment(ana, onDebt.id);
    expect(storedFiles().length).toBe(before + 1);
    await deletePersonalMovement(ana, paymentId);
    expect(storedFiles().length).toBe(before);

    await addAttachment(ana, { debtId, fileName: "c.pdf", bytes: PDF });
    await deletePersonalDebt(ana, debtId);
    expect(storedFiles().length).toBe(before);
    expect(await prisma.attachment.count()).toBe(0);
  });
});
