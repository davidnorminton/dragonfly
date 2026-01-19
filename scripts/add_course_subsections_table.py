#!/usr/bin/env python3
"""Add course_subsections table if it doesn't exist."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine as db_engine
from sqlalchemy import text


async def add_course_subsections_table():
    """Create course_subsections table if missing."""
    try:
        async with AsyncSessionLocal() as session:
            is_postgres = db_engine.url.drivername.startswith("postgresql")

            table_exists = False
            try:
                if is_postgres:
                    check_query = text("""
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_name = 'course_subsections'
                    """)
                    result = await session.execute(check_query)
                    table_exists = result.scalar() is not None
                else:
                    check_query = text("SELECT name FROM sqlite_master WHERE type='table' AND name='course_subsections'")
                    result = await session.execute(check_query)
                    table_exists = result.scalar() is not None
            except Exception as e:
                print(f"Error checking for course_subsections table: {e}")

            if not table_exists:
                try:
                    if is_postgres:
                        create_query = text("""
                            CREATE TABLE course_subsections (
                                id SERIAL PRIMARY KEY,
                                section_id INTEGER NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
                                title TEXT NOT NULL,
                                summary TEXT,
                                order_index INTEGER NOT NULL,
                                created_at TIMESTAMPTZ DEFAULT NOW(),
                                updated_at TIMESTAMPTZ DEFAULT NOW()
                            );
                            CREATE INDEX IF NOT EXISTS idx_course_subsections_section_id ON course_subsections(section_id);
                        """)
                    else:
                        create_query = text("""
                            CREATE TABLE IF NOT EXISTS course_subsections (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                section_id INTEGER NOT NULL,
                                title TEXT NOT NULL,
                                summary TEXT,
                                order_index INTEGER NOT NULL,
                                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY(section_id) REFERENCES course_sections(id) ON DELETE CASCADE
                            );
                            CREATE INDEX IF NOT EXISTS idx_course_subsections_section_id ON course_subsections(section_id);
                        """)
                    await session.execute(create_query)
                    await session.commit()
                    print("✓ Successfully created course_subsections table")
                except Exception as e:
                    await session.rollback()
                    print(f"✗ Error creating course_subsections table: {e}")
                    raise
            else:
                print("course_subsections table already exists")
    except Exception as e:
        print(f"✗ Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(add_course_subsections_table())
