#!/usr/bin/env bash
# Backs up a Symmetry Debt database into one file (pg_dump, custom format).
#
#   scripts/backup.sh --dev                    the development database (docker-compose.dev.yml)
#   scripts/backup.sh --compose                the standalone installation (docker-compose.yml)
#   scripts/backup.sh --url "postgresql://…"   any PostgreSQL this machine can reach (e.g. Railway)
#
# Options
#   --database NAME     database to dump with --dev / --compose (default: the app's database)
#   --output FILE       where to write (default: backups/symmetry-debt-<source>-<date>.dump)
#   --uploads DIR       also archive this receipts directory next to the dump (.tar.gz)
#   -h, --help
#
# Environment
#   PG_IMAGE            image with the PostgreSQL client tools used for --url
#                       (default: postgres:<major version of the server>-alpine)
#   PG_USE_LOCAL=1      use the pg_dump installed on this machine for --url instead of Docker
#   COMPOSE_PROJECT_NAME / the usual Compose variables are honoured for --compose
#
# No PostgreSQL tools are needed on this machine: --dev and --compose use the ones inside the
# database container (always the right version), --url uses a throw-away container.
#
# A backup contains EVERYTHING: debts, payments, contacts and the (encrypted) bank details.
# Treat the file like the database itself. To read the bank details after restoring it
# elsewhere you also need the same DATA_ENCRYPTION_KEY — back that up separately.
set -euo pipefail

cd "$(dirname "$0")/.."

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }
die() {
  echo "backup: $*" >&2
  exit 1
}

SOURCE=""
URL=""
DATABASE=""
OUTPUT=""
UPLOADS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dev | --compose)
      [ -z "$SOURCE" ] || die "choose only one of --dev, --compose, --url"
      SOURCE="${1#--}"
      ;;
    --url)
      [ -z "$SOURCE" ] || die "choose only one of --dev, --compose, --url"
      [ $# -ge 2 ] || die "--url needs a value"
      SOURCE="url"
      URL="$2"
      shift
      ;;
    --database)
      [ $# -ge 2 ] || die "--database needs a value"
      DATABASE="$2"
      shift
      ;;
    --output)
      [ $# -ge 2 ] || die "--output needs a value"
      OUTPUT="$2"
      shift
      ;;
    --uploads)
      [ $# -ge 2 ] || die "--uploads needs a value"
      UPLOADS="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

[ -n "$SOURCE" ] || {
  usage >&2
  exit 2
}
if [ -n "$DATABASE" ]; then
  [ "$SOURCE" != "url" ] || die "--database only applies to --dev and --compose (put the database in the URL)"
  case "$DATABASE" in *[!A-Za-z0-9_]*) die "invalid database name: $DATABASE" ;; esac
fi

command -v docker >/dev/null 2>&1 || [ "${PG_USE_LOCAL:-}" = "1" ] || die "Docker is required (or set PG_USE_LOCAL=1 with pg_dump installed)."

# Dumps hold personal data: never world-readable.
umask 077

if [ -z "$OUTPUT" ]; then
  mkdir -p backups
  OUTPUT="backups/symmetry-debt-${SOURCE}-$(date +%Y%m%d-%H%M%S).dump"
else
  mkdir -p "$(dirname "$OUTPUT")"
fi
[ ! -e "$OUTPUT" ] || die "$OUTPUT already exists; refusing to overwrite it"

# From inside a container "localhost" is the container itself, not this machine.
docker_url() {
  printf '%s' "$1" | sed -E 's#@(localhost|127\.0\.0\.1)([:/])#@host.docker.internal\2#'
}

client() {
  # Runs a PostgreSQL client tool in a throw-away container. The URL travels in the
  # environment, not on the command line.
  docker run --rm -i --add-host=host.docker.internal:host-gateway -e "DB_URL=$(docker_url "$URL")" "$PG_CLIENT_IMAGE" "$@"
}

cleanup_partial() {
  # Never leave a truncated file behind looking like a good backup.
  rm -f "$OUTPUT"
}
trap cleanup_partial ERR INT TERM

case "$SOURCE" in
  dev)
    COMPOSE=(docker compose -f docker-compose.dev.yml)
    "${COMPOSE[@]}" ps --status running --quiet db | grep -q . || die "the development database is not running (docker compose -f docker-compose.dev.yml up -d)"
    echo "Dumping the development database${DATABASE:+ ($DATABASE)}…"
    # shellcheck disable=SC2016  # expanded inside the container, on purpose
    "${COMPOSE[@]}" exec -T -e "TARGET_DB=$DATABASE" db sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="${TARGET_DB:-$POSTGRES_DB}" --format=custom --no-owner --no-privileges' >"$OUTPUT"
    ;;
  compose)
    COMPOSE=(docker compose)
    "${COMPOSE[@]}" ps --status running --quiet db | grep -q . || die "the database of the standalone installation is not running (docker compose up -d db)"
    echo "Dumping the standalone installation's database${DATABASE:+ ($DATABASE)}…"
    # shellcheck disable=SC2016
    "${COMPOSE[@]}" exec -T -e "TARGET_DB=$DATABASE" db sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="${TARGET_DB:-$POSTGRES_DB}" --format=custom --no-owner --no-privileges' >"$OUTPUT"
    ;;
  url)
    case "$URL" in postgres://* | postgresql://*) ;; *) die "--url must start with postgresql://" ;; esac
    if [ "${PG_USE_LOCAL:-}" = "1" ]; then
      command -v pg_dump >/dev/null 2>&1 || die "PG_USE_LOCAL=1 but pg_dump is not installed"
      echo "Dumping with the local pg_dump…"
      pg_dump --dbname="$URL" --format=custom --no-owner --no-privileges >"$OUTPUT"
    else
      # pg_dump must not be older than the server: ask the server which version it is.
      PG_CLIENT_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
      # shellcheck disable=SC2016
      version_num="$(client sh -c 'psql "$DB_URL" --no-psqlrc -Atc "show server_version_num"' </dev/null)" || die "could not connect to the database"
      major="$((version_num / 10000))"
      PG_CLIENT_IMAGE="${PG_IMAGE:-postgres:${major}-alpine}"
      echo "Dumping a PostgreSQL ${major} server with ${PG_CLIENT_IMAGE}…"
      # shellcheck disable=SC2016
      client sh -c 'pg_dump --dbname="$DB_URL" --format=custom --no-owner --no-privileges' </dev/null >"$OUTPUT"
    fi
    ;;
esac

trap - ERR INT TERM

[ -s "$OUTPUT" ] || {
  rm -f "$OUTPUT"
  die "the dump is empty"
}
# A custom-format archive starts with the magic bytes "PGDMP".
[ "$(head -c 5 "$OUTPUT")" = "PGDMP" ] || {
  rm -f "$OUTPUT"
  die "the dump does not look like a pg_dump archive"
}

size="$(wc -c <"$OUTPUT" | tr -d ' ')"
echo "✓ Database backup: $OUTPUT (${size} bytes)"

if [ -n "$UPLOADS" ]; then
  [ -d "$UPLOADS" ] || die "receipts directory not found: $UPLOADS"
  archive="${OUTPUT%.dump}-uploads.tar.gz"
  tar -czf "$archive" -C "$UPLOADS" .
  echo "✓ Receipts backup: $archive"
fi

cat <<EOF

Restore it with:  scripts/restore.sh "$OUTPUT" --dev | --compose | --url "postgresql://…"
Remember: the bank details inside can only be read with the same DATA_ENCRYPTION_KEY.
EOF
