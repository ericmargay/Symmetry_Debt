import { randomUUID } from "node:crypto";
import { addDays, addMonths, todayInTimeZone, type ISODate } from "@/domain/dates";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db";
import { AppError, type AppErrorCode } from "@/server/errors";
import { setEmailInterceptor, type OutgoingEmail } from "@/server/mail";
import type { CreateDebtFormValues } from "@/schemas/debt";
import { expect } from "vitest";

export const TZ = "America/Mexico_City";

export function today(): ISODate {
  return todayInTimeZone(TZ);
}
export const daysAgo = (days: number): ISODate => addDays(today(), -days);
export const daysAhead = (days: number): ISODate => addDays(today(), days);
export const monthsAhead = (months: number): ISODate => addMonths(today(), months);

export const key = () => randomUUID();

/** Empties every table. TRUNCATE does not fire row triggers, so the append-only tables are fine. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map((table) => `"${table.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;

/** A registered user, as if they had signed in with Google. */
export async function createUser(name: string, options: { email?: string; locale?: "es" | "en"; emailActivity?: boolean } = {}): Promise<Actor> {
  counter += 1;
  const email = (options.email ?? `${name.toLowerCase().replace(/[^a-z]/g, "")}${counter}@example.com`).toLowerCase();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: new Date(),
      accounts: { create: { type: "oidc", provider: "google", providerAccountId: `g-${randomUUID()}` } },
      preferences: {
        create: {
          locale: options.locale ?? "es",
          timeZone: TZ,
          defaultCurrency: "MXN",
          emailActivity: options.emailActivity ?? false,
        },
      },
    },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: null,
    locale: options.locale ?? "es",
    timeZone: TZ,
    defaultCurrency: "MXN",
  };
}

export async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected AppError(${code}) but nothing was thrown`).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe(code);
  return caught as AppError;
}

/** Captures the emails sent while `work` runs. */
export async function captureEmails<T>(work: () => Promise<T>): Promise<{ result: T; emails: OutgoingEmail[] }> {
  const emails: OutgoingEmail[] = [];
  setEmailInterceptor((email) => {
    emails.push(email);
  });
  try {
    return { result: await work(), emails };
  } finally {
    setEmailInterceptor(undefined);
  }
}

type PersonalInput = Extract<CreateDebtFormValues, { mode: "PERSONAL" }>;
type SharedInput = Extract<CreateDebtFormValues, { mode: "SHARED" }>;

export function personalDebt(overrides: Partial<PersonalInput> = {}): PersonalInput {
  return {
    mode: "PERSONAL",
    idempotencyKey: key(),
    myRole: "DEBTOR",
    counterparty: { kind: "new", name: "Luis", email: null, phone: null },
    concept: "Préstamo",
    currency: "MXN",
    amount: "10000",
    originDate: daysAgo(30),
    schedule: { type: "NONE", installments: [] },
    plannedMethod: null,
    previousPayments: [],
    privateNotes: null,
    receivingAccountId: null,
    ...overrides,
  };
}

export function sharedDebt(overrides: Partial<SharedInput> = {}): SharedInput {
  return {
    mode: "SHARED",
    idempotencyKey: key(),
    myRole: "CREDITOR",
    counterparty: { kind: "new", name: "Luis", email: null, phone: null },
    concept: "Préstamo coche",
    currency: "MXN",
    amount: "10000",
    originDate: daysAgo(30),
    schedule: { type: "NONE", installments: [] },
    plannedMethod: null,
    previousPayments: [],
    sharedNotes: null,
    inviteEmail: null,
    shareAccountId: null,
    send: true,
    ...overrides,
  };
}

export function payment(amount: string, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key(),
    kind: "PAYMENT" as const,
    amount,
    effectiveDate: today(),
    method: "CASH",
    reference: null,
    notes: null,
    place: null,
    originBank: null,
    destinationAccountId: null,
    destinationText: null,
    trackingKey: null,
    reversesId: null,
    ...overrides,
  };
}

export async function notificationsOf(actor: Pick<Actor, "id">) {
  const rows = await prisma.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => row.type);
}
