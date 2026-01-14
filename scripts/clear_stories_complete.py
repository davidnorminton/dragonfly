#!/usr/bin/env python3
"""Clear all data from stories_complete table."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import StoryComplete
from sqlalchemy import delete
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def clear_stories_complete():
    """Clear all records from stories_complete table."""
    try:
        async with AsyncSessionLocal() as session:
            # Count records before deletion
            from sqlalchemy import select, func
            count_result = await session.execute(
                select(func.count(StoryComplete.id))
            )
            count = count_result.scalar() or 0
            
            logger.info(f"Found {count} records in stories_complete table")
            
            if count == 0:
                logger.info("Table is already empty")
                return
            
            # Delete all records
            await session.execute(delete(StoryComplete))
            await session.commit()
            
            logger.info(f"✅ Successfully deleted {count} records from stories_complete table")
            
    except Exception as e:
        logger.error(f"Error clearing stories_complete table: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(clear_stories_complete())
