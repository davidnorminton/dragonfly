#!/usr/bin/env python3
"""
Database dump utility for Dragonfly.
Exports PostgreSQL database to SQL dump file.
Can be used as an alternative to pg_dump for environments where pg_dump is not available.
"""

import asyncio
import sys
import os
from pathlib import Path
from datetime import datetime
from sqlalchemy import text
from database.base import engine, AsyncSessionLocal
from database.models import Base
import json

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

async def dump_database():
    """Dump database schema and data to SQL file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_dir = project_root / "database_dumps"
    dump_dir.mkdir(exist_ok=True)
    
    dump_file = dump_dir / f"dragonfly_dump_{timestamp}.sql"
    
    print("=" * 50)
    print("Dragonfly Database Dump (Python)")
    print("=" * 50)
    print()
    
    try:
        async with AsyncSessionLocal() as session:
            # Get all table names
            result = await session.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """))
            tables = [row[0] for row in result.fetchall()]
            
            print(f"Found {len(tables)} tables")
            print(f"Dumping to: {dump_file}")
            print()
            
            with open(dump_file, 'w', encoding='utf-8') as f:
                # Write header
                f.write(f"-- Dragonfly Database Dump\n")
                f.write(f"-- Generated: {datetime.now().isoformat()}\n")
                f.write(f"-- Tables: {len(tables)}\n")
                f.write("\n")
                
                # Dump schema for each table
                for table in tables:
                    print(f"Dumping schema for {table}...")
                    
                    # Get table schema
                    result = await session.execute(text(f"""
                        SELECT column_name, data_type, is_nullable, column_default
                        FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = '{table}'
                        ORDER BY ordinal_position
                    """))
                    columns = result.fetchall()
                    
                    f.write(f"\n-- Table: {table}\n")
                    f.write(f"CREATE TABLE IF NOT EXISTS {table} (\n")
                    
                    col_defs = []
                    for col in columns:
                        col_name, data_type, is_nullable, default = col
                        nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
                        default_clause = f" DEFAULT {default}" if default else ""
                        col_defs.append(f"    {col_name} {data_type} {nullable}{default_clause}")
                    
                    f.write(",\n".join(col_defs))
                    f.write("\n);\n")
                
                # Dump data for each table
                for table in tables:
                    print(f"Dumping data for {table}...")
                    
                    result = await session.execute(text(f"SELECT * FROM {table}"))
                    rows = result.fetchall()
                    
                    if rows:
                        # Get column names
                        col_result = await session.execute(text(f"""
                            SELECT column_name
                            FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = '{table}'
                            ORDER BY ordinal_position
                        """))
                        column_names = [col[0] for col in col_result.fetchall()]
                        
                        f.write(f"\n-- Data for {table} ({len(rows)} rows)\n")
                        f.write(f"TRUNCATE TABLE {table} CASCADE;\n")
                        
                        for row in rows:
                            values = []
                            for val in row:
                                if val is None:
                                    values.append("NULL")
                                elif isinstance(val, (dict, list)):
                                    values.append(f"'{json.dumps(val).replace(chr(39), chr(39)+chr(39))}'")
                                elif isinstance(val, str):
                                    values.append(f"'{val.replace(chr(39), chr(39)+chr(39))}'")
                                else:
                                    values.append(str(val))
                            
                            f.write(f"INSERT INTO {table} ({', '.join(column_names)}) VALUES ({', '.join(values)});\n")
            
            print()
            print("=" * 50)
            print("Database dump complete!")
            print("=" * 50)
            print()
            print(f"Dump file: {dump_file}")
            print(f"Size: {dump_file.stat().st_size / 1024:.2f} KB")
            print()
            print("Note: This is a basic dump. For production, use pg_dump:")
            print("  ./scripts/dump_database.sh")
            print()
            
    except Exception as e:
        print(f"Error dumping database: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(dump_database())
