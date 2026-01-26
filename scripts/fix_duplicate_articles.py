#!/usr/bin/env python3
"""
Fix duplicate articles in the database.
1. Finds duplicate URLs
2. Keeps the oldest entry (first scraped)
3. Removes duplicates
4. Ensures unique constraint exists on URL column
"""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from database.base import AsyncSessionLocal


async def fix_duplicates():
    """Find and remove duplicate articles by URL."""
    async with AsyncSessionLocal() as session:
        # First, find all duplicate URLs
        print("🔍 Checking for duplicate article URLs...")
        
        find_duplicates_query = text("""
            SELECT url, COUNT(*) as count, array_agg(id ORDER BY scraped_at ASC) as ids
            FROM scraped_articles
            GROUP BY url
            HAVING COUNT(*) > 1
        """)
        
        result = await session.execute(find_duplicates_query)
        duplicates = result.fetchall()
        
        if not duplicates:
            print("✅ No duplicate articles found!")
        else:
            print(f"⚠️  Found {len(duplicates)} URLs with duplicates")
            
            total_removed = 0
            for row in duplicates:
                url = row[0]
                count = row[1]
                ids = row[2]
                
                # Keep the first (oldest) entry, delete the rest
                keep_id = ids[0]
                delete_ids = ids[1:]
                
                print(f"   URL: {url[:80]}...")
                print(f"   - Keeping ID {keep_id}, removing {len(delete_ids)} duplicates")
                
                # Delete the article content first (foreign key constraints)
                for table in ['article_text_content', 'article_html_content']:
                    delete_content = text(f"""
                        DELETE FROM {table} WHERE article_id = ANY(:ids)
                    """)
                    await session.execute(delete_content, {"ids": delete_ids})
                
                # Delete the duplicate articles
                delete_articles = text("""
                    DELETE FROM scraped_articles WHERE id = ANY(:ids)
                """)
                await session.execute(delete_articles, {"ids": delete_ids})
                
                total_removed += len(delete_ids)
            
            await session.commit()
            print(f"\n✅ Removed {total_removed} duplicate articles")
        
        # Check if unique constraint exists
        print("\n🔍 Checking for unique constraint on URL column...")
        
        check_constraint = text("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'scraped_articles' 
            AND constraint_type = 'UNIQUE'
            AND constraint_name LIKE '%url%'
        """)
        
        result = await session.execute(check_constraint)
        constraints = result.fetchall()
        
        if constraints:
            print(f"✅ Unique constraint already exists: {constraints[0][0]}")
        else:
            print("⚠️  No unique constraint on URL column, adding one...")
            
            try:
                add_constraint = text("""
                    ALTER TABLE scraped_articles 
                    ADD CONSTRAINT scraped_articles_url_unique UNIQUE (url)
                """)
                await session.execute(add_constraint)
                await session.commit()
                print("✅ Added unique constraint on URL column")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print("✅ Constraint already exists (different name)")
                else:
                    print(f"❌ Error adding constraint: {e}")
        
        # Final count
        count_query = text("SELECT COUNT(*) FROM scraped_articles")
        result = await session.execute(count_query)
        total = result.scalar()
        print(f"\n📊 Total articles in database: {total}")


if __name__ == "__main__":
    asyncio.run(fix_duplicates())
