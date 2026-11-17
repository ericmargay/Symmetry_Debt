#!/usr/bin/env bash
# Sets the Google OAuth client (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET) without pasting the secret
# anywhere else: it is read from the terminal with echo off.
#
#   scripts/google-oauth.sh                           # local .env (turns off the mock issuer)
#   scripts/google-oauth.sh --railway symmetry-debt   # also that Railway service (railway CLI,
#                                                     # project linked to this folder)
#
# The client is created in Google Cloud → APIs & Services → Credentials → OAuth client ID →
# "Web application". Authorised redirect URIs, one per place the app runs:
#   http://localhost:3000/debt/api/auth/callback/google
#   https://<your domain>/debt/api/auth/callback/google
# Step by step: docs/en/GOOGLE_OAUTH.md · docs/es/GOOGLE_OAUTH.md
set -euo pipefail

cd "$(dirname "$0")/.."
railway_service=""
while [ $# -gt 0 ]; do
  case "$1" in
    --railway) railway_service="${2:?--railway needs the service name}"; shift 2 ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

read -r -p "Client ID: " client_id
read -r -s -p "Client secret (hidden): " client_secret
echo
case "$client_id" in
  *.apps.googleusercontent.com) ;;
  *) echo "That does not look like a Google client ID (…apps.googleusercontent.com)." >&2; exit 1 ;;
esac
[ -n "$client_secret" ] || { echo "The client secret is empty." >&2; exit 1; }

# Local .env: replace or add both values and comment out the mock issuer.
if [ -f .env ]; then
  tmp="$(mktemp)"
  awk -v id="$client_id" -v secret="$client_secret" '
    /^AUTH_GOOGLE_ID=/ { print "AUTH_GOOGLE_ID=\"" id "\""; seen_id = 1; next }
    /^AUTH_GOOGLE_SECRET=/ { print "AUTH_GOOGLE_SECRET=\"" secret "\""; seen_secret = 1; next }
    /^AUTH_GOOGLE_ISSUER=/ { print "# " $0 "   # mock issuer, off: real Google is configured"; next }
    { print }
    END {
      if (!seen_id) print "AUTH_GOOGLE_ID=\"" id "\""
      if (!seen_secret) print "AUTH_GOOGLE_SECRET=\"" secret "\""
    }' .env > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env
  echo "✓ .env updated. Restart \`npm run dev\` to use real Google sign-in."
else
  echo "No .env here (run scripts/setup.sh first if you want it locally); skipping."
fi

if [ -n "$railway_service" ]; then
  command -v railway > /dev/null || { echo "The railway CLI is not installed." >&2; exit 1; }
  railway variables --service "$railway_service" --set "AUTH_GOOGLE_ID=$client_id" --set "AUTH_GOOGLE_SECRET=$client_secret" > /dev/null
  echo "✓ Railway service \"$railway_service\" updated; it redeploys by itself in a minute or two."
fi
