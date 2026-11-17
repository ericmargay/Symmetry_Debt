#!/bin/sh
# Container entry point.
#
#   1. (as root) make sure the receipts directory exists and belongs to the app user,
#      then drop privileges;
#   2. apply pending database migrations — unless SKIP_MIGRATIONS=true;
#   3. start the server (the image's CMD).
#
# If the migrations fail the server is NOT started: running new code against an old schema is
# worse than not running at all.
#
# Variables understood here (besides the app's own, see .env.example):
#   SKIP_MIGRATIONS=true    do not touch the database schema (you run migrations yourself)
#   MIGRATION_ATTEMPTS=10   how many times to retry while the database is still unreachable
set -eu

log() { printf '[entrypoint] %s\n' "$*"; }
fail() {
  printf '[entrypoint] ERROR: %s\n' "$*" >&2
  exit 1
}

APP_USER="${APP_USER:-node}"

# ── 1. Receipts directory and privileges ──────────────────────────────────────────────────────
if [ "$(id -u)" = "0" ]; then
  if [ "${STORAGE_DRIVER:-local}" = "local" ]; then
    storage_dir="${STORAGE_LOCAL_DIR:-/data/uploads}"
    case "$storage_dir" in
      /*) ;;
      *) log "WARNING: STORAGE_LOCAL_DIR=$storage_dir is a relative path inside the container; receipts will be LOST when it is recreated. Use an absolute path on a volume (e.g. /data/uploads)." ;;
    esac
    mkdir -p "$storage_dir"
    # Volumes are usually mounted root-owned (and files copied into them by hand often are too).
    # Only what does not already belong to the app user is touched.
    find "$storage_dir" ! -user "$APP_USER" -exec chown "$APP_USER:$APP_USER" {} +
  fi

  HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
  export HOME
  exec su-exec "$APP_USER" "$0" "$@"
fi

# ── 2. Database migrations ────────────────────────────────────────────────────────────────────
if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  log "SKIP_MIGRATIONS=true: leaving the database schema as it is"
else
  [ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set. The app cannot start without a database."

  max_attempts="${MIGRATION_ATTEMPTS:-10}"
  attempt=1
  log "applying database migrations"
  while :; do
    if output="$(prisma migrate deploy 2>&1)"; then
      printf '%s\n' "$output"
      break
    fi
    printf '%s\n' "$output" >&2

    # Only "the database is not answering yet" is worth retrying. Anything else (a migration
    # that failed, wrong credentials, a schema that was changed by hand) needs a person.
    if [ "$attempt" -ge "$max_attempts" ] ||
      ! printf '%s' "$output" | grep -Eq 'P1001|P1002|P1017|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT'; then
      fail "database migrations failed, so the server was not started. Fix the problem shown above and start the container again (docs: BACKUP_AND_RECOVERY, section about failed migrations)."
    fi

    log "database not reachable yet (attempt $attempt of $max_attempts); retrying in 3 seconds"
    attempt=$((attempt + 1))
    sleep 3
  done
fi

# ── 3. Server ─────────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC3028  # HOSTNAME here is the variable the image sets for Next.js, not bash's
log "starting: $* (listening on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}, base path '${SD_BASE_PATH:-}')"
exec "$@"
