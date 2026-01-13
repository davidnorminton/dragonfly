#!/usr/bin/env python3
"""Link all existing chat sessions and playlists to a user (dave)."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from sqlalchemy import text


async def link_data_to_user():
    """Link all chat sessions and playlists to the 'dave' user."""
    async with AsyncSessionLocal() as session:
        try:
            # Find the 'dave' user using raw SQL to avoid ORM issues
            engine_url = str(session.bind.url)
            is_postgresql = 'postgresql' in engine_url
            
            if is_postgresql:
                user_query = text("SELECT id, name FROM users WHERE LOWER(name) = LOWER(:name) LIMIT 1")
            else:
                user_query = text("SELECT id, name FROM users WHERE LOWER(name) = LOWER(:name) LIMIT 1")
            
            result = await session.execute(user_query, {"name": "dave"})
            row = result.first()
            
            if not row:
                print("❌ User 'dave' not found. Please create the user first.")
                return
            
            dave_user_id = row[0]
            dave_user_name = row[1]
            print(f"✅ Found user: {dave_user_name} (ID: {dave_user_id})")
            
            # Check if user_id columns exist and add them if needed
            engine_url = str(session.bind.url)
            is_postgresql = 'postgresql' in engine_url
            
            # Check chat_sessions table
            chat_column_exists = False
            try:
                check_chat = text("SELECT user_id FROM chat_sessions LIMIT 1")
                await session.execute(check_chat)
                await session.commit()
                chat_column_exists = True
            except Exception:
                await session.rollback()
                chat_column_exists = False
                print("⚠️  user_id column doesn't exist in chat_sessions, adding it...")
                try:
                    if is_postgresql:
                        await session.execute(text("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER"))
                    else:  # SQLite
                        await session.execute(text("ALTER TABLE chat_sessions ADD COLUMN user_id INTEGER"))
                    await session.commit()
                    chat_column_exists = True
                    print("✅ Added user_id column to chat_sessions")
                except Exception as e:
                    await session.rollback()
                    print(f"⚠️  Could not add user_id to chat_sessions: {e}")
            
            # Check music_playlists table
            playlist_column_exists = False
            try:
                check_playlist = text("SELECT user_id FROM music_playlists LIMIT 1")
                await session.execute(check_playlist)
                await session.commit()
                playlist_column_exists = True
            except Exception:
                await session.rollback()
                playlist_column_exists = False
                print("⚠️  user_id column doesn't exist in music_playlists, adding it...")
                try:
                    if is_postgresql:
                        await session.execute(text("ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS user_id INTEGER"))
                        # Try to drop unique constraint on name if it exists
                        try:
                            await session.execute(text("ALTER TABLE music_playlists DROP CONSTRAINT IF EXISTS music_playlists_name_key"))
                        except:
                            await session.rollback()
                    else:  # SQLite
                        await session.execute(text("ALTER TABLE music_playlists ADD COLUMN user_id INTEGER"))
                    await session.commit()
                    playlist_column_exists = True
                    print("✅ Added user_id column to music_playlists")
                except Exception as e:
                    await session.rollback()
                    print(f"⚠️  Could not add user_id to music_playlists: {e}")
            
            # Link chat sessions using raw SQL
            if chat_column_exists:
                if is_postgresql:
                    update_chat_query = text("UPDATE chat_sessions SET user_id = :user_id WHERE user_id IS NULL")
                else:
                    update_chat_query = text("UPDATE chat_sessions SET user_id = :user_id WHERE user_id IS NULL")
                
                result = await session.execute(update_chat_query, {"user_id": dave_user_id})
                await session.commit()
                updated_chats = result.rowcount
                
                if updated_chats > 0:
                    print(f"✅ Linked {updated_chats} chat sessions to user '{dave_user_name}'")
                else:
                    print(f"ℹ️  No chat sessions to link (all already have users or none exist)")
            
            # Link playlists using raw SQL
            if playlist_column_exists:
                if is_postgresql:
                    update_playlist_query = text("UPDATE music_playlists SET user_id = :user_id WHERE user_id IS NULL")
                else:
                    update_playlist_query = text("UPDATE music_playlists SET user_id = :user_id WHERE user_id IS NULL")
                
                result = await session.execute(update_playlist_query, {"user_id": dave_user_id})
                await session.commit()
                updated_playlists = result.rowcount
                
                if updated_playlists > 0:
                    print(f"✅ Linked {updated_playlists} playlists to user '{dave_user_name}'")
                else:
                    print(f"ℹ️  No playlists to link (all already have users or none exist)")
            
            print("\n✅ Migration completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error linking data to user: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(link_data_to_user())
