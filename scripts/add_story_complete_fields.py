#!/usr/bin/env python3
"""Add narrator, cast, and screenplay fields to stories_complete table."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine as db_engine
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def add_story_complete_fields():
    """Add narrator, cast, and screenplay columns to stories_complete table."""
    try:
        async with AsyncSessionLocal() as session:
            # Check database type
            db_url = str(db_engine.url)
            is_postgres = db_url.startswith("postgresql")
            
            if is_postgres:
                # PostgreSQL: Check if columns exist
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'stories_complete' 
                    AND column_name IN ('narrator', 'cast', 'screenplay');
                """)
                result = await session.execute(check_query)
                existing_columns = {row[0] for row in result}
                
                if 'narrator' not in existing_columns:
                    await session.execute(text("ALTER TABLE stories_complete ADD COLUMN narrator VARCHAR;"))
                    logger.info("Added 'narrator' column")
                
                if 'cast' not in existing_columns:
                    await session.execute(text('ALTER TABLE stories_complete ADD COLUMN "cast" JSON;'))
                    logger.info("Added 'cast' column")
                
                if 'screenplay' not in existing_columns:
                    await session.execute(text("ALTER TABLE stories_complete ADD COLUMN screenplay TEXT;"))
                    logger.info("Added 'screenplay' column")
                
            else:
                # SQLite: Check if columns exist
                check_query = text("PRAGMA table_info(stories_complete);")
                result = await session.execute(check_query)
                existing_columns = {row[1] for row in result}
                
                if 'narrator' not in existing_columns:
                    await session.execute(text("ALTER TABLE stories_complete ADD COLUMN narrator VARCHAR;"))
                    logger.info("Added 'narrator' column")
                
                if 'cast' not in existing_columns:
                    await session.execute(text('ALTER TABLE stories_complete ADD COLUMN "cast" TEXT;'))  # JSON stored as TEXT in SQLite
                    logger.info("Added 'cast' column")
                
                if 'screenplay' not in existing_columns:
                    await session.execute(text("ALTER TABLE stories_complete ADD COLUMN screenplay TEXT;"))
                    logger.info("Added 'screenplay' column")
            
            await session.commit()
            logger.info("✅ Successfully updated 'stories_complete' table")
            
    except Exception as e:
        logger.error(f"Error updating stories_complete table: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(add_story_complete_fields())
