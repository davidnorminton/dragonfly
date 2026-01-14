#!/usr/bin/env python3
"""Create story_screenplay_versions table."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from database.base import AsyncSessionLocal, engine

async def create_screenplay_versions_table():
    """Create story_screenplay_versions table if it doesn't exist."""
    from database.base import engine
    
    async with AsyncSessionLocal() as session:
        try:
            # Check database type
            is_postgres = engine.url.drivername.startswith('postgresql')
            
            if is_postgres:
                # PostgreSQL - check if table exists
                result = await session.execute(
                    text("""
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = 'story_screenplay_versions'
                    """)
                )
                table_exists = result.scalar() is not None
                
                if table_exists:
                    print("✅ Table 'story_screenplay_versions' already exists")
                    return
                
                # Create the table for PostgreSQL
                await session.execute(
                    text("""
                        CREATE TABLE story_screenplay_versions (
                            id SERIAL PRIMARY KEY,
                            story_id INTEGER NOT NULL,
                            screenplay TEXT NOT NULL,
                            version_number INTEGER NOT NULL DEFAULT 1,
                            is_active BOOLEAN DEFAULT FALSE,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (story_id) REFERENCES stories(id)
                        )
                    """)
                )
            else:
                # SQLite - check if table exists
                result = await session.execute(
                    text("""
                        SELECT name FROM sqlite_master 
                        WHERE type='table' AND name='story_screenplay_versions'
                    """)
                )
                table_exists = result.scalar() is not None
                
                if table_exists:
                    print("✅ Table 'story_screenplay_versions' already exists")
                    return
                
                # Create the table for SQLite
                await session.execute(
                    text("""
                        CREATE TABLE story_screenplay_versions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            story_id INTEGER NOT NULL,
                            screenplay TEXT NOT NULL,
                            version_number INTEGER NOT NULL DEFAULT 1,
                            is_active BOOLEAN DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (story_id) REFERENCES stories(id)
                        )
                    """)
                )
            
            await session.execute(
                text("CREATE INDEX idx_story_screenplay_versions_story_id ON story_screenplay_versions(story_id)")
            )
            await session.execute(
                text("CREATE INDEX idx_story_screenplay_versions_is_active ON story_screenplay_versions(is_active)")
            )
            await session.commit()
            print("✅ Successfully created 'story_screenplay_versions' table")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error creating screenplay versions table: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(create_screenplay_versions_table())
