#!/usr/bin/env python3
"""Add summary column to course_sections table if it doesn't exist."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine as db_engine
from sqlalchemy import text


async def add_section_summary_column():
    """Add summary column to course_sections table."""
    try:
        async with AsyncSessionLocal() as session:
            is_postgres = db_engine.url.drivername.startswith("postgresql")

            # Check for course_sections.summary column
            summary_exists = False
            try:
                if is_postgres:
                    check_query = text("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name='course_sections' AND column_name='summary'
                    """)
                    result = await session.execute(check_query)
                    summary_exists = result.scalar() is not None
                else:
                    check_query = text("PRAGMA table_info(course_sections)")
                    result = await session.execute(check_query)
                    columns = result.fetchall()
                    summary_exists = any(len(col) > 1 and col[1] == "summary" for col in columns)
            except Exception as e:
                print(f"Error checking for course_sections.summary column: {e}")

            if not summary_exists:
                try:
                    if is_postgres:
                        alter_query = text("ALTER TABLE course_sections ADD COLUMN summary TEXT")
                    else:
                        alter_query = text("ALTER TABLE course_sections ADD COLUMN summary TEXT")
                    await session.execute(alter_query)
                    await session.commit()
                    print("✓ Successfully added summary column to course_sections table")
                except Exception as e:
                    await session.rollback()
                    print(f"✗ Error adding summary column: {e}")
                    raise
            else:
                print("summary column already exists on course_sections table")
    except Exception as e:
        print(f"✗ Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(add_section_summary_column())
