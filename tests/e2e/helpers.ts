import { expect, type Browser, type Page } from "@playwright/test";
import { APP } from "./env";

export { APP };

/** A debt page — and not the wizard at /app/debts/new, which the same shape would match. */
export const DEBT_URL = /\/app\/debts\/(?!new$)[a-z0-9]+$/;

let counter = 0;

/** A person nobody has used before, so tests never step on each other. */
export function person(name: string) {
  counter += 1;
  const slug = name.toLowerCase().replace(/[^a-z]/g, "");
  return { name, email: `${slug}.${Date.now()}.${counter}.${Math.floor(Math.random() * 1e6)}@example.com` };
}

export type Person = ReturnType<typeof person>;

/** Signs in through the mock issuer, starting from wherever the app sends the visitor. */
export async function signIn(page: Page, who: Person, start = `${APP}/login`) {
  if (!page.url().includes("/login")) await page.goto(start);
  await page.getByRole("button", { name: /Google/ }).click();
  await page.waitForURL(/\/authorize/);
  await page.fill("#email", who.email);
  await page.fill("#name", who.name);
  await page.click("#continue");
  await page.waitForURL(/\/debt\/(app|invite)/);
}

export async function newSession(browser: Browser, who: Person) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return { context, page };
}

export function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export interface NewDebt {
  mode: "personal" | "shared";
  direction: "owe" | "owed";
  person: string;
  amount: string;
  concept: string;
  monthly?: { first: string; count: number };
}

/** Goes through the "new debt" wizard up to the last step (review). */
export async function fillWizard(page: Page, debt: NewDebt) {
  await page.goto(`${APP}/app/debts/new`);
  await page.getByText(debt.mode === "personal" ? "Solo para mí" : "Compartir con la otra persona").click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText(debt.direction === "owe" ? "Yo debo" : "Me deben", { exact: true }).click();
  const select = page.getByRole("combobox", { name: /debes|te debe|quién/i });
  if (await select.count()) await select.selectOption("new");
  await page.getByRole("textbox", { name: /Nombre|¿A quién le debes\?|¿Quién te debe\?/ }).fill(debt.person);
  await page.getByLabel("Importe").fill(debt.amount);
  await page.getByLabel("Concepto").fill(debt.concept);
  await page.getByRole("button", { name: "Continuar" }).click();

  if (debt.monthly) {
    await page.getByText("Pagos mensuales").click();
    await page.getByLabel("Primera fecha de pago").fill(debt.monthly.first);
    await page.getByLabel("Número de pagos").fill(String(debt.monthly.count));
  }
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Detalles y revisión" })).toBeVisible();
}

export async function createPersonalDebt(page: Page, debt: Omit<NewDebt, "mode">): Promise<string> {
  await fillWizard(page, { ...debt, mode: "personal" });
  await page.getByRole("button", { name: "Guardar registro" }).click();
  await page.waitForURL(DEBT_URL);
  return page.url();
}

/** Creates a shared agreement and returns its page and the share link shown once. */
export async function createSharedDebt(page: Page, debt: Omit<NewDebt, "mode">): Promise<{ link: string; debtUrl: string }> {
  await fillWizard(page, { ...debt, mode: "shared" });
  await page.getByRole("button", { name: "Crear y obtener enlace" }).click();
  const field = page.getByTestId("share-link");
  await expect(field).toHaveValue(/\/debt\/invite\/[A-Za-z0-9_-]{40,}$/);
  const link = await field.inputValue();
  await page.getByRole("link", { name: "Ir al acuerdo" }).click();
  await page.waitForURL(DEBT_URL);
  return { link, debtUrl: page.url() };
}

export async function recordPayment(page: Page, amount: string, submit: "Guardar" | "Registrar y pedir confirmación") {
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Importe").fill(amount);
  await page.getByLabel("Método utilizado").selectOption("BANK_TRANSFER");
  await page.getByRole("button", { name: submit, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

export const outstanding = (page: Page) => page.getByTestId("outstanding");

/** No request may fail with a server error and nothing may violate the Content-Security-Policy. */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Hydration|hydrat/i.test(message.text())) problems.push(message.text().slice(0, 300));
  });
  page.on("response", (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return problems;
}
