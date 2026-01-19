#!/usr/bin/env python3
"""Add course_questions table and pinned column to courses."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal, engine as db_engine
from sqlalchemy import text


async def add_course_questions_and_pinned():
    """Add course_questions table and courses.pinned column if missing."""
    try:
        async with AsyncSessionLocal() as session:
            is_postgres = db_engine.url.drivername.startswith("postgresql")

            # Check for courses.pinned column
            pinned_exists = False
            try:
                if is_postgres:
                    check_query = text("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name='courses' AND column_name='pinned'
                    """)
                    result = await session.execute(check_query)
                    pinned_exists = result.scalar() is not None
                else:
                    check_query = text("PRAGMA table_info(courses)")
                    result = await session.execute(check_query)
                    columns = result.fetchall()
                    pinned_exists = any(len(col) > 1 and col[1] == "pinned" for col in columns)
            except Exception as e:
                print(f"Error checking for courses.pinned column: {e}")

            if not pinned_exists:
                try:
                    if is_postgres:
                        alter_query = text("ALTER TABLE courses ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false")
                    else:
                        alter_query = text("ALTER TABLE courses ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
                    await session.execute(alter_query)
                    await session.commit()
                    print("✓ Successfully added pinned column to courses table")
                except Exception as e:
                    await session.rollback()
                    print(f"✗ Error adding pinned column: {e}")
                    raise
            else:
                print("pinned column already exists on courses table")

            # Check for course_questions table
            table_exists = False
            try:
                if is_postgres:
                    table_check = text("""
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_name='course_questions'
                    """)
                    result = await session.execute(table_check)
                    table_exists = result.scalar() is not None
                else:
                    table_check = text("SELECT name FROM sqlite_master WHERE type='table' AND name='course_questions'")
                    result = await session.execute(table_check)
                    table_exists = result.scalar() is not None
            except Exception as e:
                print(f"Error checking for course_questions table: {e}")

            if not table_exists:
                try:
                    if is_postgres:
                        create_query = text("""
                            CREATE TABLE course_questions (
                                id SERIAL PRIMARY KEY,
                                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                                section_id INTEGER NULL REFERENCES course_sections(id) ON DELETE SET NULL,
                                user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                                question TEXT NOT NULL,
                                answer TEXT NOT NULL,
                                created_at TIMESTAMPTZ DEFAULT NOW(),
                                updated_at TIMESTAMPTZ DEFAULT NOW()
                            )
                        """)
                    else:
                        create_query = text("""
                            CREATE TABLE course_questions (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                course_id INTEGER NOT NULL,
                                section_id INTEGER NULL,
                                user_id INTEGER NULL,
                                question TEXT NOT NULL,
                                answer TEXT NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )
                        """)

                    await session.execute(create_query)
                    await session.commit()
                    print("✓ Successfully created course_questions table")
                except Exception as e:
                    await session.rollback()
                    print(f"✗ Error creating course_questions table: {e}")
                    raise
            else:
                print("course_questions table already exists")
    except Exception as e:
        print(f"✗ Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(add_course_questions_and_pinned())
