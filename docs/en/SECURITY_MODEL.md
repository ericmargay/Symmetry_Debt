# Security model

*[Versión en español](../es/SECURITY_MODEL.md)*

A summary of what Symmetry Debt protects, against what, and how. To report a problem, see
[SECURITY.md](../../SECURITY.md). For what is stored and for how long, see
[DATA_AND_PRIVACY.md](DATA_AND_PRIVACY.md).

## What is being protected

1. **Privacy** — a person's personal records, contacts, bank accounts and receipts are theirs
   alone; a shared agreement is visible to its two participants and nobody else.
2. **The meaning of "confirmed"** — nothing counts as agreed by both sides unless both sides
   agreed to exactly that.
3. **History** — what was confirmed cannot be quietly changed afterwards.
4. **Exactness** — amounts are never approximated.

## Who the app defends against

| Somebody who… | …must not be able to |
|---|---|
| is not signed in | see anything but the public landing page |
| is signed in but is not part of a debt | see it, change it, or learn that it exists |
| knows another person's email address | learn whether they have an account, read anything of theirs, or take over a private record that mentions them |
| holds a share link they should not have | do more than read that one proposal; they cannot bring it into force without the proposer recognising them |
| is one of the two participants | confirm their own movements, accept their own proposal, edit confirmed history, or see the other's private notes, contacts or unshared bank accounts |
| obtains a copy of the database | use it to sign in as somebody (sessions are hashed), or read bank details (encrypted) |
| sends the same request twice, or two at once | create duplicates, or confirm more than what is owed |

Out of reach of the software: whoever operates the server can read the database. Run your own
installation if that matters to you.

## Controls

### Identity

- Google sign-in only (OpenID Connect with PKCE, state and nonce). Only addresses **verified by
  Google** are accepted.
- Users are identified by an internal id. An email address is never treated as proof of
  anything.
- Sessions live in the database; the cookie's token is stored **hashed**. Signing out, or
  "sign out everywhere", ends them server-side. Cookies are `HttpOnly`, `SameSite=Lax`,
  `Secure` over HTTPS and scoped to the app's base path.
- Google's tokens are not stored.
- The OAuth callback never attaches a new Google identity to a session that is already open in
  the browser, so two people sharing a computer cannot end up merged into one account.
- A different Google account with the same address as an existing account is refused. The only
  rows that a verified sign-in may adopt are those nobody ever proved they own: created by an
  import script, or holding only identities from the local mock issuer.

### Authorisation

- Enforced on the server, inside the services that touch the data — never only in the
  interface. Every service receives the acting person explicitly.
- One rule for debts: a personal record → its owner; a shared agreement → its two participants.
  Anything else is answered with "not found".
- Lists, totals, activity and exports are built per viewer from what they may see.
- Entries of an agreement's history that concern only one side (who a link was meant for, who
  was turned away) are shown to that side only.

### The bilateral rule

- Proposing terms records the proposer's acceptance; only the **other** side can accept. Each
  answer carries the hash of the terms that were on screen, and is refused if they changed.
- Whoever records a movement cannot confirm it. Only confirmed movements change the confirmed
  balance.
- An agreement comes into force only when both accepted the same version **and** the proposer
  knows who joined: automatically if the invitation named the joiner's verified address,
  otherwise after the proposer confirms.
- A receipt never confirms anything.

### Integrity

- Balances are computed from movements, never stored.
- Every change to a debt runs in a transaction that first locks the debt's row; creating
  things takes an idempotency key.
- Confirmed movements, accepted terms, approvals and the audit trail are immutable **at the
  database level** (triggers `SD001`–`SD009`), on top of `CHECK` constraints that keep the two
  modes apart. See [ARCHITECTURE.md](ARCHITECTURE.md#10-what-the-database-itself-refuses).

### Bank details

- Encrypted with AES-256-GCM before they reach the database; a tampered value fails to decrypt.
- Shown to somebody else only by the owner's explicit, per-agreement, revocable choice.
- Payments keep a masked label ("BBVA •••• 1234"), not the number.
- No field exists for passwords, PINs or card data.

### Files

- Only PDF, JPG, PNG and WebP, recognised by their first bytes; size-limited.
- Stored under random names in private storage; served only through an authorised route, with
  `nosniff` and no caching by intermediaries.

### The web surface

- **Content-Security-Policy** with a per-request nonce: scripts run only from the app's own
  origin and only with that nonce; no framing; forms may only post to the app or to the
  identity provider.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, a
  restrictive `Permissions-Policy`.
- State-changing requests are server actions, which Next.js only accepts from the app's own
  origin; the upload endpoint checks the origin itself.
- Redirects after sign-in only go to paths inside the app.
- No third-party scripts, fonts, analytics or trackers.

### Abuse

- Rate limits stored in PostgreSQL (so they hold across instances): changes per account,
  invitations, opening invitation links, uploads, exports, and sign-in attempts per address.
- Invitation links: 256-bit random tokens, stored hashed, single-use, expiring, revocable.
- Invitation emails carry no details of the debt.

### Secrets and configuration

- Everything secret comes from the environment; nothing is in the repository. `.env` is
  git-ignored and excluded from Docker images.
- The configuration is validated at start-up and problems are reported by name.
- The mock sign-in issuer exists for development; the server warns loudly if it is configured
  in production.

## What you must do as an operator

- Serve the app over **HTTPS**, behind a reverse proxy that passes the public host and scheme
  ([SELF_HOSTING.md](SELF_HOSTING.md)).
- Keep `.env`, the database and the backups private. Back up `DATA_ENCRYPTION_KEY` separately.
- Never set `AUTH_GOOGLE_ISSUER` outside development.
- If receipts are in a bucket, keep the bucket private.
- Keep the app and its base image up to date.

## Known limits

- The operator of an installation can read its data (bank details excepted, as long as the key
  is kept apart from the database).
- Behind a proxy that hides the visitor's address, the per-address sign-in limit is shared by
  everybody ([DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md#the-visitors-address-and-rate-limiting)).
- There is no second factor beyond what the person's Google account has.
- Rotating the encryption key re-encrypts values lazily, when a bank account is saved again.
