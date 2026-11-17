# Backup and recovery

*[Versión en español](../es/BACKUP_AND_RECOVERY.md)*

Three things make up an installation's data. A backup that misses one of them is incomplete.

| What | Where it lives | Without it |
|---|---|---|
| **The database** | PostgreSQL | Everything is gone: debts, payments, agreements, history. |
| **The receipts** | `STORAGE_LOCAL_DIR` (a directory or Docker volume) or an S3 bucket | Records survive, attached files do not. |
| **`DATA_ENCRYPTION_KEY`** | Your `.env` / your host's variables | Saved bank details (CLABE, account numbers) can never be read again. |

Keep a copy of the whole `.env` too: `AUTH_SECRET`, the Google client and the rest are quicker
to restore than to recreate.

## Backing up the database

[`scripts/backup.sh`](../../scripts/backup.sh) writes one file in PostgreSQL's custom format. No
PostgreSQL tools are needed on your machine: it uses the ones inside the database container, or
a throw-away container matching the server's version.

```bash
scripts/backup.sh --dev                     # the development database (docker-compose.dev.yml)
scripts/backup.sh --compose                 # the standalone installation (docker-compose.yml)
scripts/backup.sh --url "postgresql://…"    # any PostgreSQL this machine can reach, e.g. Railway
```

The file lands in `backups/` (ignored by git) as `symmetry-debt-<source>-<date>.dump`, readable
only by you. Options: `--output FILE`, `--database NAME` (for `--dev`/`--compose`), and
`--uploads DIR` to archive a receipts directory next to it.

For **Railway**, use the *public* connection URL of the PostgreSQL service (its
`DATABASE_PUBLIC_URL` variable, in the dashboard under *Variables*):

```bash
scripts/backup.sh --url "postgresql://postgres:…@….proxy.rlwy.net:12345/railway"
```

> A backup contains everything, in clear, except the bank details (which stay encrypted). Treat
> it like the database itself: store it somewhere private and, if it leaves your machine,
> encrypt it first — for example `gpg --symmetric backups/file.dump`.

### Doing it regularly

A cron entry on the server is enough:

```cron
# every night at 03:15, keeping 30 days
15 3 * * *  cd /srv/Symmetry_Debt && scripts/backup.sh --compose >> backups/backup.log 2>&1 && find backups -name '*.dump' -mtime +30 -delete
```

Copy the files to another machine or to object storage: a backup that lives on the same disk as
the database protects against mistakes, not against losing the disk.

## Backing up the receipts

| Where they are | How |
|---|---|
| A directory (development: `./.data/uploads`) | `scripts/backup.sh --dev --uploads ./.data/uploads`, or simply copy the directory. |
| The Compose volume `uploads` | `docker run --rm -v symmetry-debt_uploads:/data:ro -v "$PWD/backups:/backup" alpine tar -czf "/backup/uploads-$(date +%F).tar.gz" -C /data .` |
| A Railway volume | `railway volume files download /uploads ./uploads-backup` (check the path first with `railway volume files list /`), or schedule volume backups in the volume's settings. |
| An S3 bucket | Your provider's tools (`aws s3 sync`, `rclone`…) or bucket versioning. |

File names in storage are random; the database knows which file belongs to which receipt. Always
back up the database and the receipts **from the same moment**.

## Restoring

[`scripts/restore.sh`](../../scripts/restore.sh) puts a backup **into** a database, replacing
what is there. It runs as one transaction: if anything fails, nothing changes.

```bash
docker compose stop app                              # nothing should be writing meanwhile

scripts/restore.sh backups/FILE.dump --compose       # into the standalone installation
scripts/restore.sh backups/FILE.dump --dev           # into the development database
scripts/restore.sh backups/FILE.dump --url "postgresql://…"

docker compose start app                             # applies newer migrations, if any
```

It shows where it is about to restore and asks you to type `restore` (use `--yes` in scripts).
With `--database NAME` (for `--dev`/`--compose`) it restores into another database, creating it
if needed.

Then the two things that are not in the database:

1. **`DATA_ENCRYPTION_KEY`** must be the value that was in use when the backup was made.
2. **Receipts**: put the files back where `STORAGE_LOCAL_DIR` (or the bucket) points.
   For the Compose volume:
   `docker run --rm -v symmetry-debt_uploads:/data -v "$PWD/backups:/backup:ro" alpine tar -xzf /backup/uploads-DATE.tar.gz -C /data`

The app fixes the ownership of restored files by itself the next time the container starts.

### Check your backups

A backup is only as good as its last successful restore. This restores into a scratch database
without touching the real one:

```bash
scripts/restore.sh backups/FILE.dump --dev --database restore_check --yes
```

The scripts were verified this way: a database with data was backed up and restored into an
empty one, and both were compared table by table (identical contents), together with their
constraints, indexes and triggers — which still reject what they should after the restore.

## Recovering on a new server

1. Install the app as usual ([SELF_HOSTING.md](SELF_HOSTING.md) or
   [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)), using the **same** `DATA_ENCRYPTION_KEY`.
2. Restore the database into it.
3. Copy the receipts.
4. If the address changed, update `APP_URL` and add the new redirect URI to the Google client.
5. Start the app and check `<APP_URL>/api/health`.

People sign in with Google as before: their accounts are in the database you restored.

## The encryption key

`DATA_ENCRYPTION_KEY` encrypts CLABEs and account numbers before they reach the database
(AES-256-GCM). It is not stored anywhere by the app.

- **If you lose it**, those values are unrecoverable. Everything else keeps working; people would
  have to enter their bank accounts again.
- **If it leaks**, rotate it.

### Rotating the key

1. Generate a new key: `openssl rand -base64 32`.
2. Set `DATA_ENCRYPTION_KEY_PREVIOUS` to the **old** value and `DATA_ENCRYPTION_KEY` to the
   **new** one. Restart the app.
3. From now on everything is written with the new key, and values written with the old one can
   still be read.
4. A stored value is re-encrypted with the new key when its bank account is saved again. There
   is no bulk re-encryption command yet, so keep `DATA_ENCRYPTION_KEY_PREVIOUS` configured until
   every account has been saved again (or re-entered).

Only one previous key is supported at a time.

## A migration failed

When the container starts it applies pending migrations and **does not start the server if they
fail**; the log shows the error from PostgreSQL. Nothing is served by the new version, so no
data is written against a half-migrated schema.

What to do:

1. Read the error (`docker compose logs app`, or `railway logs`).
2. The quick way back: return to the previous version of the app and, if the schema was
   changed, restore the backup you took before updating.
3. To inspect or repair by hand, run the Prisma CLI inside the image without starting the
   server:

   ```bash
   docker compose run --rm -e SKIP_MIGRATIONS=true app prisma migrate status
   docker compose run --rm -e SKIP_MIGRATIONS=true app prisma migrate resolve --rolled-back NAME
   ```

   and start the app again once the cause is fixed.

A database that is merely slow to come up is not a failure: the container retries for a while
before giving up (`MIGRATION_ATTEMPTS`, 10 by default).
