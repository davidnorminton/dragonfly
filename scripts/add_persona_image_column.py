#!/usr/bin/env python3
"""Add image_path column to persona_configs table."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from database.base import AsyncSessionLocal, engine as db_engine

async def add_persona_image_column():
    """Add image_path column to persona_configs table if it doesn't exist."""
    async with AsyncSessionLocal() as session:
        try:
            if db_engine.url.drivername.startswith('postgresql'):
                # PostgreSQL
                result = await session.execute(
                    text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='persona_configs' AND column_name='image_path'
                    """)
                )
                column_exists = result.scalar() is not None
                
                if not column_exists:
                    await session.execute(
                        text("ALTER TABLE persona_configs ADD COLUMN image_path TEXT NULL")
                    )
                    await session.commit()
                    print("✓ Added image_path column to persona_configs table")
                else:
                    print("✓ image_path column already exists")
            else:
                # SQLite
                result = await session.execute(
                    text("PRAGMA table_info(persona_configs)")
                )
                columns = result.fetchall()
                column_exists = any(len(col) > 1 and col[1] == 'image_path' for col in columns)
                
                if not column_exists:
                    await session.execute(
                        text("ALTER TABLE persona_configs ADD COLUMN image_path TEXT NULL")
                    )
                    await session.commit()
                    print("✓ Added image_path column to persona_configs table")
                else:
                    print("✓ image_path column already exists")
        except Exception as e:
            print(f"Error: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(add_persona_image_column())
