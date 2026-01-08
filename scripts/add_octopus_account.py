#!/usr/bin/env python3
"""Script to add Octopus Energy account number to the database."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import SystemConfig
from sqlalchemy import select
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ACCOUNT_NUMBER = "A-27FE4EE4"


async def add_octopus_account():
    """Add Octopus Energy account number to system config."""
    async with AsyncSessionLocal() as session:
        try:
            # Get or create system config
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.config_key == "system")
            )
            system_config = result.scalar_one_or_none()
            
            if system_config:
                if not system_config.config_value:
                    system_config.config_value = {}
                if "octopus" not in system_config.config_value:
                    system_config.config_value["octopus"] = {}
                system_config.config_value["octopus"]["account_number"] = ACCOUNT_NUMBER
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(system_config, "config_value")
                logger.info("Updated existing system config with Octopus account number")
            else:
                from sqlalchemy.orm.attributes import flag_modified
                system_config = SystemConfig(
                    config_key="system",
                    config_value={"octopus": {"account_number": ACCOUNT_NUMBER}}
                )
                session.add(system_config)
                logger.info("Created new system config with Octopus account number")
            
            await session.commit()
            logger.info(f"✅ Successfully saved Octopus Energy account number ({ACCOUNT_NUMBER}) to database")
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"Error adding Octopus account number: {e}", exc_info=True)
            raise


if __name__ == "__main__":
    asyncio.run(add_octopus_account())
