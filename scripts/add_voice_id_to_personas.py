#!/usr/bin/env python3
"""
Migration script to add voice_id column to persona_configs table.
"""
import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.base import AsyncSessionLocal, engine
from sqlalchemy import text


async def add_voice_id_column():
    """Add voice_id column to persona_configs table."""
    try:
        async with AsyncSessionLocal() as session:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='persona_configs' AND column_name='voice_id'
            """)
            result = await session.execute(check_query)
            exists = result.scalar_one_or_none()
            
            if exists:
                print("✅ voice_id column already exists in persona_configs table")
                return
            
            # Add the column
            print("🔄 Adding voice_id column to persona_configs table...")
            alter_query = text("""
                ALTER TABLE persona_configs 
                ADD COLUMN voice_id INTEGER REFERENCES voices(id)
            """)
            await session.execute(alter_query)
            await session.commit()
            print("✅ Successfully added voice_id column to persona_configs table")
            
    except Exception as e:
        print(f"❌ Error adding voice_id column: {e}")
        raise


if __name__ == "__main__":
    print("🔄 Adding voice_id column to persona_configs table...\n")
    asyncio.run(add_voice_id_column())
