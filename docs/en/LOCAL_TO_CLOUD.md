# Local first, cloud later

*[Versión en español](../es/LOCAL_TO_CLOUD.md)*

The recommended way to adopt Symmetry Debt: **run it on your own machine until you trust it —
with real data if you like — and move to the cloud afterwards**, taking that data with you.
Nothing has to be published to try it.

This guide covers both halves: running locally in a way that keeps your data, and moving it.

## Part 1 — Running locally with data you intend to keep

Either of these works. Pick one and stay with it.

### A. The whole thing in Docker (closest to how it will run in the cloud)

```bash
./scripts/setup.sh
$EDITOR .env                       # AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET  (see "Signing in" below)
docker compose up -d --build       # http://localhost:3000/debt
```

Your data lives in two Docker volumes: `symmetry-debt_db-data` (database) and
`symmetry-debt_uploads` (receipts).

### B. Development mode

```bash
./scripts/setup.sh
docker compose -f docker-compose.dev.yml up -d
npm install && npm run db:deploy && npm run dev      # http://localhost:3000/debt
```

Your data lives in the Docker volume `symmetry-debt-dev_dev-db` (database) and in the folder
`./.data/uploads` (receipts).

### Do not lose it

- `docker compose stop` / `down` keep the volumes. **`down -v` deletes them.** So does
  "Clean / Purge data" in Docker Desktop.
- Back up before anything risky, and now and then anyway:
  `scripts/backup.sh --compose` (or `--dev`). See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).
- Keep a copy of `.env` somewhere else. `DATA_ENCRYPTION_KEY` in particular: the bank details
  you save can only ever be read with that value.

### Signing in while local

**Best: real Google sign-in, even locally.** Create the OAuth client once
([GOOGLE_OAUTH.md](GOOGLE_OAUTH.md)) and register both redirect URIs — the local one and the
future public one. The accounts you create locally are then the same accounts in the cloud:
after the move you sign in and everything is there.

**Also fine: the mock sign-in** (`./scripts/setup.sh --mock-auth` + `npm run dev:auth-mock`),
which needs no Google setup. It works with development mode (B). If you use it with data you
intend to keep:

- **type your real email addresses** in the mock form — yours and those of anybody who tries it
  with you;
- when the data later runs on an installation with real Google sign-in, the first time the
  **verified owner of each address** signs in, the account becomes theirs and the mock identity
  is dropped. Nobody else can claim it.

An account created with a made-up address (`ana@example.com`) can never be claimed, because
nobody can prove to Google that they own it.

> The mock sign-in vouches for any address anyone types. Use it only on your own machine.

### Loading a debt from a file

To avoid typing a personal record by hand, describe it in a JSON file (the same fields as the
"new debt" form in personal mode; example in
[`scripts/examples/personal-debt.example.json`](../../scripts/examples/personal-debt.example.json))
and import it:

```bash
npm run import:debt -- --email your-address@gmail.com --file .data/imports/my-debt.json
```

It goes through the same service as the form, so the same validation applies. If nobody has
signed in with that address yet, the account is created unclaimed, and the first person who
signs in with that **verified** address finds the debt already there. Running it twice with the
same file duplicates nothing. Keep your real files in `.data/imports/`, which git ignores.

## Part 2 — Moving to the cloud

The example uses Railway ([DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)); the steps are the same for
any server ([SELF_HOSTING.md](SELF_HOSTING.md)).

### 1. Deploy the app, empty, with the same encryption key

Follow the deployment guide, with one difference: **set `DATA_ENCRYPTION_KEY` to the value from
your local `.env`** instead of generating a new one. `AUTH_SECRET` may be new.

Let it start once and check `<APP_URL>/api/health`. The database now has the right structure
and no data. Do not share the address yet.

### 2. Stop writing locally

```bash
docker compose stop app            # A — or just stop `npm run dev` for B
```

### 3. Back up the local database

```bash
scripts/backup.sh --compose        # A
scripts/backup.sh --dev            # B
```

### 4. Restore it into the cloud database

Use the database's **public** connection URL (on Railway: the PostgreSQL service's
`DATABASE_PUBLIC_URL`):

```bash
scripts/restore.sh backups/symmetry-debt-compose-….dump --url "postgresql://…"
```

It shows the target and asks for confirmation. It replaces the (empty) contents of the cloud
database with your data, in one transaction.

Use the same major version of PostgreSQL on both sides — 17 — or a newer one in the cloud.

### 5. Copy the receipts

Skip this if you never attached a file.

First get them into a plain folder:

```bash
# A — out of the Docker volume
mkdir -p uploads-export && docker run --rm -v symmetry-debt_uploads:/data:ro -v "$PWD/uploads-export:/out" alpine cp -a /data/uploads/. /out/

# B — they already are a folder: ./.data/uploads
```

Then put them where the cloud installation keeps receipts:

| Cloud storage | How |
|---|---|
| A Railway volume mounted at `/data` | `railway volume files upload ./uploads-export /uploads` — then check with `railway volume files list /uploads`. The folder must end up as `/data/uploads/receipts/…` inside the container. |
| Another server's Docker volume | Copy the folder over (`rsync`, `scp`) and load it into the volume: `docker run --rm -v symmetry-debt_uploads:/data -v "$PWD/uploads-export:/in:ro" alpine cp -a /in/. /data/uploads/` |
| An S3 bucket (`STORAGE_DRIVER=s3`) | Upload the folder's **contents** to the bucket's root, keeping the `receipts/…` paths: `aws s3 sync ./uploads-export s3://your-bucket/` |

The paths inside the folder (`receipts/2026/11/…`) are what the database refers to; keep them
as they are.

### 6. Restart and check

```bash
railway redeploy --service symmetry-debt --yes     # or: docker compose restart app
```

Then, on the public address:

- [ ] Sign in with your Google account → your debts are there.
- [ ] Open a bank account → the CLABE is shown (this proves the encryption key matches).
- [ ] Open a receipt → the file is shown (this proves the receipts were copied).
- [ ] If you used the mock sign-in locally: sign in with the **same address** → the account is
      yours, with everything in it.

### 7. Afterwards

- **Invitation links sent from the local installation do not work for anybody else**: they
  point at `localhost`. Open each pending agreement in the cloud installation and generate a
  new link.
- Keep the last local backup for a while. When you are sure, remove the local data:
  `docker compose down -v` (and delete `./.data` for development mode).
- From now on, back up the cloud installation: `scripts/backup.sh --url "…"`.

## What does and does not travel

| | |
|---|---|
| Debts, agreements, movements, history, contacts, notifications, preferences | In the database backup. |
| Accounts and their Google identities | In the database backup. Real Google identities keep working; mock ones are replaced on first real sign-in. |
| Open sessions | Technically in the backup, but cookies belong to the old address. Everybody simply signs in again. |
| Bank details | In the database backup, **encrypted**. Readable only with the same `DATA_ENCRYPTION_KEY`. |
| Receipts | **Not** in the database. Copied separately (step 5). |
| Configuration (`.env`) | **Not** in the database. Set on the new host. |
