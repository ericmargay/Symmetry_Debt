# Contributing

*[Versión en español](CONTRIBUTING.md)*

Thank you for your interest in Symmetry Debt. It is an open source project (MIT) run by
volunteers. This guide explains how to set up the environment, which rules the code follows and
what is expected of a change before it is merged.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). If you found a security
problem, **do not open an issue**: follow [SECURITY.md](SECURITY.md).

## What the project promises (and no change may break)

1. **A personal record is never presented as confirmed by both sides.** What one person wrote
   down for themselves and what two people agreed on are different things — in the database, in
   the calculations and on screen.
2. **Nothing private to one person becomes visible to another** unless its owner explicitly
   shares it. Knowing a name or an email address gives access to nothing.
3. **Confirmed history is not altered.** It is corrected with new movements (reversals,
   adjustments) that the other side approves, never by editing or deleting.
4. **Amounts are exact.** They never pass through a floating-point number.
5. **No feature depends on a donation.**

## Setting up

You need Node.js 24 (22 and later work; there is an `.nvmrc`), npm and Docker.

```bash
git clone https://github.com/ericmargay/Symmetry_Debt.git
cd Symmetry_Debt

./scripts/setup.sh --mock-auth                    # creates .env with secrets and a mock sign-in
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL on 127.0.0.1:54329
npm install                                       # also generates the Prisma client
npm run db:deploy                                 # applies the migrations

npm run dev:auth-mock                             # in another terminal: mock OIDC issuer
npm run dev                                       # http://localhost:3000/debt
```

`--mock-auth` configures a local identity issuer that stands in for Google **for development
only**: it accepts any email address you type. To sign in with real Google instead, leave that
option out and follow [docs/en/GOOGLE_OAUTH.md](docs/en/GOOGLE_OAUTH.md).

Optional services to try email and S3 storage:

```bash
docker compose -f docker-compose.dev.yml --profile extras up -d   # Mailpit (:8025) and MinIO (:9001)
```

## How it is organised

```
prisma/            schema and migrations (the second migration adds constraints and triggers)
messages/          es.json and en.json: every text of the interface and of the emails
src/domain/        pure rules with no access to anything: money, dates, CLABE, schedules,
                   balances, terms, life cycles
src/schemas/       input validation (Zod), shared by forms and server
src/server/        everything that touches the world: database, session, encryption, email,
                   files, audit trail, notifications and, in services/, the use cases
src/actions/       server actions: they call the services with the signed-in person
src/app/           pages and routes (Next.js App Router)
src/components/    interface components
src/i18n/          language configuration
tests/unit/        tests of src/domain
tests/integration/ tests of src/server against a real PostgreSQL
tests/e2e/         whole flows in the browser (Playwright)
docs/              documentation (es/ and en/)
```

The full explanation is in [docs/en/ARCHITECTURE.md](docs/en/ARCHITECTURE.md).

## Rules of the code

### Money

- Every amount is a `bigint` in the **minor unit** of its currency (cents). In the database it
  is `BIGINT`.
- What a person types is read with `parseAmount` (`src/domain/money.ts`) and shown with
  `formatMoney`. **Never** use `Number`, `parseFloat`, `toFixed` or decimal arithmetic on
  amounts.
- In JSON (terms snapshots, events, exports) amounts travel as strings of digits.
- Never add up amounts in different currencies.

### Dates

- A payment date or a due date is a **calendar date**, not an instant: it travels as
  `"2026-03-05"` and is stored in `DATE` columns (`src/domain/dates.ts`).
- The date something happened (`effectiveDate`) and the moment it was written down
  (`recordedAt`) are separate fields, on purpose.

### Texts

- No visible text is written inside a component. Everything comes from `messages/es.json`
  **and** `messages/en.json`, with the same keys in both. Spanish is the reference: keys are
  checked at compile time against `es.json`.
- Validation and business errors are keys (`validation.*`, `errors.*`), not sentences.
- Emails and notifications are written in the language of whoever receives them.

### Services and authorisation

- A service is explicitly given the person who is acting (`Actor`) and **checks by itself**
  whether they may do what is being asked. The interface is never the only barrier.
- Access to a debt goes through `requireDebtAccess`: personal record → only its owner; shared
  agreement → only its two participants. Whoever has no access gets "not found", so the
  existence of a record is never revealed.
- Every change to a debt happens in a transaction that first locks its row (`lockDebt`) and
  only then reads the state, so two simultaneous requests never act on stale data.
- Every change writes its audit event in the same transaction.
- Operations that create something take an idempotency key: sending them twice does not
  duplicate anything.

### The two modes

- `PERSONAL`: movements are `PERSONAL_RECORD`; their owner edits and deletes them freely.
- `SHARED`: a movement starts as `PENDING` and only counts towards the balance once the
  **other** side approves it (`CONFIRMED`). Whoever recorded it cannot confirm it.
- Converting a personal record creates a **new** agreement that points back to it; the original
  record is not modified.

### Database

- Change `prisma/schema.prisma` and generate the migration: `npm run db:migrate -- --name what_changes`.
- What the schema language cannot express (`CHECK` constraints, triggers) is written by hand in
  the SQL of a migration. See `prisma/migrations/*_integrity_rules/`.
- Never edit a migration that has been published: add another one.
- Partial indexes are declared in the schema (`where: raw("…")`). Write the predicate the way
  PostgreSQL stores it (for example `a <> 'X' AND a <> 'Y'` instead of `a NOT IN (…)`);
  otherwise Prisma will think the index changed on every migration.
- `prisma`, `@prisma/client` and `@prisma/adapter-pg` are updated together and by hand.

### Interface components

- Components in `src/components/ui` come from shadcn/ui (Radix). Add one with
  `npx shadcn@latest add <name>`; their shared CSS is vendored in `src/app/shadcn.css`.
- Colours, fonts and radii are tokens in `src/app/globals.css`. Use the tokens, not literal
  colours, so light and dark themes keep working.

### Security

- Do not log secrets, tokens or personal data.
- Do not add places to store provider tokens, passwords or card data.
- A file is what its content says it is, not its name nor the type the browser announces.

## Tests

| What you changed | Tests expected | How to run them |
|---|---|---|
| `src/domain` | unit | `npm test` |
| `src/server`, `prisma/` | integration, against a real PostgreSQL | `npm run test:integration` |
| pages, sign-in, flows | end-to-end | `npm run test:e2e` |

`npm run check` runs lint, types and unit tests. Integration tests create and use a separate
database whose name ends in `_test`; they never touch your development data. More in
[docs/en/TESTING.md](docs/en/TESTING.md).

A change that touches permissions, balances or approvals needs a test proving the case that
must **not** happen (somebody else cannot see it, whoever recorded it cannot confirm it, and so
on).

## Sending a change

1. Open an issue first if the change is large or alters behaviour.
2. Work on a branch. Make small commits whose messages say what changes and why.
3. Before opening the pull request: `npm run check` and the tests that apply.
4. Update the documentation (`README`, `docs/`, `.env.example`) if behaviour, configuration or
   deployment changes. The main documentation exists in Spanish and in English.
5. In the pull request, describe what changes, why, and how you checked it.

## Translations

To fix a text, edit the same key in `messages/es.json` and `messages/en.json`. To propose a new
language open an issue first: it has to be added in `src/i18n/config.ts`, the whole catalogue
translated, and the format of dates and currencies decided.

## Licence

By contributing you agree that your contribution is published under the project's
[MIT licence](LICENSE).
