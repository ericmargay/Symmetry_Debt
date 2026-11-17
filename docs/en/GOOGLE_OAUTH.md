# Sign-in with Google: setting up the OAuth client

*[Versión en español](../es/GOOGLE_OAUTH.md)*

Symmetry Debt signs people in with their Google account and nothing else. It asks Google for the
minimum — who the person is (`openid`, `email`, `profile`) — and never for access to Gmail,
Drive or anything else. Google's tokens are not stored.

You need one **OAuth client** from Google Cloud. It is free and takes about ten minutes. The
same client can serve your local installation and your public one.

> Google renames its console screens from time to time. The names below are the ones in use at
> the time of writing; if a label differs slightly, look for the same idea.

## 1. The address you will register

Google only sends people back to addresses you registered in advance. For Symmetry Debt that
address is always:

```
<APP_URL>/api/auth/callback/google
```

`APP_URL` is the public address of the app **including its base path**:

| Installation | `APP_URL` | Redirect URI to register |
|---|---|---|
| Local | `http://localhost:3000/debt` | `http://localhost:3000/debt/api/auth/callback/google` |
| Official test instance | `https://aminoacid.com.mx/debt` | `https://aminoacid.com.mx/debt/api/auth/callback/google` |
| Your own domain, at the root | `https://debt.example.org` | `https://debt.example.org/api/auth/callback/google` |

It has to match **exactly**: scheme, host, port, path, no trailing slash.

## 2. Create the client

1. Open <https://console.cloud.google.com/> and create a project (or pick one), e.g. "Symmetry Debt".
2. Go to **APIs & Services → OAuth consent screen** (shown as **Google Auth Platform** in newer
   consoles) and fill in the basics:
   - **App name**: what people will see when they sign in, e.g. "Symmetry Debt".
   - **User support email**: yours.
   - **Audience / User type**: **External** (any Google account), unless everybody who will use
     it belongs to your own Google Workspace.
   - **Contact information**: your email.
3. **Scopes / Data access**: you do not need to add anything. The app only uses `openid`,
   `email` and `profile`, which are not sensitive and need no review by Google.
4. Go to **Credentials → Create credentials → OAuth client ID** (or **Clients → Create client**):
   - **Application type**: **Web application**.
   - **Name**: anything, e.g. "Symmetry Debt web".
   - **Authorised JavaScript origins**: the origin of each installation, without any path:
     - `http://localhost:3000`
     - `https://aminoacid.com.mx`
   - **Authorised redirect URIs**: one per installation, from the table above:
     - `http://localhost:3000/debt/api/auth/callback/google`
     - `https://aminoacid.com.mx/debt/api/auth/callback/google`
5. Press **Create**. Google shows a **Client ID** and a **Client secret**.

## 3. Put the values in the app

In `.env` (locally) or in your host's variables (Railway, your server…):

```bash
AUTH_GOOGLE_ID=1234567890-abc…apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-…
```

Also make sure `APP_URL` is right and `AUTH_SECRET` is set (`./scripts/setup.sh` generates it).
Leave `AUTH_GOOGLE_ISSUER` **unset**: it only exists to replace Google with a mock on a
developer's machine.

Restart the app. No rebuild is needed for these values.

## 4. Who is allowed to sign in: "Testing" versus "In production"

A new consent screen starts in **Testing**. In that state only the Google accounts you add as
**test users** (up to 100) can sign in; everybody else is turned away by Google.

- To try the app yourself, or with a few people: add their addresses under **Audience → Test
  users**.
- To let anybody with the link sign in — for example the person you invite to confirm an
  agreement — press **Publish app** to move it to **In production**. Because the app only asks
  for the basic, non-sensitive scopes, this does not require Google's verification process.

## 5. Check it

Open the app, press **Sign in with Google** and complete the flow. If Google shows an error:

| Message | Cause |
|---|---|
| `redirect_uri_mismatch` | The redirect URI the app sent is not registered. Compare it character by character with section 1: the base path (`/debt`), `http` vs `https`, the port, a trailing slash. It is built from `APP_URL`. |
| `Access blocked: … has not completed the Google verification process` / `access_denied` | The consent screen is in *Testing* and this account is not a test user (section 4). |
| `invalid_client` | Wrong `AUTH_GOOGLE_ID` or `AUTH_GOOGLE_SECRET`, or stray spaces or quotes around them. |
| The app shows "could not sign in" after Google | Usually `APP_URL` does not match the address in the browser, or a reverse proxy is not passing the host and scheme (see [SELF_HOSTING.md](SELF_HOSTING.md)). |

You can see the exact redirect URI the app will use at
`<APP_URL>/api/auth/providers` (look at `callbackUrl`).

## Local development without Google

You do not need any of this to work on the code:

```bash
./scripts/setup.sh --mock-auth     # writes the three mock values into .env
npm run dev:auth-mock              # starts the mock issuer on http://localhost:4455
npm run dev
```

The mock issuer shows a small form instead of Google's account chooser and accepts whatever
email address you type. It exists for development and automated tests **only**: never point a
real installation at it.

Accounts created through the mock are marked as such (their identity starts with `mock-`). If
you later move that database to an installation with real Google sign-in, the first time the
real owner of each address signs in, the account becomes theirs and the mock identity is
dropped — see [LOCAL_TO_CLOUD.md](LOCAL_TO_CLOUD.md).
