#!/usr/bin/env python3
"""Script to add Octopus Energy API key to the database."""
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


async def add_octopus_key(api_key: str):
    """Add Octopus Energy API key to the database.
    
    Args:
        api_key: The Octopus Energy API key to store
    """
    if not api_key:
        logger.error("No API key provided")
        return False
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if octopus config already exists
            result = await session.execute(
                select(ApiKeysConfig).where(ApiKeysConfig.service_name == "octopus_energy")
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.api_key = api_key
                logger.info("Updated existing Octopus Energy API key in database")
            else:
                session.add(ApiKeysConfig(
                    service_name="octopus_energy",
                    api_key=api_key,
                    config_data=None
                ))
                logger.info("Added new Octopus Energy API key to database")
            
            await session.commit()
            logger.info("✅ Successfully saved Octopus Energy API key to database")
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"Error adding Octopus Energy API key: {e}", exc_info=True)
            raise


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
        asyncio.run(add_octopus_key(api_key))
    else:
        # Try to get from environment variable
        import os
        api_key = os.getenv("OCTOPUS_ENERGY_API_KEY")
        if api_key:
            asyncio.run(add_octopus_key(api_key))
        else:
            logger.error("Please provide API key as argument or set OCTOPUS_ENERGY_API_KEY environment variable")
            logger.error("Usage: python add_octopus_key.py <api_key>")
            sys.exit(1)
