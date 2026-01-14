#!/usr/bin/env python3
"""Add stories_complete table to database."""
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


async def add_stories_complete_table():
    """Add stories_complete table."""
    try:
        async with AsyncSessionLocal() as session:
            # Check database type
            db_url = str(db_engine.url)
            is_postgres = db_url.startswith("postgresql")
            
            if is_postgres:
                # PostgreSQL: Check if table exists
                check_query = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'stories_complete'
                    );
                """)
                result = await session.execute(check_query)
                table_exists = result.scalar()
                
                if table_exists:
                    logger.info("Table 'stories_complete' already exists, skipping creation")
                    return
                
                # Create table
                create_query = text("""
                    CREATE TABLE stories_complete (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR NOT NULL,
                        image VARCHAR,
                        story TEXT NOT NULL,
                        audio VARCHAR NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                
                # Create index on title
                index_query = text("""
                    CREATE INDEX IF NOT EXISTS ix_stories_complete_title ON stories_complete(title);
                """)
                
            else:
                # SQLite: Check if table exists
                check_query = text("""
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='stories_complete';
                """)
                result = await session.execute(check_query)
                table_exists = result.scalar() is not None
                
                if table_exists:
                    logger.info("Table 'stories_complete' already exists, skipping creation")
                    return
                
                # Create table
                create_query = text("""
                    CREATE TABLE stories_complete (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title VARCHAR NOT NULL,
                        image VARCHAR,
                        story TEXT NOT NULL,
                        audio VARCHAR NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                
                # Create index on title
                index_query = text("""
                    CREATE INDEX IF NOT EXISTS ix_stories_complete_title ON stories_complete(title);
                """)
            
            # Execute table creation
            await session.execute(create_query)
            await session.execute(index_query)
            await session.commit()
            
            logger.info("Successfully created 'stories_complete' table")
            
    except Exception as e:
        logger.error(f"Error creating stories_complete table: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(add_stories_complete_table())
