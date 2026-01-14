#!/usr/bin/env python3
"""Clear all data from stories_complete table AND delete audio files."""
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


async def clear_stories_complete_all():
    """Clear all records from stories_complete table and delete audio files."""
    try:
        project_root = Path(__file__).parent.parent
        complete_dir = project_root / "data" / "story" / "complete"
        
        # Clear database
        async with AsyncSessionLocal() as session:
            # Count records before deletion
            from sqlalchemy import select, func
            count_result = await session.execute(
                select(func.count(StoryComplete.id))
            )
            count = count_result.scalar() or 0
            
            logger.info(f"Found {count} records in stories_complete table")
            
            if count > 0:
                # Delete all records
                await session.execute(delete(StoryComplete))
                await session.commit()
                logger.info(f"✅ Successfully deleted {count} records from stories_complete table")
            else:
                logger.info("Table is already empty")
        
        # Delete audio files
        if complete_dir.exists():
            audio_files = list(complete_dir.glob("*.mp3"))
            logger.info(f"Found {len(audio_files)} audio files in {complete_dir}")
            
            for audio_file in audio_files:
                try:
                    audio_file.unlink()
                    logger.info(f"Deleted: {audio_file.name}")
                except Exception as e:
                    logger.error(f"Error deleting {audio_file.name}: {e}")
            
            logger.info(f"✅ Successfully deleted {len(audio_files)} audio files")
        else:
            logger.info(f"Directory {complete_dir} does not exist")
            
    except Exception as e:
        logger.error(f"Error clearing stories_complete: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(clear_stories_complete_all())
