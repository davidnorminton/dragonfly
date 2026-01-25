#!/usr/bin/env python3
"""Add the 'read' column to scraped_articles table if it doesn't exist."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from database.base import engine
from sqlalchemy import text


async def add_read_column():
    """Add read column to scraped_articles table."""
    async with engine.begin() as conn:
        # Check if column exists
        check_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'scraped_articles' 
            AND column_name = 'read'
        """)
        
        result = await conn.execute(check_query)
        column_exists = result.fetchone() is not None
        
        if column_exists:
            print("✅ Column 'read' already exists in scraped_articles table")
            return
        
        # Add the column
        print("Adding 'read' column to scraped_articles table...")
        alter_query = text("""
            ALTER TABLE scraped_articles 
            ADD COLUMN read BOOLEAN NOT NULL DEFAULT FALSE
        """)
        
        await conn.execute(alter_query)
        
        # Create index for better query performance
        print("Creating index on 'read' column...")
        index_query = text("""
            CREATE INDEX IF NOT EXISTS ix_scraped_articles_read 
            ON scraped_articles(read)
        """)
        
        await conn.execute(index_query)
        
        print("✅ Successfully added 'read' column to scraped_articles table")


if __name__ == "__main__":
    asyncio.run(add_read_column())
