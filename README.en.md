# Symmetry Debt

**Two sides. One agreement.**

*[Versión en español](README.md)*

Symmetry Debt is an open source web application for keeping track of debts between people: what
you owe, what you are owed, how it will be paid and what has been paid. It does two different
things, and never confuses them:

- **Personal tracking.** Your own record of a debt. Only you can see it. The other person needs
  no account and is not told.
- **Shared agreement.** Both sides sign in, look at the same terms and accept them. From then
  on, a payment counts only when the **other** side confirms it.

Official test instance: <https://aminoacid.com.mx/debt>

## The principle

> **A personal record is never treated as confirmed by both sides.**

What one person wrote down for themselves and what two people agreed on are different things,
and the app keeps them apart at every level:

- on screen, every figure says what it is: *recorded* (only you wrote it down), *confirmed*
  (both sides), *awaiting confirmation* (waiting for the other side) or *proposed* (no agreement
  yet);
- in the calculations, the confirmed balance only counts movements the other side approved;
- in the database, rows of one mode cannot hold the states of the other, and what was confirmed
  cannot be edited or deleted: it is corrected with a reversal or an adjustment that the other
  side approves as well.

Converting a personal record into a shared agreement does not change this: it creates a **new
proposal** with whatever you choose to share, and nothing is confirmed until the other person
accepts it. Your original record stays intact.

## What it does

- Debts in either direction (I owe / I am owed), paid at once or in instalments with their own
  schedule.
- Partial, early and late payments; the balance is always recomputed from the movements.
- Shared agreements through a link: the proposer sends the link any way they like; the other
  person signs in with Google and accepts, rejects or asks for changes.
- Versions of the terms: both sides always accept exactly the same one.
- Payment methods as recorded information (cash, transfer, deposit, card, other). **The app
  does not move money.**
- Bank accounts for receiving payments, with a validated and encrypted CLABE; shown to the other
  side of an agreement only if their owner shares them for that agreement.
- Private receipts (PDF, JPG, PNG, WebP). A receipt is evidence; it confirms nothing.
- Due-date reminders and in-app notifications; email is optional.
- A full history of each debt, an export of your data as JSON, and account deletion.
- Spanish (default) and English. Exact amounts, no floating point.
- Can be served at the root of a domain or under a path (`/debt`).

It has no analytics, advertising or trackers, and it does not store bank passwords, PINs or card
data.

## Quick start (on your machine)

You need Node.js 24 (22 and later work), npm and Docker.

```bash
git clone <URL of this repository>
cd Symmetry_Debt

./scripts/setup.sh --mock-auth                    # creates .env with secrets and a mock sign-in
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL on 127.0.0.1:54329
npm install
npm run db:deploy                                 # applies the migrations

npm run dev:auth-mock                             # in another terminal: local stand-in for Google
npm run dev                                       # http://localhost:3000/debt
```

### Sign-in: mock or real Google

| | How | What for |
|---|---|---|
| **Mock** | `./scripts/setup.sh --mock-auth` and `npm run dev:auth-mock` | Trying it out and developing with no setup. It accepts any email address you type, so it is for your own machine **only**. |
| **Real Google** | `./scripts/setup.sh`, then put `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env` | Real use. Create a "Web application" OAuth client in Google Cloud and register the redirect URI `http://localhost:3000/debt/api/auth/callback/google`. |

The Google steps are in [docs/en/GOOGLE_OAUTH.md](docs/en/GOOGLE_OAUTH.md).

> **Local first, cloud later.** You can use the app on your machine with real data and move it
> afterwards: [docs/en/LOCAL_TO_CLOUD.md](docs/en/LOCAL_TO_CLOUD.md).

## Everything in Docker

To run the whole thing (application + PostgreSQL + a volume for receipts) without Node.js:

```bash
./scripts/setup.sh                 # creates .env and generates the secrets
$EDITOR .env                       # APP_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
docker compose up -d --build       # http://localhost:3000/debt
```

`docker compose down -v` deletes the data; plain `down` keeps it. For a server with a domain and
HTTPS, see [docs/en/SELF_HOSTING.md](docs/en/SELF_HOSTING.md).

## Configuration

Every variable, with comments, is in [`.env.example`](.env.example). The main ones:

| Variable | What for | |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | Path inside the domain: `/debt` (default) or `/` for the root. | read at **build time** |
| `APP_URL` | Public address including the base path: `http://localhost:3000/debt`. Links, cookies and the Google redirect are derived from it. | required in production |
| `DATABASE_URL` | PostgreSQL connection. | required |
| `AUTH_SECRET` | Signs sessions. `openssl rand -base64 32` | required |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client. | required |
| `DATA_ENCRYPTION_KEY` | Encrypts bank details. `openssl rand -base64 32`. **Back it up.** | needed to save bank accounts |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_*` | Where receipts are kept: a local directory or an S3 bucket. | optional |
| `EMAIL_PROVIDER`, `SMTP_URL`, `RESEND_API_KEY` | Email (`none`, `smtp`, `resend`). The app works fully without it. | optional |
| `DONATE_*`, `PROJECT_REPO_URL` | Donation and repository links shown by your installation. | optional |

### The base path

The app can live at `https://example.org/debt` or at `https://debt.example.org`. The path is
**compiled into** the app: to change it, set `NEXT_PUBLIC_BASE_PATH` and build again (or rebuild
the Docker image), and adjust `APP_URL` to match. The Google redirect URI is always
`<APP_URL>/api/auth/callback/google`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server at <http://localhost:3000/debt>. |
| `npm run build` | Generates the Prisma client and builds for production. |
| `npm start` | Starts the production build (`scripts/start-standalone.mjs`). |
| `npm run check` | Lint, types and unit tests. |
| `npm test` | Unit tests. |
| `npm run test:integration` | Tests of the services against a real PostgreSQL (a `…_test` database). |
| `npm run test:e2e` | Browser tests (Playwright) against the production build. |
| `npm run import:debt -- --email <address> --file <file.json>` | Imports a personal record from a file ([example](scripts/examples/personal-debt.example.json)). |
| `npm run db:deploy` | Applies pending migrations. |
| `npm run db:migrate` | Creates and applies a new migration (development). |
| `npm run db:generate` | Regenerates the Prisma client. |
| `npm run db:studio` | Opens Prisma Studio. |
| `npm run dev:auth-mock` | Mock sign-in issuer (development only). |
| `scripts/backup.sh`, `scripts/restore.sh` | Database backup and restore. |

## How it is built

Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma ·
Auth.js (Google) · next-intl · Zod · Vitest · Playwright.

```
prisma/        schema and migrations
messages/      texts in Spanish and English
src/domain/    pure rules: money, dates, schedules, balances, life cycles
src/server/    database, session, encryption, email, files and the services (use cases)
src/actions/   server actions
src/app/       pages and routes
src/components/ interface
tests/         unit, integration and end-to-end
docs/          documentation (es/ and en/)
deploy/        reverse proxy examples (Caddy, nginx)
scripts/       setup, backup, import and start-up
```

## Documentation

Bilingual index: [docs/README.md](docs/README.md).

| Topic | English | Español |
|---|---|---|
| Architecture | [ARCHITECTURE](docs/en/ARCHITECTURE.md) | [ARCHITECTURE](docs/es/ARCHITECTURE.md) |
| Google OAuth client | [GOOGLE_OAUTH](docs/en/GOOGLE_OAUTH.md) | [GOOGLE_OAUTH](docs/es/GOOGLE_OAUTH.md) |
| Self-hosting with Docker | [SELF_HOSTING](docs/en/SELF_HOSTING.md) | [SELF_HOSTING](docs/es/SELF_HOSTING.md) |
| Deploying on Railway | [DEPLOY_RAILWAY](docs/en/DEPLOY_RAILWAY.md) | [DEPLOY_RAILWAY](docs/es/DEPLOY_RAILWAY.md) |
| From local to the cloud | [LOCAL_TO_CLOUD](docs/en/LOCAL_TO_CLOUD.md) | [LOCAL_TO_CLOUD](docs/es/LOCAL_TO_CLOUD.md) |
| Backup and recovery | [BACKUP_AND_RECOVERY](docs/en/BACKUP_AND_RECOVERY.md) | [BACKUP_AND_RECOVERY](docs/es/BACKUP_AND_RECOVERY.md) |
| Data and privacy | [DATA_AND_PRIVACY](docs/en/DATA_AND_PRIVACY.md) | [DATA_AND_PRIVACY](docs/es/DATA_AND_PRIVACY.md) |
| Security model | [SECURITY_MODEL](docs/en/SECURITY_MODEL.md) | [SECURITY_MODEL](docs/es/SECURITY_MODEL.md) |
| Testing | [TESTING](docs/en/TESTING.md) | [TESTING](docs/es/TESTING.md) |

## Security

If you find a vulnerability, **do not open a public issue**: follow [SECURITY.md](SECURITY.md)
to report it privately. How the app protects data is described in
[docs/en/SECURITY_MODEL.md](docs/en/SECURITY_MODEL.md).

## Contributing

Contributions are welcome: read [CONTRIBUTING.en.md](CONTRIBUTING.en.md) and the
[code of conduct](CODE_OF_CONDUCT.md).

## Donations

Symmetry Debt is free and **no feature depends on a donation**. Donations are voluntary and
happen outside the app, on whatever platform the operator of each installation chooses: the
links are configured with the `DONATE_*` variables, and when none is configured the app shows
nothing about it. The app never processes payments.

## Licence

[MIT](LICENSE).
