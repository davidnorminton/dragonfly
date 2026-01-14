#!/usr/bin/env python3
"""Add screenplay column to stories table."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from database.base import AsyncSessionLocal

async def add_screenplay_column():
    """Add screenplay column to stories table if it doesn't exist."""
    async with AsyncSessionLocal() as session:
        try:
            # Check if column exists (works for both SQLite and PostgreSQL)
            result = await session.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='stories' AND column_name='screenplay'
                """)
            )
            column_exists = result.scalar() is not None
            
            if column_exists:
                print("✅ Column 'screenplay' already exists in 'stories' table")
                return
            
            # Add the column
            await session.execute(
                text("""
                    ALTER TABLE stories 
                    ADD COLUMN screenplay TEXT
                """)
            )
            await session.commit()
            print("✅ Successfully added 'screenplay' column to 'stories' table")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error adding screenplay column: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(add_screenplay_column())
