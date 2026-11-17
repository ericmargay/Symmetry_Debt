# Deploying on Railway, under `aminoacid.com.mx/debt`

*[Versión en español](../es/DEPLOY_RAILWAY.md)*

This is how the official test instance, <https://aminoacid.com.mx/debt>, is put together. It
plugs Symmetry Debt into a site that already exists **without changing how that site works**.

> **Validate locally first.** The recommended path is to run the app on your own machine — even
> with real data — until you are happy with it, and only then deploy. Moving the data you
> entered locally is covered in [LOCAL_TO_CLOUD.md](LOCAL_TO_CLOUD.md).

Deploying somewhere else? [SELF_HOSTING.md](SELF_HOSTING.md) covers any server and any domain.

## The picture

```
visitor ──► Cloudflare ──► Railway edge (TLS) ──► service "sitio" (Caddy, static site)
                                                     │
                                                     │  /debt and /debt/*   (private network)
                                                     ▼
                                              service "symmetry-debt"  :3000
                                                     │
                                         ┌───────────┴───────────┐
                                         ▼                       ▼
                                 PostgreSQL service        volume /data
                                                          (receipts)
```

- The domain keeps pointing at the existing `sitio` service. Its Caddyfile gains **one block**
  that forwards `/debt` to the new service over Railway's private network — exactly like the
  block that already forwards `/artech_designer`.
- `symmetry-debt` needs **no public domain** of its own.
- Everything else on the site is untouched. If the block is removed, the site is as it was.

## 0. Before you start

- [ ] The app works locally (`docker compose up -d --build`, or `npm run dev`).
- [ ] Your Google OAuth client lists the production redirect URI:
      `https://aminoacid.com.mx/debt/api/auth/callback/google` ([GOOGLE_OAUTH.md](GOOGLE_OAUTH.md)).
- [ ] You have the secrets at hand. If you are going to bring your local data along, they must
      be the **same** `DATA_ENCRYPTION_KEY` you used locally.
- [ ] The Railway CLI is installed and signed in (`railway whoami`).

## 1. Create the services

From the folder of this repository:

```bash
railway link -p aminoacid-studio          # the project that already hosts the site

railway add --database postgres           # a PostgreSQL service (named "Postgres")

railway add --service symmetry-debt \
  --variables "PORT=3000" \
  --variables "HOSTNAME=::" \
  --variables "NEXT_PUBLIC_BASE_PATH=/debt" \
  --variables "APP_URL=https://aminoacid.com.mx/debt"

railway service link symmetry-debt        # this folder now deploys to that service
railway volume add --mount-path /data     # where receipts are kept
```

Why those four variables:

| Variable | Why |
|---|---|
| `PORT=3000` | Fixed, so the site's Caddy knows which port to forward to. |
| `HOSTNAME=::` | Makes the server listen on IPv6 as well as IPv4. Railway's private network needs it. |
| `NEXT_PUBLIC_BASE_PATH=/debt` | Read when the image is **built** (Railway passes service variables to the Docker build). |
| `APP_URL=https://aminoacid.com.mx/debt` | The public address. Links, emails, cookies and the Google redirect are derived from it. |

## 2. Set the rest of the configuration

Secrets are better typed through standard input than left in the shell history:

```bash
# The database: a reference to the PostgreSQL service, resolved by Railway.
# (Single quotes, so your shell does not try to expand ${{…}}. Check the service's name with
#  `railway service list` if you called it something else.)
railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --skip-deploys

openssl rand -base64 32 | railway variable set AUTH_SECRET --stdin --skip-deploys
railway variable set AUTH_GOOGLE_ID=…apps.googleusercontent.com --skip-deploys
printf '%s' 'GOCSPX-…' | railway variable set AUTH_GOOGLE_SECRET --stdin --skip-deploys

# NEW installation: generate it and store a copy somewhere safe.
openssl rand -base64 32 | railway variable set DATA_ENCRYPTION_KEY --stdin --skip-deploys
# MOVING local data: use the value from your local .env instead (see LOCAL_TO_CLOUD.md).
```

`--skip-deploys` avoids one redeploy per variable; the deploy in step 3 picks everything up.

Optional, with their defaults, are listed in [`.env.example`](../../.env.example). The ones that
matter most on Railway:

| Variable | When |
|---|---|
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | To send invitation and notification emails. Railway blocks outbound SMTP on plans below Pro, so prefer Resend's HTTP API over `smtp`. Without email the app works fully: links are shared by hand. |
| `STORAGE_DRIVER=s3` + `S3_*` | To keep receipts in a bucket instead of the volume. |
| `CRON_SECRET` | Only if you want an external scheduler to trigger reminders. Not needed: the server runs them itself every hour. |
| `DEFAULT_TIME_ZONE`, `DEFAULT_CURRENCY` | What new accounts start with (`America/Mexico_City`, `MXN`). |

`STORAGE_LOCAL_DIR` is already `/data/uploads` inside the image, which is on the volume you
mounted at `/data`. Leave it.

## 3. Deploy

```bash
railway up --detach        # builds the Dockerfile and deploys it (a few minutes)
railway logs               # follow the start-up
```

A healthy start looks like this:

```
[entrypoint] applying database migrations
…
All migrations have been successfully applied.        (or: No pending migrations to apply.)
[entrypoint] starting: node server.js (listening on :::3000, base path '/debt')
```

What happens on every start:

1. the receipts directory on the volume is handed to the unprivileged user the server runs as
   (Railway mounts volumes owned by root);
2. pending database **migrations are applied**; if they fail, the server is **not** started and
   the previous deployment keeps serving;
3. the server starts.

Railway waits for `GET /debt/api/health` to answer `200` before switching traffic
(`healthcheckPath` in [`railway.json`](../../railway.json)). That endpoint checks the database
too.

> Building for another base path? Change `NEXT_PUBLIC_BASE_PATH`, `APP_URL` **and**
> `healthcheckPath` in `railway.json` together.

## 4. Connect the path to the site

In the **`aminoacid-studio`** repository, add the block from
[`deploy/caddy/debt.caddy`](../../deploy/caddy/debt.caddy) to the `Caddyfile`, inside the site
block, next to the existing `handle /artech_designer*`:

```caddy
	@debt path /debt /debt/*
	handle @debt {
		reverse_proxy symmetry-debt.railway.internal:3000 {
			header_up X-Forwarded-Proto https
		}
	}
```

Then deploy the site as usual, from its own folder:

```bash
railway up --detach
```

That is the only change to the existing infrastructure. Notes:

- The matcher is exact: `/debt` and everything below `/debt/`. `/debtors` still goes to the
  site.
- The path is **not** stripped; the app expects to see `/debt`.
- Caddy keeps the visitor's `Host` and adds `X-Forwarded-Host` by itself. `X-Forwarded-Proto
  https` is set by hand because Railway terminates TLS before Caddy.
- The site's own security headers (`X-Frame-Options`, `Referrer-Policy`…) also apply to `/debt`
  and are compatible with the app's. The app adds its own Content-Security-Policy.

This exact block was validated inside a copy of the production Caddyfile with Caddy 2.10: the
app answers under `/debt`, every other path still reaches the static site.

## 5. Check

```bash
curl -s https://aminoacid.com.mx/debt/api/health            # {"status":"ok"}
curl -s https://aminoacid.com.mx/debt/api/auth/providers     # callbackUrl must be …/debt/api/auth/callback/google
curl -sI https://aminoacid.com.mx/ | head -1                 # the site itself: unchanged
```

Then open <https://aminoacid.com.mx/debt> and sign in.

## Things worth knowing

### Cloudflare

The domain is proxied by Cloudflare. Two things to check in its dashboard:

- Features that **inject scripts into pages** — Rocket Loader, Email Address Obfuscation,
  automatic Web Analytics — are blocked by the app's Content-Security-Policy and can break
  pages. Turn them off for `/debt/*` (a Configuration Rule does it).
- Do not add a rule that caches HTML under `/debt`. Static assets under `/debt/_next/static/`
  are safe to cache for a long time; they are fingerprinted.

### The visitor's address and rate limiting

Caddy does not trust the proxies in front of it unless told to, so with the stock Caddyfile it
replaces `X-Forwarded-For` with the address of Railway's edge. The app then sees that address
for every visitor.

Almost every limit in the app is per **account**, so this does not matter for them. The one
limit that is per address — starting a sign-in — is therefore shared by all visitors. To pass
the real address through, configure `trusted_proxies` in the site's Caddyfile (a global
`servers { trusted_proxies static … }` block listing Railway's and Cloudflare's ranges) and set
`TRUSTED_PROXY_HOPS` on the app to the number of proxies that append to the header. Verify what
actually arrives before relying on it.

### Reminders

Nothing to set up. The server checks due dates by itself every hour, and the job never repeats a
reminder. A Railway cron service calling `POST /debt/api/cron/reminders` with
`Authorization: Bearer $CRON_SECRET` is optional and harmless next to the built-in timer.

### Receipts: volume or bucket

- **Volume** (the steps above): simplest. Volume backups are not on by default: schedule them
  in the volume's settings, or include the files in your own backups
  ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- **Bucket**: set `STORAGE_DRIVER=s3` and the `S3_*` variables. The bucket must be **private**;
  the app is the only thing that reads it. Needed if you ever run more than one instance.

### A public Railway domain

The service does not need one. If you create one to debug (`railway domain`), remember that
sign-in, cookies and links are tied to `APP_URL`: the app only works properly through
`https://aminoacid.com.mx/debt`.

### If the site ever stops being Caddy

Any reverse proxy in front of the domain can do the same job: forward `/debt` and `/debt/*`
without stripping the path, keep the `Host`, and send `X-Forwarded-Proto https`. For example a
Cloudflare Worker routed on `aminoacid.com.mx/debt*` that forwards to the service's public
domain.

## Updating

```bash
git pull
railway up --detach
```

New migrations are applied on start. Take a database backup before an update that includes
migrations:

```bash
scripts/backup.sh --url "<public URL of the PostgreSQL service>"
```

## Rolling back

- **The app**: in the Railway dashboard, open the `symmetry-debt` service → *Deployments* →
  pick the previous one → *Rollback*. Migrations are not undone by a rollback: if the newer
  version changed the schema, restore the backup you took before updating
  ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- **The path**: remove the `@debt` block from the site's Caddyfile and deploy the site again.
  `aminoacid.com.mx/debt` simply shows the site's page; nothing else changes.
- **Everything**: delete the `symmetry-debt` and PostgreSQL services and the volume from the
  project. The site is unaffected.
