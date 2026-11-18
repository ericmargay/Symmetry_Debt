import { expect, test, type Page } from "@playwright/test";
import { createPersonalDebt, createSharedDebt, isoDaysFromNow, newSession, outstanding, person, signIn, watchForProblems } from "./helpers";

const row = (page: Page, sequence: number) => page.getByTestId("installment").nth(sequence - 1);

async function markInstallment(page: Page, sequence: number, partial?: string) {
  await page.getByRole("button", { name: `Marcar la cuota ${sequence} como pagada` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Marcar la cuota ${sequence} como pagada` })).toBeVisible();
  if (partial) {
    await dialog.getByRole("radio", { name: "Parcial" }).click();
    await dialog.getByLabel("Importe").fill(partial);
  }
  await dialog.getByRole("button", { name: /^Marcar/ }).click();
  await expect(dialog).toBeHidden();
}

test("each instalment is ticked by one side and validated by the other", async ({ browser }) => {
  const anaWho = person("Ana Cobra");
  const luisWho = person("Luis Paga");
  const ana = await newSession(browser, anaWho);
  const problems = watchForProblems(ana.page);

  const { link, debtUrl } = await createSharedDebt(ana.page, {
    direction: "owed",
    person: "Luis",
    amount: "3000",
    concept: "Préstamo en cuotas",
    monthly: { first: isoDaysFromNow(10), count: 3 },
  });

  const luisContext = await browser.newContext();
  const luis = await luisContext.newPage();
  await luis.goto(link);
  await signIn(luis, luisWho);
  await luis.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(luis).toHaveURL(/\/debt\/app\/debts\//);
  await ana.page.goto(debtUrl);
  await ana.page.getByRole("button", { name: "Sí, es esta persona" }).click();
  await expect(ana.page.getByTestId("balance").getByText("Saldo confirmado")).toBeVisible();

  // Luis ticks the first instalment in full: it waits for Ana, and the balance has not moved.
  await luis.reload();
  await expect(luis.getByTestId("installment")).toHaveCount(3);
  await markInstallment(luis, 1);
  await expect(luis.getByRole("button", { name: "Avisar por WhatsApp" })).toBeVisible();
  await expect(row(luis, 1)).toContainText(`esperando a ${anaWho.name}`);
  await expect(outstanding(luis)).toHaveText("$3,000.00");

  // Ana is asked on that very instalment, and validates it: two checks for both.
  await ana.page.reload();
  await expect(ana.page.getByText("Tienes 1 pago por validar")).toBeVisible();
  await expect(row(ana.page, 1)).toContainText(`${luisWho.name} marcó $1,000.00 · ¿lo recibiste?`);
  await row(ana.page, 1).getByRole("button", { name: "Validar" }).click();
  await ana.page.getByRole("alertdialog").getByRole("button", { name: "Validar" }).click();
  await expect(row(ana.page, 1)).toContainText("Pagada · validada por ambos");
  await expect(outstanding(ana.page)).toHaveText("$2,000.00");
  await expect(ana.page.getByText("1 de 3 pagadas")).toBeVisible();

  await luis.reload();
  await expect(row(luis, 1)).toContainText("Pagada · validada por ambos");
  await expect(outstanding(luis)).toHaveText("$2,000.00");

  // A partial payment: only part of the second instalment.
  await markInstallment(luis, 2, "400");
  await ana.page.reload();
  await row(ana.page, 2).getByRole("button", { name: "Validar" }).click();
  await ana.page.getByRole("alertdialog").getByRole("button", { name: "Validar" }).click();
  await expect(row(ana.page, 2)).toContainText("Pagado $400.00 de $1,000.00");
  await expect(outstanding(ana.page)).toHaveText("$1,600.00");

  // Ana says a payment did not arrive: it never counts and the instalment is open again.
  await luis.reload();
  await markInstallment(luis, 2);
  await ana.page.reload();
  await row(ana.page, 2).getByRole("button", { name: "No lo recibí" }).click();
  await ana.page.getByRole("dialog").getByLabel("Mensaje").fill("No me llegó la transferencia");
  await ana.page.getByRole("dialog").getByRole("button", { name: "No lo recibí" }).click();
  await expect(row(ana.page, 2)).toContainText("Pagado $400.00 de $1,000.00");
  await expect(row(ana.page, 2)).not.toContainText("¿lo recibiste?");
  await expect(outstanding(ana.page)).toHaveText("$1,600.00");

  expect(problems).toEqual([]);
  await luisContext.close();
  await ana.context.close();
});

test("in a personal record a tick counts at once, with a single check", async ({ page }) => {
  await signIn(page, person("Ana Sola"));
  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "900", concept: "Cuotas personales", monthly: { first: isoDaysFromNow(5), count: 3 } });

  await markInstallment(page, 1);
  await expect(row(page, 1)).toContainText("Pagada");
  await expect(outstanding(page)).toHaveText("$600.00");

  // Ticking a later instalment covers the earlier open ones first, as a bank applies payments.
  await page.getByRole("button", { name: "Marcar la cuota 3 como pagada" }).click();
  await expect(page.getByRole("dialog")).toContainText("Incluye 1 cuota anterior pendiente");
  await expect(page.getByRole("dialog")).toContainText("$600.00");
  await page.getByRole("dialog").getByRole("button", { name: "Marcar como pagada" }).click();
  await expect(outstanding(page)).toHaveText("$0.00");
  await expect(page.getByText("3 de 3 pagadas")).toBeVisible();

  // The invitation to validate with the other person is offered on personal records.
  await expect(page.getByRole("button", { name: /Marcar la cuota/ })).toHaveCount(0);
});
