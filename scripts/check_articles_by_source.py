#!/usr/bin/env python3
"""
Quick script to check article counts by source.
Run this on the remote server to see which sources have articles.
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


async def check_articles_by_source():
    """Check article counts by source."""
    async with AsyncSessionLocal() as session:
        print("=" * 80)
        print("ARTICLE COUNTS BY SOURCE")
        print("=" * 80)
        print()
        
        # Get all sources
        sources_result = await session.execute(
            select(ScraperSource).order_by(ScraperSource.id)
        )
        sources = sources_result.scalars().all()
        
        week_ago = datetime.utcnow() - timedelta(days=7)
        
        for source in sources:
            # Count total articles
            total_result = await session.execute(
                select(func.count(ScrapedArticle.id))
                .where(ScrapedArticle.source_id == source.id)
            )
            total = total_result.scalar() or 0
            
            # Count recent articles
            recent_result = await session.execute(
                select(func.count(ScrapedArticle.id))
                .where(
                    ScrapedArticle.source_id == source.id,
                    ScrapedArticle.scraped_at >= week_ago
                )
            )
            recent = recent_result.scalar() or 0
            
            # Get latest article
            latest_result = await session.execute(
                select(ScrapedArticle)
                .where(ScrapedArticle.source_id == source.id)
                .order_by(desc(ScrapedArticle.scraped_at))
                .limit(1)
            )
            latest = latest_result.scalar_one_or_none()
            
            status = "✅" if total > 0 else "❌"
            active_status = "ACTIVE" if source.is_active else "INACTIVE"
            
            print(f"{status} Source {source.id}: {source.name} ({active_status})")
            print(f"   Total articles: {total}")
            print(f"   Recent (7 days): {recent}")
            if latest:
                print(f"   Latest: {latest.scraped_at} - {latest.title[:60]}...")
            else:
                print(f"   Latest: None")
            print()
        
        # Check what the API would return (first 20 articles)
        print("=" * 80)
        print("FIRST 20 ARTICLES (as returned by API):")
        print("=" * 80)
        articles_result = await session.execute(
            select(ScrapedArticle)
            .order_by(desc(ScrapedArticle.scraped_at))
            .limit(20)
        )
        articles = articles_result.scalars().all()
        
        # Get source names
        source_ids = {article.source_id for article in articles if article.source_id}
        sources_map = {}
        if source_ids:
            sources_result = await session.execute(
                select(ScraperSource).where(ScraperSource.id.in_(source_ids))
            )
            sources_list = sources_result.scalars().all()
            sources_map = {s.id: s.name for s in sources_list}
        
        source_counts = {}
        for article in articles:
            source_name = sources_map.get(article.source_id, f"Source {article.source_id}")
            source_counts[source_name] = source_counts.get(source_name, 0) + 1
            print(f"  • [{source_name}] {article.title[:50]}...")
            print(f"    Scraped: {article.scraped_at}")
        
        print()
        print("=" * 80)
        print("BREAKDOWN OF FIRST 20 ARTICLES BY SOURCE:")
        print("=" * 80)
        for source_name, count in sorted(source_counts.items(), key=lambda x: -x[1]):
            print(f"  {source_name}: {count} articles")


if __name__ == "__main__":
    asyncio.run(check_articles_by_source())
