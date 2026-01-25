#!/usr/bin/env python3
"""Create the personal_summaries table if it doesn't exist."""
import asyncio
from database.base import engine, AsyncSessionLocal
from database.models import PersonalSummary
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_table():
    """Create personal_summaries table."""
    try:
        async with engine.begin() as conn:
            # Check if table exists
            result = await conn.execute(
                text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'personal_summaries'
                    );
                """)
            )
            exists = result.scalar()
            
            if exists:
                logger.info("✅ Table 'personal_summaries' already exists")
                return
            
            # Create table
            await conn.execute(text("""
                CREATE TABLE personal_summaries (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR,
                    user_id INTEGER REFERENCES users(id),
                    title VARCHAR,
                    summary TEXT NOT NULL,
                    message_count INTEGER NOT NULL DEFAULT 0,
                    message_ids JSONB,
                    start_date TIMESTAMP WITH TIME ZONE,
                    end_date TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            """))
            
            # Create indexes
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_personal_summaries_session_id 
                ON personal_summaries(session_id);
            """))
            
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_personal_summaries_user_id 
                ON personal_summaries(user_id);
            """))
            
            logger.info("✅ Created table 'personal_summaries' with indexes")
            
    except Exception as e:
        logger.error(f"❌ Error creating table: {e}", exc_info=True)
        raise

if __name__ == "__main__":
    asyncio.run(create_table())
