#!/usr/bin/env python3
"""Script to add RapidAPI key to the database."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import ApiKeysConfig
from sqlalchemy import select
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RAPIDAPI_KEY = "3795857116msh39a48f2b371aed5p135ac4jsn65f8617b1dc1"


async def add_rapidapi_key():
    """Add RapidAPI key to the database."""
    async with AsyncSessionLocal() as session:
        try:
            # Check if rapidapi config already exists
            result = await session.execute(
                select(ApiKeysConfig).where(ApiKeysConfig.service_name == "rapidapi")
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.api_key = RAPIDAPI_KEY
                logger.info("Updated existing RapidAPI key in database")
            else:
                session.add(ApiKeysConfig(
                    service_name="rapidapi",
                    api_key=RAPIDAPI_KEY,
                    config_data=None
                ))
                logger.info("Added new RapidAPI key to database")
            
            await session.commit()
            logger.info("✅ Successfully saved RapidAPI key to database")
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"Error adding RapidAPI key: {e}", exc_info=True)
            raise


if __name__ == "__main__":
    asyncio.run(add_rapidapi_key())
