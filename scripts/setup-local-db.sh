#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting local PostgreSQL (Homebrew)..."
brew services start postgresql@16

echo "Creating/restoring local database from latest Neon backup..."
bash "$ROOT_DIR/scripts/backup-db.sh"
bash "$ROOT_DIR/scripts/restore-local-db.sh"

echo ""
echo "Local dev setup complete."
echo "Ensure .env points to: postgresql://$(whoami)@localhost:5432/motoclub_accounting_dev"
echo "Restart the dev server: npm run dev"
