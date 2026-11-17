#!/usr/bin/env bash
# First-time setup: creates .env from .env.example and generates the secrets that are still
# empty. Safe to run again at any time — a value that is already set is NEVER overwritten.
#
#   ./scripts/setup.sh               # .env with fresh secrets
#   ./scripts/setup.sh --mock-auth   # also configure the local mock sign-in (development only)
#
#   ENV_FILE=path/to/file ./scripts/setup.sh    # work on another file instead of .env
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
EXAMPLE_FILE=".env.example"
MOCK_AUTH=false

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --mock-auth) MOCK_AUTH=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# ── random values ─────────────────────────────────────────────────────────────────────────────

random_bytes_base64() {
  # 32 random bytes in base64: what AUTH_SECRET and DATA_ENCRYPTION_KEY expect.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n'
  elif command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))'
  else
    head -c 32 /dev/urandom | base64 | tr -d '\n'
  fi
}

random_hex() {
  # Letters and digits only: safe inside a database URL.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1" | tr -d '\n'
  elif command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(require("crypto").randomBytes(Number(process.argv[1])).toString("hex"))' "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# ── reading and writing single values ─────────────────────────────────────────────────────────

# Current value of KEY (last uncommented assignment), without surrounding quotes. Empty if unset.
get_value() {
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

# Sets KEY=VALUE: replaces the existing line or appends a new one. Everything else is untouched.
set_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    KEY="$key" VALUE="$value" awk '
      BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"] }
      index($0, key "=") == 1 && !done { print key "=" value; done = 1; next }
      { print }
    ' "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

# Generates a value for KEY only when it has none.
fill() {
  local key="$1" value="$2"
  if [ -n "$(get_value "$key")" ]; then
    printf '  %-22s kept (already set)\n' "$key"
  else
    set_value "$key" "$value"
    printf '  %-22s generated\n' "$key"
  fi
}

# ── 1. the file ───────────────────────────────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  [ -f "$EXAMPLE_FILE" ] || {
    echo "Cannot find $EXAMPLE_FILE (run this script from a checkout of the repository)." >&2
    exit 1
  }
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE from $EXAMPLE_FILE"
else
  echo "Using the existing $ENV_FILE"
fi
# Secrets inside: readable by you only.
chmod 600 "$ENV_FILE"

# ── 2. secrets ────────────────────────────────────────────────────────────────────────────────

echo "Secrets:"
fill AUTH_SECRET "$(random_bytes_base64)"
fill DATA_ENCRYPTION_KEY "$(random_bytes_base64)"
fill CRON_SECRET "$(random_hex 24)"
fill POSTGRES_PASSWORD "$(random_hex 24)"

# ── 3. sign-in ────────────────────────────────────────────────────────────────────────────────

if [ "$MOCK_AUTH" = true ]; then
  if [ -z "$(get_value AUTH_GOOGLE_ID)" ] && [ -z "$(get_value AUTH_GOOGLE_SECRET)" ]; then
    set_value AUTH_GOOGLE_ID "symmetry-debt-local"
    set_value AUTH_GOOGLE_SECRET "symmetry-debt-local-secret"
    set_value AUTH_GOOGLE_ISSUER "http://localhost:4455"
    echo "Sign-in: configured the LOCAL MOCK issuer (development only — it accepts any email address)."
  else
    echo "Sign-in: Google credentials are already set; --mock-auth changed nothing."
  fi
fi

google_id="$(get_value AUTH_GOOGLE_ID)"
issuer="$(get_value AUTH_GOOGLE_ISSUER)"
app_url="$(get_value APP_URL)"

echo
echo "Done. Next steps:"
if [ -z "$google_id" ]; then
  cat <<EOF
  1. Sign-in. Either
       - create a Google OAuth client and put its id and secret in $ENV_FILE
         (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET) — docs/en/GOOGLE_OAUTH.md, docs/es/GOOGLE_OAUTH.md
         Redirect URI to register: ${app_url:-<APP_URL>}/api/auth/callback/google
       - or, for local development only:  ./scripts/setup.sh --mock-auth
EOF
elif [ -n "$issuer" ]; then
  cat <<EOF
  1. Sign-in uses the local mock issuer ($issuer). Start it next to the app:
       npm run dev:auth-mock
EOF
else
  cat <<EOF
  1. Sign-in: Google credentials found. Make sure this redirect URI is registered in Google:
       ${app_url:-<APP_URL>}/api/auth/callback/google
EOF
fi
cat <<EOF
  2. Start it.
       Development:   docker compose -f docker-compose.dev.yml up -d
                      npm install && npm run db:deploy && npm run dev
       Standalone:    docker compose up -d --build
     Then open ${app_url:-http://localhost:3000/debt}

Keep a copy of DATA_ENCRYPTION_KEY somewhere safe: without it, saved bank details cannot be read.
EOF
