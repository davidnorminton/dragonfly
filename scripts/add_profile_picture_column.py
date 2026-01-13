#!/usr/bin/env python3
"""Add profile_picture column to users table."""
import asyncio
from database.base import AsyncSessionLocal
from sqlalchemy import text


async def add_profile_picture_column():
    """Add profile_picture column to users table if it doesn't exist."""
    async with AsyncSessionLocal() as session:
        try:
            # Check if column exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name='profile_picture'
            """)
            result = await session.execute(check_query)
            exists = result.scalar() is not None
            
            if exists:
                print("✓ profile_picture column already exists")
                return
            
            # Add the column
            alter_query = text("""
                ALTER TABLE users 
                ADD COLUMN profile_picture TEXT NULL
            """)
            await session.execute(alter_query)
            await session.commit()
            print("✓ Added profile_picture column to users table")
            
        except Exception as e:
            print(f"Error: {e}")
            await session.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(add_profile_picture_column())
