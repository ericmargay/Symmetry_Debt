#!/usr/bin/env node
/**
 * Mock OpenID Connect issuer — for local development and automated tests ONLY.
 *
 * It stands in for accounts.google.com so the real sign-in code path can run without Google
 * credentials: discovery, authorization code + PKCE, token exchange and a signed ID token.
 * Instead of Google's account chooser it shows a small form where you type who you are.
 *
 *   node scripts/mock-oidc.mjs                 # http://localhost:4455
 *   AUTH_GOOGLE_ISSUER=http://localhost:4455   # in the app's .env
 *
 * Identities issued here are prefixed "mock-". They are not real Google identities, and the app
 * lets the real owner of the email address take the account over the first time they sign in
 * with Google (see src/server/auth/adapter.ts).
 *
 * NEVER point a production deployment at this server: it will vouch for any email address.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const PORT = Number.parseInt(process.env.MOCK_OIDC_PORT ?? "4455", 10);
const ISSUER = (process.env.MOCK_OIDC_ISSUER ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const CLIENT_ID = process.env.AUTH_GOOGLE_ID ?? "symmetry-debt-local";
const CLIENT_SECRET = process.env.AUTH_GOOGLE_SECRET ?? "symmetry-debt-local-secret";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const keyId = randomBytes(8).toString("hex");
const jwk = { ...(await exportJWK(publicKey)), kid: keyId, use: "sig", alg: "RS256" };

/** code → { clientId, redirectUri, codeChallenge, nonce, profile, expiresAt } */
const codes = new Map();
/** access token → profile */
const accessTokens = new Map();

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const subjectFor = (email) => `mock-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

async function readForm(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function chooserPage(params, error) {
  const hidden = ["client_id", "redirect_uri", "state", "nonce", "code_challenge", "code_challenge_method", "scope"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? "")}">`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock sign-in · Symmetry Debt</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: Canvas; color: CanvasText; }
  main { width: min(26rem, calc(100vw - 2rem)); border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 14px; padding: 1.5rem; }
  h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
  p { margin: 0 0 1rem; opacity: .75; font-size: .9rem; }
  label { display: block; font-size: .85rem; margin: .75rem 0 .25rem; }
  input[type=email], input[type=text] { width: 100%; box-sizing: border-box; padding: .6rem .7rem; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 30%, transparent); font: inherit; background: Canvas; color: CanvasText; }
  button { margin-top: 1.1rem; width: 100%; padding: .65rem; border: 0; border-radius: 8px; font: inherit; font-weight: 600; background: #0f5c5a; color: #fff; cursor: pointer; }
  .warn { margin-top: 1rem; padding: .6rem .75rem; border-radius: 8px; background: color-mix(in srgb, #d97706 18%, transparent); font-size: .8rem; }
  .error { color: #b91c1c; font-size: .85rem; margin-top: .5rem; }
</style>
</head>
<body>
<main>
  <h1>Mock sign-in</h1>
  <p>This replaces Google's account chooser on your machine. Type who you want to be.</p>
  <form method="post" action="${ISSUER}/authorize">
    ${hidden}
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required autofocus autocomplete="email" placeholder="ana@example.com">
    <label for="name">Name (optional)</label>
    <input id="name" name="name" type="text" autocomplete="name" placeholder="Ana Example">
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
    <button type="submit" id="continue">Continue</button>
  </form>
  <div class="warn">Development only. Nothing here is verified by Google.</div>
</main>
</body>
</html>`;
}

function validateAuthorizeParams(params) {
  if (params.get("client_id") !== CLIENT_ID) return "Unknown client_id (check AUTH_GOOGLE_ID).";
  const redirectUri = params.get("redirect_uri");
  if (!redirectUri) return "Missing redirect_uri.";
  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return "Invalid redirect_uri.";
  }
  // The mock only ever sends people back to a machine-local app.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && process.env.MOCK_OIDC_ALLOW_ANY_REDIRECT !== "true") {
    return "This mock issuer only redirects to localhost.";
  }
  if (!parsed.pathname.endsWith("/api/auth/callback/google")) return "Unexpected redirect_uri path.";
  return null;
}

function clientAuthenticated(req, form) {
  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":").map(decodeURIComponent);
    return id === CLIENT_ID && secret === CLIENT_SECRET;
  }
  return form.get("client_id") === CLIENT_ID && form.get("client_secret") === CLIENT_SECRET;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", ISSUER);

    if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
      return send(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "email", "profile"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code"],
      });
    }

    if (req.method === "GET" && url.pathname === "/jwks") {
      return send(res, 200, { keys: [jwk] });
    }

    if (req.method === "GET" && url.pathname === "/authorize") {
      const problem = validateAuthorizeParams(url.searchParams);
      if (problem) return send(res, 400, `<p>${escapeHtml(problem)}</p>`);
      return send(res, 200, chooserPage(url.searchParams));
    }

    if (req.method === "POST" && url.pathname === "/authorize") {
      const form = await readForm(req);
      const problem = validateAuthorizeParams(form);
      if (problem) return send(res, 400, `<p>${escapeHtml(problem)}</p>`);

      const email = (form.get("email") ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, chooserPage(form, "Enter a valid email address."));
      const name = (form.get("name") ?? "").trim() || email.split("@")[0];

      const code = randomBytes(24).toString("base64url");
      codes.set(code, {
        clientId: form.get("client_id"),
        redirectUri: form.get("redirect_uri"),
        codeChallenge: form.get("code_challenge") || null,
        nonce: form.get("nonce") || null,
        profile: { sub: subjectFor(email), email, email_verified: true, name, picture: null },
        expiresAt: Date.now() + 60_000,
      });

      const redirect = new URL(form.get("redirect_uri"));
      redirect.searchParams.set("code", code);
      if (form.get("state")) redirect.searchParams.set("state", form.get("state"));
      redirect.searchParams.set("iss", ISSUER);
      return send(res, 302, "", { location: redirect.toString() });
    }

    if (req.method === "POST" && url.pathname === "/token") {
      const form = await readForm(req);
      if (!clientAuthenticated(req, form)) return send(res, 401, { error: "invalid_client" });

      const code = form.get("code") ?? "";
      const grant = codes.get(code);
      codes.delete(code); // single use
      if (form.get("grant_type") !== "authorization_code" || !grant || grant.expiresAt < Date.now()) {
        return send(res, 400, { error: "invalid_grant" });
      }
      if (grant.redirectUri !== form.get("redirect_uri")) return send(res, 400, { error: "invalid_grant" });
      if (grant.codeChallenge) {
        const verifier = form.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (challenge !== grant.codeChallenge) return send(res, 400, { error: "invalid_grant", error_description: "PKCE check failed" });
      }

      const now = Math.floor(Date.now() / 1000);
      const claims = { ...grant.profile, ...(grant.nonce ? { nonce: grant.nonce } : {}) };
      if (claims.picture === null) delete claims.picture;
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
        .setIssuer(ISSUER)
        .setAudience(grant.clientId)
        .setIssuedAt(now)
        .setExpirationTime(now + 300)
        .sign(privateKey);

      const accessToken = randomBytes(24).toString("base64url");
      accessTokens.set(accessToken, grant.profile);
      return send(res, 200, { access_token: accessToken, token_type: "Bearer", expires_in: 300, id_token: idToken, scope: "openid email profile" });
    }

    if (url.pathname === "/userinfo") {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const profile = token ? accessTokens.get(token) : null;
      if (!profile) return send(res, 401, { error: "invalid_token" });
      return send(res, 200, profile);
    }

    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

    return send(res, 404, { error: "not_found" });
  } catch (error) {
    console.error("[mock-oidc]", error);
    return send(res, 500, { error: "server_error" });
  }
});

server.listen(PORT, () => {
  console.log(`[mock-oidc] issuer ready at ${ISSUER} (client_id: ${CLIENT_ID})`);
  console.log("[mock-oidc] development only — it will vouch for any email address.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
