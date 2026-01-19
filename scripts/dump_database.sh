#!/usr/bin/env bash

# Database Dump Script for Dragonfly
# Exports PostgreSQL database to SQL dump file

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="${DUMP_DIR:-$PROJECT_DIR/database_dumps}"
DB_USER="${DB_USER:-dragonfly}"
DB_PASS="${DB_PASS:-dragonfly}"
DB_NAME="${DB_NAME:-dragonfly}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Create dump directory if it doesn't exist
mkdir -p "$DUMP_DIR"

# Generate dump filename
DUMP_FILE="$DUMP_DIR/dragonfly_dump_${TIMESTAMP}.sql"
DUMP_FILE_COMPRESSED="$DUMP_FILE.gz"

echo "=========================================="
echo "Dragonfly Database Dump"
echo "=========================================="
echo ""
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"
echo ""

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    echo "Error: pg_dump not found. Please install PostgreSQL client tools."
    echo "  Ubuntu/Debian: sudo apt install postgresql-client"
    echo "  Fedora/RHEL: sudo dnf install postgresql"
    echo "  Arch: sudo pacman -S postgresql"
    exit 1
fi

# Set PGPASSWORD environment variable
export PGPASSWORD="$DB_PASS"

# Perform the dump
echo "Dumping database..."
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --create \
    --format=plain \
    --no-owner \
    --no-privileges \
    > "$DUMP_FILE"

# Compress the dump
echo "Compressing dump..."
gzip -f "$DUMP_FILE"

# Unset PGPASSWORD
unset PGPASSWORD

echo ""
echo "=========================================="
echo "Database dump complete!"
echo "=========================================="
echo ""
echo "Dump file: $DUMP_FILE_COMPRESSED"
echo "Size: $(du -h "$DUMP_FILE_COMPRESSED" | awk '{print $1}')"
echo ""
echo "To restore this dump:"
echo "  gunzip -c $DUMP_FILE_COMPRESSED | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres"
echo ""
echo "Or use the restore script:"
echo "  ./scripts/restore_database.sh $DUMP_FILE_COMPRESSED"
echo ""
