#!/usr/bin/env bash
# Restores a backup made with scripts/backup.sh INTO a database, replacing what is there.
#
#   scripts/restore.sh FILE.dump --dev                    the development database
#   scripts/restore.sh FILE.dump --compose                the standalone installation
#   scripts/restore.sh FILE.dump --url "postgresql://…"   any PostgreSQL (e.g. Railway)
#
# Options
#   --database NAME   target database for --dev / --compose (default: the app's database).
#                     It is created when it does not exist.
#   --yes             do not ask for confirmation
#   -h, --help
#
# Environment
#   PG_IMAGE          image with the PostgreSQL client tools used for --url
#                     (default: postgres:<major version of the target server>-alpine)
#   PG_USE_LOCAL=1    use the pg_restore installed on this machine for --url instead of Docker
#
# What it does: one transaction that drops the tables, types, functions and triggers contained
# in the backup and recreates them with the backup's data. If anything fails, nothing changes.
# Stop the app first so nothing is writing meanwhile (docker compose stop app).
#
# After restoring on ANOTHER server remember the two things that are not in the database:
#   - DATA_ENCRYPTION_KEY must be the same as where the backup was made;
#   - the receipts (STORAGE_LOCAL_DIR or the S3 bucket) have to be copied separately.
set -euo pipefail

cd "$(dirname "$0")/.."

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }
die() {
  echo "restore: $*" >&2
  exit 1
}

FILE=""
TARGET=""
URL=""
DATABASE=""
ASSUME_YES=false

while [ $# -gt 0 ]; do
  case "$1" in
    --dev | --compose)
      [ -z "$TARGET" ] || die "choose only one of --dev, --compose, --url"
      TARGET="${1#--}"
      ;;
    --url)
      [ -z "$TARGET" ] || die "choose only one of --dev, --compose, --url"
      [ $# -ge 2 ] || die "--url needs a value"
      TARGET="url"
      URL="$2"
      shift
      ;;
    --database)
      [ $# -ge 2 ] || die "--database needs a value"
      DATABASE="$2"
      shift
      ;;
    --yes | -y) ASSUME_YES=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *)
      [ -z "$FILE" ] || die "only one backup file can be restored at a time"
      FILE="$1"
      ;;
  esac
  shift
done

[ -n "$FILE" ] && [ -n "$TARGET" ] || {
  usage >&2
  exit 2
}
[ -f "$FILE" ] || die "backup file not found: $FILE"
[ "$(head -c 5 "$FILE")" = "PGDMP" ] || die "$FILE is not a pg_dump custom-format archive"
if [ -n "$DATABASE" ]; then
  [ "$TARGET" != "url" ] || die "--database only applies to --dev and --compose (put the database in the URL)"
  case "$DATABASE" in *[!A-Za-z0-9_]*) die "invalid database name: $DATABASE" ;; esac
fi
command -v docker >/dev/null 2>&1 || [ "${PG_USE_LOCAL:-}" = "1" ] || die "Docker is required (or set PG_USE_LOCAL=1 with pg_restore installed)."

RESTORE_FLAGS="--clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error"

docker_url() {
  printf '%s' "$1" | sed -E 's#@(localhost|127\.0\.0\.1)([:/])#@host.docker.internal\2#'
}

# Shown to the person before anything happens — without the password.
describe_url() {
  printf '%s' "$1" | sed -E 's#(://[^:/@]+):[^@]*@#\1:••••@#'
}

client() {
  docker run --rm -i --add-host=host.docker.internal:host-gateway -e "DB_URL=$(docker_url "$URL")" -e "RESTORE_FLAGS=$RESTORE_FLAGS" "$PG_CLIENT_IMAGE" "$@"
}

case "$TARGET" in
  dev)
    COMPOSE=(docker compose -f docker-compose.dev.yml)
    "${COMPOSE[@]}" ps --status running --quiet db | grep -q . || die "the development database is not running (docker compose -f docker-compose.dev.yml up -d)"
    description="the DEVELOPMENT database${DATABASE:+ \"$DATABASE\"} (docker-compose.dev.yml)"
    ;;
  compose)
    COMPOSE=(docker compose)
    "${COMPOSE[@]}" ps --status running --quiet db | grep -q . || die "the database of the standalone installation is not running (docker compose up -d db)"
    description="the STANDALONE installation's database${DATABASE:+ \"$DATABASE\"} (docker-compose.yml)"
    ;;
  url)
    case "$URL" in postgres://* | postgresql://*) ;; *) die "--url must start with postgresql://" ;; esac
    description="$(describe_url "$URL")"
    ;;
esac

echo "About to restore"
echo "    $FILE"
echo "into"
echo "    $description"
echo "Everything the backup contains will REPLACE what is in that database now."

if [ "$ASSUME_YES" != true ]; then
  [ -t 0 ] || die "refusing to continue without confirmation (use --yes in scripts)"
  printf 'Type "restore" to continue: '
  read -r answer
  [ "$answer" = "restore" ] || die "cancelled; nothing was changed"
fi

case "$TARGET" in
  dev | compose)
    # shellcheck disable=SC2016  # expanded inside the container, on purpose
    "${COMPOSE[@]}" exec -T -e "TARGET_DB=$DATABASE" db sh -c '
      db="${TARGET_DB:-$POSTGRES_DB}"
      if [ "$(psql --username="$POSTGRES_USER" --dbname=postgres --no-psqlrc -Atc "select 1 from pg_database where datname = '"'"'$db'"'"'")" != "1" ]; then
        createdb --username="$POSTGRES_USER" "$db" && echo "Created database $db"
      fi'
    echo "Restoring…"
    # shellcheck disable=SC2016
    "${COMPOSE[@]}" exec -T -e "TARGET_DB=$DATABASE" -e "RESTORE_FLAGS=$RESTORE_FLAGS" db sh -c \
      'pg_restore $RESTORE_FLAGS --username="$POSTGRES_USER" --dbname="${TARGET_DB:-$POSTGRES_DB}"' <"$FILE"
    # shellcheck disable=SC2016
    summary="$("${COMPOSE[@]}" exec -T -e "TARGET_DB=$DATABASE" db sh -c \
      'psql --username="$POSTGRES_USER" --dbname="${TARGET_DB:-$POSTGRES_DB}" --no-psqlrc -Atc "select (select count(*) from \"User\") || '"'"' users, '"'"' || (select count(*) from \"Debt\") || '"'"' debts, '"'"' || (select count(*) from \"Payment\") || '"'"' movements'"'"'"' 2>/dev/null || true)"
    ;;
  url)
    if [ "${PG_USE_LOCAL:-}" = "1" ]; then
      command -v pg_restore >/dev/null 2>&1 || die "PG_USE_LOCAL=1 but pg_restore is not installed"
      echo "Restoring with the local pg_restore…"
      # shellcheck disable=SC2086  # the flags are meant to be split
      pg_restore $RESTORE_FLAGS --dbname="$URL" <"$FILE"
      summary=""
    else
      PG_CLIENT_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
      # shellcheck disable=SC2016
      version_num="$(client sh -c 'psql "$DB_URL" --no-psqlrc -Atc "show server_version_num"' </dev/null)" || die "could not connect to the database"
      major="$((version_num / 10000))"
      PG_CLIENT_IMAGE="${PG_IMAGE:-postgres:${major}-alpine}"
      echo "Restoring into a PostgreSQL ${major} server with ${PG_CLIENT_IMAGE}…"
      # shellcheck disable=SC2016
      client sh -c 'pg_restore $RESTORE_FLAGS --dbname="$DB_URL"' <"$FILE"
      # shellcheck disable=SC2016
      summary="$(client sh -c 'psql "$DB_URL" --no-psqlrc -Atc "select (select count(*) from \"User\") || '"'"' users, '"'"' || (select count(*) from \"Debt\") || '"'"' debts, '"'"' || (select count(*) from \"Payment\") || '"'"' movements'"'"'"' </dev/null 2>/dev/null || true)"
    fi
    ;;
esac

echo "✓ Restored${summary:+: $summary}"
cat <<'EOF'

Not part of the database — check them now:
  - DATA_ENCRYPTION_KEY: the same value as where the backup was made, or bank details stay unreadable.
  - Receipts: copy the files (STORAGE_LOCAL_DIR or the S3 bucket) separately.
Then start the app again; it applies any newer migrations on its own.
EOF
