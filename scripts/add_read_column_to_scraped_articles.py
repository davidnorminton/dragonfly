#!/usr/bin/env python3
"""
Add 'read' column to scraped_articles table.

This script is idempotent - it can be run multiple times safely.
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from sqlalchemy import text


async def add_read_column():
    """Add read column to scraped_articles table if it doesn't exist."""
    print("🔧 Adding 'read' column to scraped_articles table...")
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if column already exists
            result = await session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'scraped_articles' 
                AND column_name = 'read'
            """))
            
            if result.fetchone():
                print("✅ 'read' column already exists - skipping")
                return
            
            # Add the column
            print("📝 Adding 'read' column...")
            await session.execute(text("""
                ALTER TABLE scraped_articles 
                ADD COLUMN read BOOLEAN DEFAULT FALSE NOT NULL
            """))
            
            # Create index for better query performance
            print("📊 Creating index on 'read' column...")
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_scraped_articles_read 
                ON scraped_articles(read)
            """))
            
            await session.commit()
            print("✅ Successfully added 'read' column and index!")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            await session.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(add_read_column())
