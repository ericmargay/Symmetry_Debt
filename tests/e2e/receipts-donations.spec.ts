import { expect, test } from "@playwright/test";
import { APP_WITH_DONATIONS } from "./env";
import { APP, createPersonalDebt, newSession, person, recordPayment, signIn } from "./helpers";

const ORIGIN = "http://localhost:3100";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("receipts: attach, open, keep private — and they confirm nothing", async ({ page, browser }) => {
  await signIn(page, person("Ana Comprobantes"));
  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "900", concept: "Con comprobante" });
  await recordPayment(page, "300", "Guardar");

  const movement = page.getByTestId("movement");
  await movement.locator('input[type="file"]').setInputFiles({ name: "transferencia.png", mimeType: "image/png", buffer: PNG });
  const open = movement.getByRole("link", { name: "Abrir transferencia.png" });
  await expect(open).toBeVisible();
  await expect(page.getByText("Un comprobante acompaña a un pago, pero no lo confirma por sí solo.").first()).toBeVisible();

  const href = await open.getAttribute("href");
  expect(href).toMatch(/^\/debt\/api\/attachments\/[a-z0-9]+$/);
  const file = await page.request.get(`${ORIGIN}${href}`);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/png");
  expect(file.headers()["cache-control"]).toContain("no-store");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.compare(await file.body(), PNG)).toBe(0);

  // A file that is not what its name claims is refused.
  await movement.locator('input[type="file"]').setInputFiles({ name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await expect(page.getByText("Solo se admiten archivos PDF, JPG, PNG o WebP.")).toBeVisible();

  // Nobody else can fetch it: not signed out, not signed in as somebody else.
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`${ORIGIN}${href}`)).status()).toBe(401);
  await anonymous.close();
  const other = await newSession(browser, person("Otra Cuenta"));
  expect((await other.page.request.get(`${ORIGIN}${href}`)).status()).toBe(404);
  await other.context.close();
});

test("without donation links the app shows no support UI anywhere, and works", async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByText("Apoyar el proyecto")).toHaveCount(0);
  await signIn(page, person("Sin Donaciones"));
  await expect(page.getByText(/Apoyar/)).toHaveCount(0);
  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "50", concept: "Sin enlaces" });
  await recordPayment(page, "50", "Guardar");
  await expect(page.getByText("Deuda liquidada").first()).toBeVisible();
  await expect(page.getByText(/Apoyar|apoyar su desarrollo/)).toHaveCount(0);
  await page.goto(`${APP}/app/settings`);
  await expect(page.getByText("Apoyar el proyecto")).toHaveCount(0);
});

test("with donation links the invitation is present but never in the way", async ({ page }) => {
  await page.goto(APP_WITH_DONATIONS);
  await expect(page.getByRole("heading", { name: /¿Te resulta útil Symmetry Debt\?/ })).toBeVisible();

  await page.goto(`${APP_WITH_DONATIONS}/login`);
  await page.getByRole("button", { name: /Google/ }).click();
  const who = person("Con Donaciones");
  await page.waitForURL(/\/authorize/);
  await page.fill("#email", who.email);
  await page.fill("#name", who.name);
  await page.click("#continue");
  await page.waitForURL(/:3101\/debt\/app/);

  // Nothing opens by itself.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // A quiet link in the sidebar opens it on request, listing only the configured platforms.
  await page.getByRole("button", { name: "Apoyar Symmetry Debt" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Ko-fi/ })).toHaveAttribute("href", "https://ko-fi.com/example");
  await expect(dialog.getByRole("link", { name: /GitHub Sponsors/ })).toHaveAttribute("rel", /noopener/);
  await expect(dialog.getByRole("link", { name: /Open Collective/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /PayPal|Buy Me a Coffee/ })).toHaveCount(0);
  await expect(dialog.getByText(/Symmetry Debt no procesa pagos ni guarda datos de tarjetas/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Not shown while doing things that matter: the wizard carries no appeal.
  await page.goto(`${APP_WITH_DONATIONS}/app/debts/new`);
  await expect(page.locator("form").getByText(/Apoyar|apoyar su desarrollo/)).toHaveCount(0);
  // Settings › About has its own section.
  await page.goto(`${APP_WITH_DONATIONS}/app/settings`);
  await expect(page.getByRole("heading", { name: "Apoyar el proyecto" })).toBeVisible();
});

test("data export downloads the user's own data", async ({ page }) => {
  const who = person("Ana Exporta");
  await signIn(page, who);
  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "120", concept: "Para exportar" });
  await page.goto(`${APP}/app/settings`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar mis datos" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^symmetry-debt-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(data.profile.email).toBe(who.email);
  expect(data.personalRecords[0]).toMatchObject({ concept: "Para exportar", amountMinor: "12000" });
});
