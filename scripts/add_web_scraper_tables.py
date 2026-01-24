#!/usr/bin/env python3
"""
Add web scraper tables to the database.
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from sqlalchemy import text


async def add_scraper_tables():
    """Add web scraper tables to database."""
    print("Adding web scraper tables...")
    
    async with AsyncSessionLocal() as session:
        try:
            # Create scraper_sources table
            print("\n1. Creating scraper_sources table...")
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS scraper_sources (
                    id SERIAL PRIMARY KEY,
                    url VARCHAR NOT NULL UNIQUE,
                    name VARCHAR,
                    is_active BOOLEAN DEFAULT TRUE,
                    last_scraped TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Create index on URL
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_scraper_sources_url 
                ON scraper_sources(url)
            """))
            print("✓ scraper_sources table created")
            
            # Create scraped_articles table
            print("\n2. Creating scraped_articles table...")
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS scraped_articles (
                    id SERIAL PRIMARY KEY,
                    source_id INTEGER NOT NULL REFERENCES scraper_sources(id) ON DELETE CASCADE,
                    url VARCHAR NOT NULL UNIQUE,
                    title VARCHAR,
                    content TEXT,
                    summary TEXT,
                    author VARCHAR,
                    published_date TIMESTAMP WITH TIME ZONE,
                    image_path VARCHAR,
                    image_url VARCHAR,
                    metadata JSONB,
                    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Create indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_scraped_articles_source_id 
                ON scraped_articles(source_id)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_scraped_articles_url 
                ON scraped_articles(url)
            """))
            print("✓ scraped_articles table created")
            
            # Note: scraper_images_directory will be added to paths config when user saves settings
            print("\n3. Configuration note:")
            print("✓ Tables created successfully")
            print("ℹ️  Set 'Scraper Images Directory' in Settings > Web Scraper before running scraper")
            
            await session.commit()
            print("\n✅ All web scraper tables created successfully!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            await session.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(add_scraper_tables())
