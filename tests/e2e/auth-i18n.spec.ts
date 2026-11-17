import { expect, test } from "@playwright/test";
import { APP, person, signIn, watchForProblems } from "./helpers";

test.describe("sign-in under /debt", () => {
  test("the bare domain root leads to the app's base path", async ({ request }) => {
    const response = await request.get("http://localhost:3100/", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/debt");
  });

  test("a protected page sends visitors to sign in and brings them back", async ({ page, context }) => {
    const problems = watchForProblems(page);
    await page.goto(`${APP}/app/settings`);
    await expect(page).toHaveURL(/\/debt\/login\?next=%2Fapp%2Fsettings/);
    await expect(page.getByRole("heading", { name: "Entra a Symmetry Debt" })).toBeVisible();

    // The request that goes to the identity provider carries the callback under the base path.
    const [authorize] = await Promise.all([
      page.waitForRequest((request) => request.url().includes("/authorize?")),
      page.getByRole("button", { name: /Google/ }).click(),
    ]);
    const query = new URL(authorize.url()).searchParams;
    expect(query.get("redirect_uri")).toBe(`${APP}/api/auth/callback/google`);
    expect(query.get("code_challenge_method")).toBe("S256");
    expect(query.get("state")).toBeTruthy();
    expect(query.get("nonce")).toBeTruthy();

    const ana = person("Ana Entrada");
    await page.fill("#email", ana.email);
    await page.fill("#name", ana.name);
    await page.click("#continue");
    await expect(page).toHaveURL(`${APP}/app/settings`);
    await expect(page.getByText(ana.email).first()).toBeVisible();

    // The session cookie is HttpOnly and scoped to the base path: it never travels elsewhere.
    const session = (await context.cookies()).find((cookie) => cookie.name.endsWith("sd.session"));
    expect(session).toMatchObject({ path: "/debt", httpOnly: true, sameSite: "Lax" });
    expect((await context.cookies("http://localhost:3100/other")).some((cookie) => cookie.name.endsWith("sd.session"))).toBe(false);

    // Nothing the page can read exposes the session token.
    const exposed = await page.evaluate(async (url) => (await fetch(url)).text(), `${APP}/api/auth/session`);
    expect(exposed).toContain(ana.email);
    expect(exposed).not.toContain(session!.value);
    expect(exposed).not.toContain("sessionToken");

    expect(problems).toEqual([]);
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page, person("Sale Pronto"));
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(`${APP}`);
    await page.goto(`${APP}/app`);
    await expect(page).toHaveURL(/\/debt\/login/);
  });

  test("an open redirect through ?next is refused", async ({ page }) => {
    await page.goto(`${APP}/login?next=${encodeURIComponent("//evil.example/steal")}`);
    await signIn(page, person("Segura"));
    await expect(page).toHaveURL(`${APP}/app`);
  });

  test("pages carry a strict CSP and the API refuses anonymous access", async ({ request }) => {
    const login = await request.get(`${APP}/login`);
    const csp = login.headers()["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(login.headers()["x-frame-options"]).toBe("DENY");

    expect((await request.get(`${APP}/api/export`)).status()).toBe(401);
    expect((await request.get(`${APP}/api/attachments/whatever`)).status()).toBe(401);
    expect((await request.post(`${APP}/api/cron/reminders`)).status()).toBe(404); // no CRON_SECRET configured
    expect(await (await request.get(`${APP}/api/health`)).json()).toEqual({ status: "ok" });
  });
});

test.describe("languages", () => {
  test("Spanish by default, English on request, and the choice sticks", async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Las cuentas claras mantienen el equilibrio");

    await page.getByRole("button", { name: "English" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep your debts clear");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // The language chosen before signing up becomes the new account's preference…
    const sam = person("Sam English");
    await page.goto(`${APP}/login`);
    await expect(page.getByRole("heading", { name: "Sign in to Symmetry Debt" })).toBeVisible();
    await signIn(page, sam);
    await expect(page.getByRole("link", { name: "My debts" }).first()).toBeVisible();

    // …and it follows the account, not the browser: a fresh browser gets English after sign-in.
    const fresh = await page.context().browser()!.newContext({ locale: "es-MX" });
    const other = await fresh.newPage();
    await other.goto(`${APP}/login`);
    await expect(other.getByRole("heading", { name: "Entra a Symmetry Debt" })).toBeVisible();
    await signIn(other, sam);
    await expect(other.locator("html")).toHaveAttribute("lang", "en");
    await fresh.close();

    // Switching back from the settings is remembered too.
    await page.goto(`${APP}/app/settings`);
    await page.getByLabel("Language", { exact: true }).selectOption("es");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("the browser's language is offered, never imposed", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto(APP);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("This site is also available in English.")).toBeVisible();
    await page.getByRole("button", { name: "No, thanks" }).click();
    await expect(page.getByText("This site is also available in English.")).toBeHidden();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("This site is also available in English.")).toBeHidden();
    await context.close();
  });

  test("dates and amounts follow the language", async ({ page }) => {
    const ana = person("Ana Formatos");
    await signIn(page, ana);
    const { createPersonalDebt } = await import("./helpers");
    await createPersonalDebt(page, { direction: "owe", person: "Marta", amount: "1234.5", concept: "Formato" });
    await expect(page.getByTestId("outstanding")).toHaveText("$1,234.50");
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByTestId("outstanding")).toHaveText("MX$1,234.50");
    await expect(page.getByText("Left to pay")).toBeVisible();
  });
});
