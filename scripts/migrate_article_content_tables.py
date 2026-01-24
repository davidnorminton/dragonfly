#!/usr/bin/env python3
"""
Migration script to separate article content into dedicated tables.
This script:
1. Creates new content tables (ArticleTextContent, ArticleHtmlContent)
2. Migrates existing content from ScrapedArticle.content to the new tables  
3. Removes the old content column from ScrapedArticle

Usage:
    python scripts/migrate_article_content_tables.py
"""

import asyncio
import hashlib
import logging
from pathlib import Path
import sys

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from database.base import AsyncSessionLocal, engine
from database.models import ScrapedArticle, ArticleTextContent, ArticleHtmlContent
from sqlalchemy import text, select
from sqlalchemy.exc import IntegrityError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def calculate_content_hash(content):
    """Calculate SHA-256 hash of content."""
    if not content:
        return None
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def strip_html_tags(html_content):
    """Simple HTML tag removal for text content."""
    if not html_content:
        return ""
    
    import re
    # Remove HTML tags
    clean = re.compile('<.*?>')
    text_content = re.sub(clean, '', html_content)
    
    # Clean up whitespace
    text_content = re.sub(r'\s+', ' ', text_content).strip()
    
    return text_content


def count_words(text):
    """Count words in text."""
    if not text:
        return 0
    return len(text.split())


async def create_new_tables():
    """Create the new content tables."""
    logger.info("Creating new content tables...")
    
    # Import Base to ensure all models are registered
    from database.models import Base
    
    async with engine.begin() as conn:
        # Create only the new content tables
        await conn.run_sync(lambda sync_conn: 
            ArticleTextContent.__table__.create(sync_conn, checkfirst=True)
        )
        await conn.run_sync(lambda sync_conn: 
            ArticleHtmlContent.__table__.create(sync_conn, checkfirst=True)
        )
    
    logger.info("✅ New content tables created successfully")


async def migrate_existing_content():
    """Migrate existing article content to the new tables."""
    logger.info("Starting content migration...")
    
    async with AsyncSessionLocal() as session:
        # Get all articles with content
        result = await session.execute(
            text("SELECT id, content FROM scraped_articles WHERE content IS NOT NULL AND content != ''")
        )
        articles = result.fetchall()
        
        logger.info(f"Found {len(articles)} articles with content to migrate")
        
        migrated_count = 0
        error_count = 0
        
        for article_row in articles:
            article_id = article_row[0]
            raw_content = article_row[1]
            
            try:
                # Check if content already exists in new tables  
                existing_text_result = await session.execute(
                    select(ArticleTextContent).where(ArticleTextContent.article_id == article_id)
                )
                existing_text = existing_text_result.scalar_one_or_none()
                
                existing_html_result = await session.execute(
                    select(ArticleHtmlContent).where(ArticleHtmlContent.article_id == article_id)
                )
                existing_html = existing_html_result.scalar_one_or_none()
                
                if existing_text and existing_html:
                    logger.debug(f"Content for article {article_id} already migrated, skipping")
                    continue
                
                # Determine content format (simple heuristic)
                is_html = bool(raw_content and ('<' in raw_content and '>' in raw_content))
                
                # Create text content
                if not existing_text:
                    if is_html:
                        text_content = strip_html_tags(raw_content)
                    else:
                        text_content = raw_content
                    
                    text_record = ArticleTextContent(
                        article_id=article_id,
                        content=text_content,
                        word_count=count_words(text_content),
                        character_count=len(text_content) if text_content else 0,
                        content_hash=calculate_content_hash(text_content)
                    )
                    session.add(text_record)
                
                # Create HTML content
                if not existing_html:
                    if is_html:
                        html_content = raw_content
                        sanitized_content = raw_content  # Will be sanitized later by the app
                    else:
                        # Convert plain text to simple HTML
                        html_content = f"<p>{raw_content.replace(chr(10), '</p><p>')}</p>" if raw_content else ""
                        sanitized_content = html_content
                    
                    html_record = ArticleHtmlContent(
                        article_id=article_id,
                        content=html_content,
                        sanitized_content=sanitized_content,
                        content_type='html',
                        content_hash=calculate_content_hash(html_content)
                    )
                    session.add(html_record)
                
                migrated_count += 1
                
                # Commit in batches of 100
                if migrated_count % 100 == 0:
                    await session.commit()
                    logger.info(f"Migrated {migrated_count} articles...")
                    
            except Exception as e:
                error_count += 1
                logger.error(f"Error migrating article {article_id}: {e}")
                await session.rollback()
                continue
        
        # Final commit
        await session.commit()
        
        logger.info(f"✅ Migration completed: {migrated_count} articles migrated, {error_count} errors")


async def verify_migration():
    """Verify that the migration was successful."""
    logger.info("Verifying migration...")
    
    async with AsyncSessionLocal() as session:
        # Count records in each table
        original_count = await session.scalar(
            text("SELECT COUNT(*) FROM scraped_articles WHERE content IS NOT NULL AND content != ''")
        )
        
        text_count = await session.scalar(select(func.count(ArticleTextContent.id)))
        html_count = await session.scalar(select(func.count(ArticleHtmlContent.id)))
        
        logger.info(f"Original articles with content: {original_count}")
        logger.info(f"Text content records: {text_count}")
        logger.info(f"HTML content records: {html_count}")
        
        if text_count >= original_count and html_count >= original_count:
            logger.info("✅ Migration verification successful")
            return True
        else:
            logger.error("❌ Migration verification failed")
            return False


async def remove_old_content_column():
    """Remove the old content column from ScrapedArticle table."""
    logger.info("Removing old content column...")
    
    try:
        async with engine.begin() as conn:
            # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
            await conn.execute(text("""
                CREATE TABLE scraped_articles_new AS 
                SELECT 
                    id, source_id, url, title, summary, author, published_date,
                    image_path, image_url, article_metadata, scraped_at, created_at, updated_at
                FROM scraped_articles
            """))
            
            await conn.execute(text("DROP TABLE scraped_articles"))
            await conn.execute(text("ALTER TABLE scraped_articles_new RENAME TO scraped_articles"))
            
            # Recreate indexes
            await conn.execute(text("CREATE UNIQUE INDEX ix_scraped_articles_url ON scraped_articles (url)"))
            await conn.execute(text("CREATE INDEX ix_scraped_articles_source_id ON scraped_articles (source_id)"))
            await conn.execute(text("CREATE INDEX ix_scraped_articles_id ON scraped_articles (id)"))
            
        logger.info("✅ Old content column removed successfully")
        
    except Exception as e:
        logger.error(f"Error removing old content column: {e}")
        raise


async def main():
    """Run the complete migration process."""
    logger.info("🚀 Starting article content table migration...")
    
    try:
        # Step 1: Create new tables
        await create_new_tables()
        
        # Step 2: Migrate existing content
        await migrate_existing_content()
        
        # Step 3: Verify migration
        if not await verify_migration():
            logger.error("Migration verification failed. Stopping before removing old column.")
            return False
        
        # Step 4: Remove old content column (optional - uncomment when ready)
        # await remove_old_content_column()
        # logger.info("⚠️  Old content column removal skipped. Uncomment to remove after verification.")
        
        logger.info("🎉 Migration completed successfully!")
        logger.info("📝 Next steps:")
        logger.info("   1. Test the application with new content structure")
        logger.info("   2. Uncomment remove_old_content_column() when ready")
        logger.info("   3. Update API endpoints to use new content tables")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    # Import func for verification
    from sqlalchemy import func
    
    success = asyncio.run(main())
    sys.exit(0 if success else 1)