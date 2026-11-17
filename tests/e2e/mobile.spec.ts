import { expect, test, type Page } from "@playwright/test";
import { APP, createPersonalDebt, outstanding, person, recordPayment, signIn, watchForProblems } from "./helpers";

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1);
}

test("the whole personal flow works on a phone", async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto(APP);
  await noHorizontalOverflow(page);

  await signIn(page, person("Ana Móvil"));
  // Phones get the bottom bar instead of the sidebar.
  const bar = page.getByRole("navigation", { name: "Navegación principal" }).last();
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: "Nueva deuda" })).toBeVisible();
  await noHorizontalOverflow(page);

  await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "1500", concept: "Desde el teléfono" });
  await noHorizontalOverflow(page);
  await recordPayment(page, "500", "Guardar");
  await expect(outstanding(page)).toHaveText("$1,000.00");
  await noHorizontalOverflow(page);

  for (const path of ["/app", "/app/debts", "/app/people", "/app/accounts", "/app/activity", "/app/notifications", "/app/settings", "/app/debts/new"]) {
    await page.goto(`${APP}${path}`);
    await noHorizontalOverflow(page);
  }

  // The rest of the navigation lives in the menu sheet.
  await page.goto(`${APP}/app`);
  await bar.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Cuentas bancarias" }).click();
  await expect(page).toHaveURL(`${APP}/app/accounts`);
  expect(problems).toEqual([]);
});
