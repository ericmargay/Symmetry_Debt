import { expect, test } from "@playwright/test";
import { APP, createPersonalDebt, isoDaysFromNow, outstanding, person, recordPayment, signIn, watchForProblems } from "./helpers";

test("personal tracking: record, pay in parts, settle — with nobody else involved", async ({ page }) => {
  const problems = watchForProblems(page);
  await signIn(page, person("Ana Personal"));

  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "3,000", concept: "Préstamo personal", monthly: { first: isoDaysFromNow(10), count: 3 } });
  await expect(page.getByRole("heading", { name: "Préstamo personal" })).toBeVisible();
  await expect(page.getByText("Le debes a Marta")).toBeVisible();
  await expect(outstanding(page)).toHaveText("$3,000.00");
  // It is a personal record and says so; nothing suggests the other person confirmed anything.
  await expect(page.getByTestId("balance").getByText("Saldo registrado")).toBeVisible();
  await expect(page.getByText("Saldo según tus propios registros. La otra persona no lo ha confirmado.")).toBeVisible();
  await expect(page.getByText("Confirmado por ambos")).toHaveCount(0);
  await expect(page.getByText("Próxima")).toHaveCount(3);

  // A partial payment changes the balance at once.
  await recordPayment(page, "1,250.50", "Guardar");
  await expect(outstanding(page)).toHaveText("$1,749.50");
  await expect(page.getByTestId("movement")).toHaveCount(1);
  await expect(page.getByTestId("movement").getByText("Registro personal")).toBeVisible();
  await expect(page.getByText("Pagada")).toHaveCount(1);
  await expect(page.getByText("Pago parcial")).toHaveCount(1);

  // More than what is left is refused, in the form.
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Importe").fill("5000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("El importe supera lo que queda por pagar.")).toBeVisible();
  await page.getByLabel("Importe").fill("1749.50");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(page.getByText("Deuda liquidada")).toBeVisible();
  await expect(outstanding(page)).toHaveText("$0.00");
  await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);

  // Its owner can still correct their own records: deleting a payment reopens the debt.
  await page.getByTestId("movement").first().getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(outstanding(page)).not.toHaveText("$0.00");
  await expect(page.getByText("La deuda volvió a quedar abierta")).toBeVisible();

  // The dashboard counts it as a personal record, not as something confirmed.
  await page.goto(`${APP}/app`);
  const owe = page.locator("article", { hasText: "Total que debo" });
  await expect(owe.getByText("Registros personales")).toBeVisible();
  await expect(owe).toContainText("Confirmado por ambos$0.00");
  expect(problems).toEqual([]);
});

test("cash and transfer payments keep their own details", async ({ page }) => {
  await signIn(page, person("Ana Metodos"));
  await createPersonalDebt(page, { direction: "owed", person: "Pepe", amount: "2000", concept: "Renta" });

  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Importe").fill("500");
  await page.getByLabel("Método utilizado").selectOption("CASH");
  await page.getByLabel("Lugar de entrega").fill("En la oficina");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("En la oficina")).toBeVisible();

  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Importe").fill("700");
  await page.getByLabel("Método utilizado").selectOption("BANK_TRANSFER");
  await page.getByLabel("Banco de origen").fill("BBVA");
  await page.getByLabel("Cuenta de destino").selectOption("other");
  await page.getByLabel("Describe la cuenta").fill("Mi cuenta de nómina");
  await page.getByLabel("Clave de rastreo").fill("MBAN01002611160000000001");
  await page.getByLabel("Referencia").fill("Renta noviembre");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  const transfer = page.getByTestId("movement").filter({ hasText: "Transferencia bancaria" });
  await expect(transfer).toContainText("BBVA");
  await expect(transfer).toContainText("Mi cuenta de nómina");
  await expect(transfer).toContainText("MBAN01002611160000000001");
  await expect(transfer).toContainText("Renta noviembre");
  await expect(outstanding(page)).toHaveText("$800.00");
});

test("bank accounts: CLABE is validated, masked and private", async ({ page, browser }) => {
  const ana = person("Ana Cuentas");
  await signIn(page, ana);
  await page.goto(`${APP}/app/accounts`);
  await page.getByRole("button", { name: "Agregar cuenta" }).first().click();
  await page.getByLabel("Alias").fill("Nómina");
  await page.getByLabel("CLABE (18 dígitos)").fill("032180000118359718");
  await expect(page.getByText("La CLABE no es válida: revisa los dígitos.")).toBeVisible();
  await page.getByLabel("CLABE (18 dígitos)").fill("002010077777777771");
  await expect(page.getByText(/CLABE válida/)).toBeVisible();
  await expect(page.getByLabel("Banco", { exact: true })).toHaveValue("Citibanamex");
  await page.getByRole("button", { name: "Guardar" }).click();

  const card = page.getByTestId("bank-account");
  await expect(card).toContainText("•••• 7771");
  await expect(card).not.toContainText("002010077777777771");
  expect(await page.content()).not.toContain("002010077777777771");

  await card.getByRole("button", { name: "Ver datos completos" }).click();
  await expect(card).toContainText("002 010 07777777777 1");
  await card.getByRole("button", { name: "Ocultar" }).click();
  await expect(card).not.toContainText("07777777777");

  // Somebody else sees none of it.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await signIn(stranger, person("Otra Persona"));
  await stranger.goto(`${APP}/app/accounts`);
  await expect(stranger.getByTestId("bank-account")).toHaveCount(0);
  await other.close();
});
