#!/usr/bin/env python3
"""
Diagnostic script to check scraper sources and articles in the database.
Run this on the remote server to diagnose scraper issues.
"""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from database.base import AsyncSessionLocal
from database.models import ScraperSource, ScrapedArticle
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta


async def check_scraper_status():
    """Check scraper sources and article counts."""
    async with AsyncSessionLocal() as session:
        print("=" * 80)
        print("SCRAPER DIAGNOSTIC REPORT")
        print("=" * 80)
        print()
        
        # Check sources
        print("📡 SCRAPER SOURCES:")
        print("-" * 80)
        result = await session.execute(select(ScraperSource).order_by(ScraperSource.id))
        sources = result.scalars().all()
        
        if not sources:
            print("❌ No sources found in database!")
            return
        
        active_count = 0
        inactive_count = 0
        
        for source in sources:
            status = "✅ ACTIVE" if source.is_active else "❌ INACTIVE"
            print(f"{status} | ID: {source.id:2d} | {source.name}")
            print(f"         URL: {source.url}")
            print(f"         Last scraped: {source.last_scraped or 'Never'}")
            
            # Count articles for this source
            article_count_result = await session.execute(
                select(func.count(ScrapedArticle.id))
                .where(ScrapedArticle.source_id == source.id)
            )
            article_count = article_count_result.scalar() or 0
            print(f"         Articles in DB: {article_count}")
            print()
            
            if source.is_active:
                active_count += 1
            else:
                inactive_count += 1
        
        print(f"Total sources: {len(sources)} ({active_count} active, {inactive_count} inactive)")
        print()
        
        # Check articles by source
        print("📰 ARTICLES BY SOURCE:")
        print("-" * 80)
        
        # Get article counts grouped by source
        for source in sources:
            if not source.is_active:
                continue
                
            # Count total articles
            total_result = await session.execute(
                select(func.count(ScrapedArticle.id))
                .where(ScrapedArticle.source_id == source.id)
            )
            total = total_result.scalar() or 0
            
            # Count recent articles (last 7 days)
            week_ago = datetime.utcnow() - timedelta(days=7)
            recent_result = await session.execute(
                select(func.count(ScrapedArticle.id))
                .where(
                    ScrapedArticle.source_id == source.id,
                    ScrapedArticle.scraped_at >= week_ago
                )
            )
            recent = recent_result.scalar() or 0
            
            # Get latest article date
            latest_result = await session.execute(
                select(ScrapedArticle.scraped_at)
                .where(ScrapedArticle.source_id == source.id)
                .order_by(desc(ScrapedArticle.scraped_at))
                .limit(1)
            )
            latest_date = latest_result.scalar_one_or_none()
            
            status_icon = "✅" if recent > 0 else "⚠️ " if total > 0 else "❌"
            print(f"{status_icon} {source.name}:")
            print(f"   Total articles: {total}")
            print(f"   Recent (7 days): {recent}")
            print(f"   Latest article: {latest_date or 'None'}")
            print()
        
        # Check overall article stats
        print("📊 OVERALL STATISTICS:")
        print("-" * 80)
        
        total_articles_result = await session.execute(select(func.count(ScrapedArticle.id)))
        total_articles = total_articles_result.scalar() or 0
        
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_articles_result = await session.execute(
            select(func.count(ScrapedArticle.id))
            .where(ScrapedArticle.scraped_at >= week_ago)
        )
        recent_articles = recent_articles_result.scalar() or 0
        
        # Get articles by domain
        print(f"Total articles in database: {total_articles}")
        print(f"Articles scraped in last 7 days: {recent_articles}")
        print()
        
        # Show top 10 most recent articles
        print("📋 10 MOST RECENT ARTICLES:")
        print("-" * 80)
        recent_result = await session.execute(
            select(ScrapedArticle)
            .order_by(desc(ScrapedArticle.scraped_at))
            .limit(10)
        )
        recent_articles_list = recent_result.scalars().all()
        
        if recent_articles_list:
            for article in recent_articles_list:
                # Get source name
                source_result = await session.execute(
                    select(ScraperSource).where(ScraperSource.id == article.source_id)
                )
                source = source_result.scalar_one_or_none()
                source_name = source.name if source else f"Source ID {article.source_id}"
                
                print(f"  • {article.title[:60]}...")
                print(f"    Source: {source_name} | Scraped: {article.scraped_at}")
                print(f"    URL: {article.url[:80]}...")
                print()
        else:
            print("  No articles found!")
        
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(check_scraper_status())
