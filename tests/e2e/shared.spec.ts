import { expect, test } from "@playwright/test";
import { APP, DEBT_URL, createPersonalDebt, createSharedDebt, fillWizard, newSession, outstanding, person, recordPayment, signIn, watchForProblems } from "./helpers";

test("shared agreement: link, acceptance by both, and payments that count only when confirmed", async ({ browser }) => {
  const anaWho = person("Ana Acreedora");
  const luisWho = person("Luis Deudor");
  const ana = await newSession(browser, anaWho);
  const problems = watchForProblems(ana.page);

  // Ana proposes and gets a link to share.
  const { link, debtUrl } = await createSharedDebt(ana.page, { direction: "owed", person: "Luis", amount: "5000", concept: "Préstamo coche" });
  await expect(ana.page.getByText("Pendiente de aprobación")).toBeVisible();
  await expect(ana.page.getByText("Importe propuesto")).toBeVisible();
  await expect(ana.page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);
  // Nobody accepts their own proposal: Ana can only withdraw it.
  await expect(ana.page.getByTestId("proposal").getByRole("button", { name: "Aceptar condiciones" })).toHaveCount(0);
  await expect(ana.page.getByTestId("proposal").getByRole("button", { name: "Retirar propuesta" })).toBeVisible();

  // Luis opens the link: he has to sign in, then sees the proposal and nothing else.
  const luisContext = await browser.newContext();
  const luis = await luisContext.newPage();
  await luis.goto(link);
  await expect(luis).toHaveURL(/\/debt\/login\?next=/);
  await signIn(luis, luisWho);
  await expect(luis.getByRole("heading", { name: `${anaWho.name} te invita a confirmar este acuerdo` })).toBeVisible();
  await expect(luis.getByTestId("invitation-terms")).toContainText("$5,000.00");
  await expect(luis.getByTestId("invitation-terms")).toContainText("Préstamo coche");
  await luis.getByRole("button", { name: "Aceptar condiciones" }).click();

  // He came in through a bare link, so the agreement waits for Ana to confirm who he is.
  await expect(luis).toHaveURL(/\/debt\/app\/debts\//);
  await expect(luis.getByText("Entraste con el enlace")).toBeVisible();
  await expect(luis.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);

  await ana.page.reload();
  await expect(ana.page.getByText("¿Es la persona correcta?")).toBeVisible();
  await expect(ana.page.getByText(luisWho.email).first()).toBeVisible();
  await ana.page.getByRole("button", { name: "Sí, es esta persona" }).click();
  await expect(ana.page.getByTestId("balance").getByText("Saldo confirmado")).toBeVisible();
  await expect(outstanding(ana.page)).toHaveText("$5,000.00");

  // The link is single-use, and the agreement is invisible to anybody else.
  const eva = await newSession(browser, person("Eva Curiosa"));
  await eva.page.goto(link);
  await expect(eva.page.getByRole("heading", { name: "Este enlace ya fue utilizado" })).toBeVisible();
  await expect(eva.page.getByText("Préstamo coche")).toHaveCount(0);
  expect((await eva.page.goto(debtUrl))?.status()).toBe(404);
  await eva.context.close();

  // Luis records a payment: it is waiting, and the confirmed balance has not moved for anyone.
  await luis.reload();
  await recordPayment(luis, "1500", "Registrar y pedir confirmación");
  await expect(outstanding(luis)).toHaveText("$5,000.00");
  await expect(luis.getByTestId("pending-balance")).toContainText("$1,500.00");
  await expect(luis.getByTestId("movement")).toContainText("Por validar");
  // Whoever recorded it cannot confirm it.
  await expect(luis.getByTestId("movement").getByRole("button", { name: "Validar", exact: true })).toHaveCount(0);

  // Ana is told, and confirms.
  await ana.page.goto(`${APP}/app/notifications`);
  await expect(ana.page.getByText(`${luisWho.name} registró un pago de $1,500.00`)).toBeVisible();
  await ana.page.goto(debtUrl);
  await expect(outstanding(ana.page)).toHaveText("$5,000.00");
  await ana.page.getByTestId("movement").getByRole("button", { name: "Validar", exact: true }).click();
  await ana.page.getByRole("alertdialog").getByRole("button", { name: "Validar", exact: true }).click();
  await expect(outstanding(ana.page)).toHaveText("$3,500.00");
  await expect(ana.page.getByTestId("movement")).toContainText("Validado por ambos");
  // A confirmed movement can no longer be edited or deleted — only reversed, with both agreeing.
  await expect(ana.page.getByTestId("movement").getByRole("button", { name: /Editar|Eliminar/ })).toHaveCount(0);
  await expect(ana.page.getByTestId("movement").getByRole("button", { name: "Proponer reverso" })).toBeVisible();

  await luis.reload();
  await expect(outstanding(luis)).toHaveText("$3,500.00");

  // Ana records a payment she says she received; Luis rejects it: it never counts.
  await recordPayment(ana.page, "900", "Registrar y pedir confirmación");
  await luis.reload();
  const pending = luis.getByTestId("movement").filter({ hasText: "Espera tu validación" });
  await pending.getByRole("button", { name: "Rechazar" }).click();
  await luis.getByRole("dialog").getByLabel("Motivo").fill("Ese pago no lo hice");
  await luis.getByRole("dialog").getByRole("button", { name: "Rechazar" }).click();
  await expect(luis.getByTestId("movement").filter({ hasText: "Rechazado" })).toContainText("Ese pago no lo hice");
  await expect(outstanding(luis)).toHaveText("$3,500.00");
  await ana.page.reload();
  await expect(outstanding(ana.page)).toHaveText("$3,500.00");
  await expect(ana.page.getByTestId("pending-balance")).toHaveCount(0);

  // The history shows who did what.
  await expect(ana.page.getByText("El acuerdo entró en vigor: ambas partes aceptaron la versión 1")).toBeVisible();
  await expect(ana.page.getByText(`${luisWho.name} rechazó el movimiento de $900.00`)).toBeVisible();

  // The dashboard keeps confirmed money apart from personal records.
  await ana.page.goto(`${APP}/app`);
  const owed = ana.page.locator("article", { hasText: "Total que me deben" });
  await expect(owed).toContainText("Confirmado por ambos$3,500.00");
  await expect(owed).toContainText("Registros personales$0.00");

  expect(problems).toEqual([]);
  await luisContext.close();
  await ana.context.close();
});

test("an invitation naming an email shows up in that account and activates at once", async ({ browser }) => {
  const anaWho = person("Ana Invita");
  const luisWho = person("Luis Invitado");
  const ana = await newSession(browser, anaWho);
  const luis = await newSession(browser, luisWho);

  await fillWizard(ana.page, { mode: "shared", direction: "owed", person: "Luis", amount: "800", concept: "Cena" });
  await ana.page.getByLabel("Correo de la otra persona").fill(luisWho.email);
  await ana.page.getByRole("button", { name: "Crear y obtener enlace" }).click();
  await expect(ana.page.getByTestId("share-link")).toHaveValue(/invite/);
  await ana.page.getByRole("link", { name: "Ir al acuerdo" }).click();
  await ana.page.waitForURL(DEBT_URL);
  const debtUrl = ana.page.url();

  // It is waiting inside his account, without the link.
  await luis.page.goto(`${APP}/app`);
  await expect(luis.page.getByText(`${anaWho.name} te invitó a revisar un acuerdo`)).toBeVisible();
  await luis.page.getByRole("link", { name: "Revisar" }).click();
  await expect(luis.page.getByText("La invitación se envió a tu correo")).toBeVisible();
  await luis.page.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(luis.page.getByTestId("balance").getByText("Saldo confirmado")).toBeVisible();

  await ana.page.goto(debtUrl);
  await expect(ana.page.getByTestId("balance").getByText("Saldo confirmado")).toBeVisible();
  await expect(ana.page.getByText("¿Es la persona correcta?")).toHaveCount(0);

  await ana.context.close();
  await luis.context.close();
});

test("converting a personal record: the record stays intact, only what was chosen is shared", async ({ browser }) => {
  const ana = await newSession(browser, person("Ana Convierte"));

  const recordUrl = await createPersonalDebt(ana.page, { direction: "owed", person: "Luis", amount: "10000", concept: "Préstamo viejo" });
  await recordPayment(ana.page, "1000", "Guardar");
  await recordPayment(ana.page, "2000", "Guardar");
  await expect(outstanding(ana.page)).toHaveText("$7,000.00");

  await ana.page.getByRole("link", { name: "Invitar a Luis" }).first().click();
  await expect(ana.page.getByText(/Tu registro personal no cambia/)).toBeVisible();
  // Share the amount and only ONE of the two payments.
  const boxes = ana.page.locator("fieldset", { hasText: "Abonos a reconocer" }).getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await boxes.last().uncheck();
  await expect(ana.page.getByText("Hay 1 abono que no compartes")).toBeVisible();
  await ana.page.getByRole("button", { name: "Crear propuesta y obtener enlace" }).click();
  await expect(ana.page.getByTestId("share-link")).toHaveValue(/invite/);
  const link = await ana.page.getByTestId("share-link").inputValue();

  // The personal record is exactly as it was, and still usable.
  await ana.page.goto(recordUrl);
  await expect(outstanding(ana.page)).toHaveText("$7,000.00");
  await expect(ana.page.getByText(/Invitaste a confirmar esta deuda\. Mientras la otra persona responde/)).toBeVisible();
  await expect(ana.page.getByTestId("movement")).toHaveCount(2);
  await expect(ana.page.getByRole("button", { name: "Registrar pago" })).toBeVisible();

  // Luis sees the proposal with one payment to recognise and accepts.
  const luisContext = await browser.newContext();
  const luis = await luisContext.newPage();
  await luis.goto(link);
  await signIn(luis, person("Luis Acepta"));
  await expect(luis.getByTestId("invitation-terms")).toContainText("Pagos previos a reconocer");
  await expect(luis.getByTestId("invitation-terms")).toContainText("Saldo inicial");
  await luis.getByRole("button", { name: "Aceptar condiciones" }).click();
  await expect(luis).toHaveURL(/\/debt\/app\/debts\//);
  const sharedUrl = luis.url();
  // He cannot reach Ana's private record.
  expect((await luis.goto(recordUrl))?.status()).toBe(404);

  await ana.page.goto(sharedUrl);
  await ana.page.getByRole("button", { name: "Sí, es esta persona" }).click();
  await expect(ana.page.getByTestId("balance").getByText("Saldo confirmado")).toBeVisible();
  // Only the shared payment was recognised by both.
  await expect(ana.page.getByTestId("movement")).toHaveCount(1);
  await expect(ana.page.getByTestId("movement")).toContainText("Validado por ambos");
  expect(["$9,000.00", "$8,000.00"]).toContain(await outstanding(ana.page).innerText());

  // The personal record became a read-only archive with its whole private history.
  await ana.page.goto(recordUrl);
  await expect(ana.page.getByText("Convertida en acuerdo")).toBeVisible();
  await expect(ana.page.getByText(/Se conserva aquí, intacto y solo para ti/)).toBeVisible();
  await expect(ana.page.getByTestId("movement")).toHaveCount(2);
  await expect(ana.page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);

  // It is counted once: the archive is out of the totals.
  await ana.page.goto(`${APP}/app`);
  await expect(ana.page.locator("article", { hasText: "Total que me deben" })).toContainText("Registros personales$0.00");

  await luisContext.close();
  await ana.context.close();
});
