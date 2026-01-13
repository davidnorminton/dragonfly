#!/usr/bin/env python3
"""Add pass_code column to users table if it doesn't exist."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine as db_engine
from sqlalchemy import text

async def add_pass_code_column():
    """Add pass_code column to users table."""
    try:
        async with AsyncSessionLocal() as session:
            # Check if column already exists
            column_exists = False
            try:
                if db_engine.url.drivername.startswith('postgresql'):
                    check_query = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='users' AND column_name='pass_code'
                    """)
                    result = await session.execute(check_query)
                    column_exists = result.scalar() is not None
                else:  # SQLite
                    check_query = text("PRAGMA table_info(users)")
                    result = await session.execute(check_query)
                    columns = result.fetchall()
                    column_exists = any(len(col) > 1 and col[1] == 'pass_code' for col in columns)
            except Exception as e:
                print(f"Error checking for pass_code column: {e}")
                column_exists = False
            
            if column_exists:
                print("pass_code column already exists. No changes needed.")
                return
            
            # Add the column
            try:
                if db_engine.url.drivername.startswith('postgresql'):
                    alter_query = text("ALTER TABLE users ADD COLUMN pass_code VARCHAR")
                else:  # SQLite
                    alter_query = text("ALTER TABLE users ADD COLUMN pass_code TEXT")
                
                await session.execute(alter_query)
                await session.commit()
                print("✓ Successfully added pass_code column to users table")
            except Exception as e:
                await session.rollback()
                print(f"✗ Error adding pass_code column: {e}")
                raise
    except Exception as e:
        print(f"✗ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(add_pass_code_column())
