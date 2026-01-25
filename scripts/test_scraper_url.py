#!/usr/bin/env python3
"""Test scraper on a specific URL."""
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from services.web_scraper_service import WebScraperService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_url():
    """Test scraping a specific URL."""
    url = "https://www.technologyreview.com/2026/01/23/1131559/americas-coming-war-over-ai-regulation/"
    
    # Get images directory from config (or use a default)
    images_dir = "/tmp/scraper_images"  # Temporary directory for testing
    
    scraper = WebScraperService(images_directory=images_dir)
    
    logger.info(f"Testing URL: {url}")
    
    try:
        article_data = await scraper.scrape_article(url)
        
        if article_data:
            logger.info("✓ Successfully scraped article!")
            logger.info(f"Title: {article_data.get('title', 'N/A')}")
            logger.info(f"Author: {article_data.get('author', 'N/A')}")
            logger.info(f"Summary: {article_data.get('summary', 'N/A')[:200]}...")
            logger.info(f"Published: {article_data.get('published_date', 'N/A')}")
            logger.info(f"Content length: {len(article_data.get('content', ''))}")
            logger.info(f"Image URL: {article_data.get('image_url', 'N/A')}")
            logger.info(f"Metadata keys: {list(article_data.get('metadata', {}).keys())}")
        else:
            logger.error("✗ Failed to scrape article - returned None")
            
    except Exception as e:
        logger.error(f"✗ Error scraping article: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(test_url())
