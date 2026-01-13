#!/usr/bin/env python3
"""Clear all similar movie and TV show content from the database."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import VideoSimilarContent
from sqlalchemy import delete


async def clear_similar_content():
    """Clear all similar content records from the database."""
    async with AsyncSessionLocal() as session:
        try:
            # Delete all records
            result = await session.execute(delete(VideoSimilarContent))
            deleted_count = result.rowcount
            
            await session.commit()
            
            print(f"✅ Successfully deleted {deleted_count} similar content records from the database.")
            return deleted_count
        except Exception as e:
            await session.rollback()
            print(f"❌ Error clearing similar content: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(clear_similar_content())
