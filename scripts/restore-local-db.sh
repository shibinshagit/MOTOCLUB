#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
DB_NAME="${LOCAL_DB_NAME:-motoclub_accounting_dev}"

PG_RESTORE="${PG_RESTORE:-/opt/homebrew/opt/libpq/bin/pg_restore}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@16/bin/psql}"
CREATEDB="${CREATEDB:-/opt/homebrew/opt/postgresql@16/bin/createdb}"
DROPDB="${DROPDB:-/opt/homebrew/opt/postgresql@16/bin/dropdb}"

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(ls -t "$BACKUP_DIR"/neondb-backup-*.dump 2>/dev/null | head -1 || true)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 [path/to/backup.dump]" >&2
  echo "Or place a backup in $BACKUP_DIR" >&2
  exit 1
fi

echo "Restoring $BACKUP_FILE into local database '$DB_NAME'"

"$DROPDB" --if-exists "$DB_NAME"
"$CREATEDB" "$DB_NAME"
"$PG_RESTORE" -d "$DB_NAME" --no-owner --no-acl "$BACKUP_FILE" || true

echo "Verifying restore..."
"$PSQL" -d "$DB_NAME" -c "SELECT COUNT(*) AS sales FROM sales;"
echo "Local database ready: postgresql://$(whoami)@localhost:5432/$DB_NAME"
