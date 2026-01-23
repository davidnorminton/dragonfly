"""Add uk_certification column to video_movies table."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from sqlalchemy import text


async def add_certification_column():
    """Add uk_certification column to video_movies table."""
    print("Adding uk_certification column to video_movies table...")
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if column already exists
            result = await session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='video_movies' AND column_name='uk_certification'
            """))
            exists = result.fetchone()
            
            if exists:
                print("✓ Column 'uk_certification' already exists")
                return
            
            # Add the column
            await session.execute(text("""
                ALTER TABLE video_movies 
                ADD COLUMN uk_certification VARCHAR
            """))
            await session.commit()
            print("✓ Successfully added uk_certification column")
            
        except Exception as e:
            print(f"✗ Error: {e}")
            await session.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(add_certification_column())
