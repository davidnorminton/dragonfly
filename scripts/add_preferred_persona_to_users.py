#!/usr/bin/env python3
"""Add preferred_persona column to users table."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from database.base import AsyncSessionLocal, engine as db_engine

async def add_preferred_persona_column():
    """Add preferred_persona column to users table if it doesn't exist."""
    async with AsyncSessionLocal() as session:
        try:
            if db_engine.url.drivername.startswith('postgresql'):
                # PostgreSQL
                result = await session.execute(
                    text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='users' AND column_name='preferred_persona'
                    """)
                )
                column_exists = result.scalar() is not None
                
                if not column_exists:
                    await session.execute(
                        text("ALTER TABLE users ADD COLUMN preferred_persona TEXT NULL")
                    )
                    await session.commit()
                    print("✓ Added preferred_persona column to users table")
                else:
                    print("✓ preferred_persona column already exists")
            else:
                # SQLite
                result = await session.execute(
                    text("PRAGMA table_info(users)")
                )
                columns = result.fetchall()
                column_exists = any(len(col) > 1 and col[1] == 'preferred_persona' for col in columns)
                
                if not column_exists:
                    await session.execute(
                        text("ALTER TABLE users ADD COLUMN preferred_persona TEXT NULL")
                    )
                    await session.commit()
                    print("✓ Added preferred_persona column to users table")
                else:
                    print("✓ preferred_persona column already exists")
        except Exception as e:
            print(f"Error: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(add_preferred_persona_column())
