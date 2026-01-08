#!/usr/bin/env python3
"""Script to clear all chat messages and sessions from the database and remove mode references."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine
from database.models import ChatMessage, ChatSession
from sqlalchemy import delete, text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def clear_all_chats():
    """Clear all chat messages and sessions from the database."""
    async with AsyncSessionLocal() as session:
        try:
            # Delete all chat messages
            result = await session.execute(delete(ChatMessage))
            messages_deleted = result.rowcount
            logger.info(f"Deleted {messages_deleted} chat messages")
            
            # Delete all chat sessions
            result = await session.execute(delete(ChatSession))
            sessions_deleted = result.rowcount
            logger.info(f"Deleted {sessions_deleted} chat sessions")
            
            # Remove mode column values (set to NULL) - keeping the column structure
            # If you want to drop the column entirely, uncomment the ALTER TABLE statement below
            await session.execute(
                text("UPDATE chat_messages SET mode = NULL WHERE mode IS NOT NULL")
            )
            logger.info("Cleared all mode values from chat_messages")
            
            await session.commit()
            logger.info("✅ Successfully cleared all chats and removed mode references")
            
            return {
                "messages_deleted": messages_deleted,
                "sessions_deleted": sessions_deleted
            }
        except Exception as e:
            await session.rollback()
            logger.error(f"Error clearing chats: {e}", exc_info=True)
            raise


async def drop_mode_column():
    """Drop the mode column entirely from chat_messages table."""
    async with engine.begin() as conn:
        try:
            # Check if column exists before dropping
            result = await conn.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='chat_messages' AND column_name='mode'
                """)
            )
            if result.fetchone():
                await conn.execute(text("ALTER TABLE chat_messages DROP COLUMN mode"))
                logger.info("✅ Dropped mode column from chat_messages table")
            else:
                logger.info("Mode column does not exist, skipping")
        except Exception as e:
            logger.error(f"Error dropping mode column: {e}", exc_info=True)
            raise


async def main():
    """Main function."""
    import argparse
    parser = argparse.ArgumentParser(description="Clear all chats and remove mode references")
    parser.add_argument(
        "--drop-column",
        action="store_true",
        help="Drop the mode column entirely (default: just clear values)"
    )
    args = parser.parse_args()
    
    logger.info("Starting chat cleanup...")
    
    # Clear all chats
    result = await clear_all_chats()
    
    # Optionally drop the column
    if args.drop_column:
        await drop_mode_column()
    
    logger.info("Cleanup complete!")
    print(f"\nDeleted {result['messages_deleted']} messages and {result['sessions_deleted']} sessions")


if __name__ == "__main__":
    asyncio.run(main())
