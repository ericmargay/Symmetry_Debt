# Data and privacy

*[Versión en español](../es/DATA_AND_PRIVACY.md)*

What an installation of Symmetry Debt stores, who can see it, how long it is kept and how it is
removed. This describes the software; whoever runs an installation is responsible for it and
for any legal obligations that apply where they are.

## Who can see what

| Data | Who can see it |
|---|---|
| A **personal record** (the debt, its payments, notes, receipts, history) | Only the person who created it. The other party named in it cannot — even if they have an account, and even if the name or email matches theirs. |
| A **shared agreement** (terms, versions, movements, shared notes, receipts, history) | Only its two participants. |
| A **proposal** that has not been answered | The proposer, and whoever opens its share link after signing in. They see the proposed terms, any receipts the proposer chose to attach to the proposal, and the proposer's name and address — nothing else of the proposer's. |
| **Contacts** | Only their owner. |
| **Bank accounts** | Only their owner. The other participant of an agreement sees the bank, the holder's name and the CLABE / account number **only** if the owner explicitly shared that account for that agreement, and only once the agreement has come into force — never for a mere proposal, and no longer after it is cancelled. Sharing can be withdrawn at any time. |
| Private notes on a shared agreement | Only the participant who wrote them. |
| Notifications | Only their recipient. |

Knowing somebody's email address never reveals whether they use the app, and never gives access
to anything of theirs.

## What is stored

**About each person**

- From Google, when they sign in: name, email address (verified by Google) and profile picture
  URL. Google's access and refresh tokens are **not** stored; the app cannot act on anybody's
  Google account.
- Preferences: language, time zone, default currency, which reminders and emails they want.
- Sessions: one row per signed-in browser, holding a **hash** of the session token and its
  expiry date.

**What they enter**

- Contacts: name and, optionally, email, phone and notes.
- Debts and agreements: concept, amounts, dates, schedule, planned payment method, notes.
- Movements: amount, date, method, reference, notes; for transfers, the origin bank, a masked
  description of the destination account and the tracking key; for cash, the place.
- Bank accounts: alias, bank, holder's name, CLABE and/or account number, currency.
- Receipts: the files they upload (PDF, JPG, PNG, WebP).

**What the app writes itself**

- The history (audit trail) of each debt and of account-level actions.
- Notifications.
- Invitations: a hash of the link's token, the address it was meant for (if given), its expiry.
- Rate-limit counters, keyed by account id — or by network address for the one limit that
  applies before signing in. They are deleted a day after their window ends.

**Never stored:** bank passwords, PINs, card numbers, CVVs or any banking credentials. The app
does not move money and has no place to put those.

## How it is protected

| | |
|---|---|
| Bank details | CLABE and account number are encrypted before they reach the database (AES-256-GCM, key in `DATA_ENCRYPTION_KEY`). Lists only show the last four digits. |
| Sessions | The cookie holds a random token; the database only a SHA-256 hash of it. A copy of the database is not a set of live sessions. |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, and scoped to the app's base path so they are not sent to other applications on the same domain. Sessions last 30 days and are renewed while in use. |
| Receipts | Kept in private storage under random names and served only through the app, after checking who is asking. Files are identified by their content, not their name. |
| Invitation links | Random 256-bit tokens, stored hashed, single-use, expiring (14 days by default), revocable. |
| Pages | A strict Content-Security-Policy with a per-request nonce; no third-party scripts, fonts or trackers. |
| Confirmed history | Cannot be edited or deleted — the database itself refuses. |

The app contains no analytics, no advertising and no third-party trackers, and sends no
telemetry anywhere.

## What leaves the installation

- **Google**: the sign-in itself.
- **Your email provider**, if you configured one: the notification or invitation being sent and
  the recipient's address. Invitation emails deliberately say nothing about the debt — no
  concept, no amounts.
- **Your S3 provider**, if you chose `STORAGE_DRIVER=s3`: the receipt files.
- **Donation platforms**: nothing. The links are plain links; the app sends them no data.

## Logs

The server is written not to log tokens, cookies or bank details. Sign-in problems are logged by
error name and message only; unexpected errors are logged with their technical message so they
can be diagnosed. Reverse proxies and hosting platforms keep their own access logs (addresses,
paths); invitation tokens appear in the path of invitation links, which is one reason they are
single-use and expire.

## Export

**Settings → Export my data** downloads one JSON file with everything the app holds about the
person: profile and preferences, contacts, bank accounts (decrypted, since they are theirs),
personal records with their movements and history, the shared agreements they take part in *as
they see them*, their notifications and their account history.

It never includes anything that is only the other person's: their private notes, their contacts
or their bank accounts.

## Deleting

- **A personal record** can be deleted at any time by its owner. The record, its movements, its
  history and its receipts are erased.
- **A contact** can be deleted while nothing refers to it, and archived otherwise.
- **A bank account** can be deleted at any time; whoever it was shared with loses access at
  once. Payments that mention it keep only the masked label they were recorded with.
- **A shared agreement** belongs to two people, so one of them cannot erase it. It can be
  cancelled (by either side before it is in force; by mutual agreement afterwards) and stays in
  both histories.

### Deleting the account

**Settings → Delete my account** asks the person to type their email address and then:

- erases what is only theirs: profile, sessions, preferences, contacts, bank accounts,
  notifications and every personal record with its receipts;
- ends the agreements that were still being negotiated;
- erases the agreements nobody else is part of;
- **keeps** the remaining shared agreements for the other participant, with the person's name
  as it appeared there but no longer linked to any account. The other person's own record of
  what was agreed and paid is theirs to keep.

It is **refused while an agreement is in force with a balance pending**: nobody can walk away
from an open agreement by deleting their account. Those have to be settled or cancelled first.

## Retention

- Data is kept until the person deletes it or deletes their account. Nothing expires on its
  own: a debt from years ago is still a record somebody may need.
- Expired sessions and old rate-limit counters are purged automatically.
- Backups are the operator's: decide how long you keep them, and remember that a restored
  backup brings back data that was deleted after it was taken.

## For whoever runs an installation

- Use HTTPS, keep `.env` and the backups private, and back up `DATA_ENCRYPTION_KEY` separately
  ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- Tell the people you invite who runs the installation. You — not the software's authors — are
  the one holding their data.
- Prefer the in-app account deletion. If you ever have to remove a person by hand, deleting
  their `User` row removes what is only theirs from the database and detaches them from the
  agreements that remain — but the files of their receipts stay in storage and have to be
  removed separately.
