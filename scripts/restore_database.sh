#!/usr/bin/env bash

# Database Restore Script for Dragonfly
# Restores PostgreSQL database from SQL dump file

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <dump_file.sql.gz>"
    echo ""
    echo "Example:"
    echo "  $0 database_dumps/dragonfly_dump_20250117_120000.sql.gz"
    exit 1
fi

DUMP_FILE="$1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_USER="${DB_USER:-dragonfly}"
DB_PASS="${DB_PASS:-dragonfly}"
DB_NAME="${DB_NAME:-dragonfly}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Check if dump file exists
if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file not found: $DUMP_FILE"
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql not found. Please install PostgreSQL client tools."
    exit 1
fi

echo "=========================================="
echo "Dragonfly Database Restore"
echo "=========================================="
echo ""
echo "Dump file: $DUMP_FILE"
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"
echo ""

# Confirm before proceeding
read -p "WARNING: This will overwrite the existing database. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Set PGPASSWORD environment variable
export PGPASSWORD="$DB_PASS"

# Drop existing database if it exists
echo "Dropping existing database (if exists)..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${DB_NAME};" || true

# Restore from dump
echo "Restoring database from dump..."
if [[ "$DUMP_FILE" == *.gz ]]; then
    gunzip -c "$DUMP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres
else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres < "$DUMP_FILE"
fi

# Unset PGPASSWORD
unset PGPASSWORD

echo ""
echo "=========================================="
echo "Database restore complete!"
echo "=========================================="
echo ""
