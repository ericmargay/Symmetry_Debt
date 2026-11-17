# Testing

*[Versión en español](../es/TESTING.md)*

Three layers, from fastest to most complete.

| Layer | What it covers | Needs | Command |
|---|---|---|---|
| **Unit** | `src/domain`: money, dates, CLABE, schedules, balances, life cycles | nothing | `npm test` |
| **Integration** | `src/server`: every service, against a real PostgreSQL with the real migrations | PostgreSQL | `npm run test:integration` |
| **End-to-end** | Whole flows in a browser, under the `/debt` base path | PostgreSQL, the mock sign-in | `npm run test:e2e` |

`npm run check` runs lint, the type check and the unit tests. `npm run test:all` runs unit and
integration tests together. Continuous integration (`.github/workflows/ci.yml`) runs all of
this plus a production build and a build-and-start test of the Docker image.

## Unit tests

`tests/unit/`, with [Vitest](https://vitest.dev). They need no database and no network and run
in well under a second. This is where the rules are pinned down: how `1,500.50` is read, why
`1.500` is refused, how a CLABE's check digit is computed, how payments are poured over a
schedule, which movements count towards which balance.

## Integration tests

`tests/integration/`. They call the services exactly as the app does — with an explicit actor —
against a real PostgreSQL, so constraints, triggers, transactions and locks are the real ones.

### The test database

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL on 127.0.0.1:54329
npm run test:integration
```

- The tests **never use your development database**. They use a separate one whose name ends in
  `_test`: by default your `DATABASE_URL` with `_test` appended (`symmetry_debt_test`), or
  whatever `TEST_DATABASE_URL` says. They refuse to run against a name that does not end in
  `_test`.
- Before the run, the database is created if it does not exist and the project's real
  migrations are applied (`tests/integration/global-setup.ts`).
- Every test starts from empty tables.
- Nothing leaves the machine: outgoing email is intercepted, receipts go to a temporary
  directory, rate limiting is off unless a test turns it on.

### What they prove

Besides the ordinary paths, each area has tests for what must **not** happen:

- somebody else cannot see or touch a personal record, or anything in a shared agreement;
- whoever recorded a movement cannot confirm it; nobody accepts their own proposal;
- a share link is single-use, expires, and opens nothing for somebody who only knows an email;
- converting a personal record leaves it byte for byte as it was until the other person
  accepts — and afterwards too, if they decline;
- two simultaneous payments cannot overshoot the balance; the same request sent three times
  creates one row; three simultaneous approvals confirm once;
- the database itself rejects editing a confirmed movement, changing a debt's mode, rewriting
  accepted terms or touching the audit trail;
- bank details are not in clear text in any column, and are visible to the other side only when
  explicitly shared;
- a file is accepted for what its bytes are, not for its name.

## End-to-end tests

`tests/e2e/`, with [Playwright](https://playwright.dev). They drive a real browser against the
**production build** of the app under its base path, signing in through the **mock issuer**
instead of Google.

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL
npx playwright install chromium                    # once
npm run test:e2e
```

What that command does:

1. `tests/e2e/prepare.ts` drops and recreates a database of its own — your development
   database's name plus `_e2e_test`, or whatever `E2E_DATABASE_URL` says (the name must end in
   `_test`) — applies the migrations and builds the app (`E2E_SKIP_BUILD=1` reuses the last
   build).
2. Playwright starts the mock issuer on port 4466 and **two** copies of the built server: one
   on port 3100 with no donation links and one on 3101 with donation links configured, so both
   configurations are exercised. Their settings are fixed in `tests/e2e/env.ts`; your `.env` is
   not read.
3. The specs run in two Playwright projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7,
   only `mobile.spec.ts`).

| Spec | What it walks through |
|---|---|
| `auth-i18n.spec.ts` | Sign-in under `/debt`, the return to the page that was asked for, sign-out, refusal of open redirects, the CSP, and languages: Spanish by default, English on request, never imposed by the browser. |
| `personal.spec.ts` | Personal tracking from recording to settling, cash and transfer details, bank accounts (CLABE validated, masked, private). |
| `shared.spec.ts` | A shared agreement with two signed-in people: link, acceptance by both, payments that count only once confirmed; an invitation that names an email; converting a personal record. |
| `receipts-donations.spec.ts` | Receipts (attach, open, private, confirm nothing), the app with and without donation links, data export. |
| `mobile.spec.ts` | The whole personal flow on a phone-sized screen. |

Nothing touches your development data, and receipts go to a temporary directory.

### The mock sign-in issuer

`scripts/mock-oidc.mjs` is a small OpenID Connect server that stands in for
`accounts.google.com`. The app's real sign-in code runs unchanged — discovery, authorisation
code with PKCE, token exchange, a signed ID token — but instead of Google's account chooser
there is a form where the test (or you) types who to be.

```bash
npm run dev:auth-mock               # http://localhost:4455
# in .env:  AUTH_GOOGLE_ISSUER=http://localhost:4455
#           AUTH_GOOGLE_ID=symmetry-debt-local
#           AUTH_GOOGLE_SECRET=symmetry-debt-local-secret
```

It only redirects back to `localhost`, and it must never be configured on a real installation:
it vouches for any address.

## Checking things by hand

- **Email**: `docker compose -f docker-compose.dev.yml --profile extras up -d` starts Mailpit.
  Set `EMAIL_PROVIDER=smtp` and `SMTP_URL=smtp://localhost:1025`, then read what the app sends
  at <http://localhost:8025>.
- **S3 storage**: the same profile starts MinIO (console at <http://localhost:9001>). Create a
  bucket and set `STORAGE_DRIVER=s3`, `S3_ENDPOINT=http://localhost:9000`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- **The Docker image**: `docker compose up -d --build`, then
  `curl http://localhost:3000/debt/api/health`.
- **Backups**: `scripts/backup.sh --dev` followed by
  `scripts/restore.sh backups/FILE.dump --dev --database restore_check --yes`.

## Writing tests

- A rule about amounts, dates or states belongs in `src/domain` with a unit test.
- Anything about who may do what, or about what gets stored, needs an integration test — and
  one of its cases must be the refusal.
- Use made-up people and amounts. Never put real data in a test or a fixture.
