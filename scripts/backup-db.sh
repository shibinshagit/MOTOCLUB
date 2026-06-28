#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"

if [[ -f "$ROOT_DIR/.env.neon" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.neon"
  set +a
elif [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

SOURCE_URL="${NEON_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$SOURCE_URL" ]]; then
  echo "Error: set NEON_DATABASE_URL in .env.neon or .env" >&2
  exit 1
fi

if [[ "$SOURCE_URL" == *"localhost"* || "$SOURCE_URL" == *"127.0.0.1"* ]]; then
  echo "Error: backup script expects the remote Neon URL in .env.neon" >&2
  exit 1
fi

PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/libpq/bin/pg_dump}"
if [[ ! -x "$PG_DUMP" ]]; then
  PG_DUMP="$(command -v pg_dump)"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/neondb-backup-$STAMP.dump"

echo "Backing up remote database to $OUT"
"$PG_DUMP" "$SOURCE_URL" -Fc -f "$OUT"
ls -lh "$OUT"
echo "Done."
