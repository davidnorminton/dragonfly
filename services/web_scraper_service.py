"""
Web Scraper Service

Scrapes articles from category pages, RSS feeds, and extracts content, images, and metadata.
Uses Trafilatura for high-accuracy content extraction.
"""
import asyncio
import hashlib
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from urllib.parse import urljoin, urlparse
from email.utils import parsedate_to_datetime

import httpx
import feedparser
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.base import AsyncSessionLocal
from database.models import ScraperSource, ScrapedArticle, ArticleTextContent, ArticleHtmlContent

logger = logging.getLogger(__name__)


class WebScraperService:
    """Service for scraping web content from category pages."""
    
    def __init__(self, images_directory: Optional[str] = None):
        """
        Initialize the web scraper service.
        
        Args:
            images_directory: Directory to save scraped images
        """
        self.images_directory = Path(images_directory) if images_directory else None
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    
    async def scrape_all_sources(self) -> Dict[str, Any]:
        """
        Scrape all active sources.
        
        Returns:
            Dictionary with scraping results
        """
        results = {
            "success": True,
            "sources_scraped": 0,
            "articles_found": 0,
            "articles_saved": 0,
            "errors": []
        }
        
        try:
            async with AsyncSessionLocal() as session:
                # Get all active sources
                result = await session.execute(
                    select(ScraperSource).where(ScraperSource.is_active == True)
                )
                sources = result.scalars().all()
                
                if not sources:
                    logger.info("No active scraper sources found")
                    return results
                
                logger.info(f"Found {len(sources)} active sources to scrape")
                
                for source in sources:
                    try:
                        logger.info(f"Scraping source: {source.url}")
                        source_results = await self.scrape_source(source, session)
                        
                        results["sources_scraped"] += 1
                        results["articles_found"] += source_results["articles_found"]
                        results["articles_saved"] += source_results["articles_saved"]
                        
                        # Update last_scraped timestamp
                        source.last_scraped = datetime.utcnow()
                        await session.commit()
                        
                    except Exception as e:
                        error_msg = f"Error scraping {source.url}: {str(e)}"
                        logger.error(error_msg, exc_info=True)
                        results["errors"].append(error_msg)
                
                logger.info(f"Scraping complete: {results['articles_saved']} articles saved from {results['sources_scraped']} sources")
                
        except Exception as e:
            error_msg = f"Fatal error in scrape_all_sources: {str(e)}"
            logger.error(error_msg, exc_info=True)
            results["success"] = False
            results["errors"].append(error_msg)
        
        return results
    
    async def scrape_source(self, source: ScraperSource, session: AsyncSession) -> Dict[str, int]:
        """
        Scrape a single source (category page or RSS feed).
        
        Args:
            source: ScraperSource model instance
            session: Database session
            
        Returns:
            Dictionary with results
        """
        results = {
            "articles_found": 0,
            "articles_saved": 0
        }
        
        try:
            # Fetch the source
            async with httpx.AsyncClient(timeout=30.0, headers=self.headers, follow_redirects=True) as client:
                response = await client.get(source.url)
                response.raise_for_status()
            
            # Check if this is an RSS/Atom feed
            content_type = response.headers.get('content-type', '').lower()
            is_feed = (
                'xml' in content_type or
                'rss' in content_type or
                'atom' in content_type or
                source.url.endswith('.xml') or
                source.url.endswith('.rss') or
                '/feed' in source.url.lower() or
                '/rss' in source.url.lower()
            )
            
            if is_feed:
                logger.info(f"Detected RSS/Atom feed: {source.url}")
                article_urls = self._extract_urls_from_feed(response.text)
            else:
                logger.info(f"Detected HTML page: {source.url}")
                soup = BeautifulSoup(response.text, 'html.parser')
                article_urls = self._extract_article_urls(soup, source.url)
            
            results["articles_found"] = len(article_urls)
            logger.info(f"Found {len(article_urls)} article URLs on {source.url}")
            
            # Batch check for existing articles to reduce database queries
            existing_urls_result = await session.execute(
                select(ScrapedArticle.url).where(ScrapedArticle.url.in_(article_urls))
            )
            existing_urls = set(row[0] for row in existing_urls_result.fetchall())
            
            # Filter out existing articles
            new_article_urls = [url for url in article_urls if url not in existing_urls]
            skipped_count = len(article_urls) - len(new_article_urls)
            
            if skipped_count > 0:
                logger.info(f"⏭️  Skipping {skipped_count} already scraped articles")
            
            if not new_article_urls:
                logger.info(f"✓ All articles from {source.url} already scraped")
                return results
            
            logger.info(f"📥 Scraping {len(new_article_urls)} new articles from {source.url}")
            
            # Scrape each new article
            for idx, article_url in enumerate(new_article_urls, 1):
                try:
                    logger.info(f"  [{idx}/{len(new_article_urls)}] Scraping: {article_url}")
                    
                    # Scrape the article
                    article_data = await self.scrape_article(article_url)
                    
                    if article_data:
                        # Create new scraped article (without content field)
                        article = ScrapedArticle(
                            source_id=source.id,
                            url=article_url,
                            title=article_data.get('title'),
                            summary=article_data.get('summary'),
                            author=article_data.get('author'),
                            published_date=article_data.get('published_date'),
                            image_path=article_data.get('image_path'),
                            image_url=article_data.get('image_url'),
                            article_metadata=article_data.get('metadata')
                        )
                        
                        session.add(article)
                        await session.flush()  # Get article.id before creating content
                        
                        # Create separate content records if content exists
                        content = article_data.get('content')
                        if content:
                            # Create HTML content record
                            html_content = ArticleHtmlContent(
                                article_id=article.id,
                                raw_html=content,
                                sanitized_content=content,  # Could add sanitization here
                                content_type='text/html',
                                content_hash=hashlib.md5(content.encode()).hexdigest()
                            )
                            session.add(html_content)
                            
                            # Extract plain text from HTML for text content
                            soup = BeautifulSoup(content, 'html.parser')
                            plain_text = soup.get_text(separator=' ', strip=True)
                            
                            if plain_text:
                                text_content = ArticleTextContent(
                                    article_id=article.id,
                                    plain_text=plain_text,
                                    word_count=len(plain_text.split()),
                                    character_count=len(plain_text),
                                    content_hash=hashlib.md5(plain_text.encode()).hexdigest()
                                )
                                session.add(text_content)
                        
                        await session.commit()
                        results["articles_saved"] += 1
                        logger.info(f"  ✓ Saved: {article_data.get('title', article_url)[:80]}")
                    else:
                        logger.warning(f"  ⚠️  Failed to extract content: {article_url}")
                    
                except Exception as e:
                    logger.error(f"  ❌ Error scraping {article_url}: {e}")
                    await session.rollback()
            
        except Exception as e:
            logger.error(f"Error scraping source {source.url}: {e}", exc_info=True)
            raise
        
        return results
    
    def _extract_urls_from_feed(self, feed_content: str) -> List[str]:
        """
        Extract article URLs from an RSS/Atom feed.
        
        Args:
            feed_content: Raw feed content (XML)
            
        Returns:
            List of article URLs
        """
        try:
            feed = feedparser.parse(feed_content)
            article_urls = []
            
            for entry in feed.entries:
                # Get the article URL (link)
                url = entry.get('link')
                if url:
                    article_urls.append(url)
            
            logger.info(f"Extracted {len(article_urls)} URLs from RSS/Atom feed")
            return article_urls
            
        except Exception as e:
            logger.error(f"Error parsing feed: {e}", exc_info=True)
            return []
    
    def _extract_article_urls(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """
        Extract article URLs from a category page.
        
        Args:
            soup: BeautifulSoup object of the page
            base_url: Base URL of the page
            
        Returns:
            List of article URLs
        """
        article_urls = []
        
        # Common patterns for article links
        # This is a generic approach - might need customization per site
        
        # Look for common article link patterns
        selectors = [
            'article a[href]',
            '.article a[href]',
            '.post a[href]',
            '.entry a[href]',
            'a.article-link[href]',
            'a[class*="article"][href]',
            'a[class*="post"][href]',
            'h2 a[href]',
            'h3 a[href]',
        ]
        
        found_links = set()
        
        for selector in selectors:
            links = soup.select(selector)
            for link in links:
                href = link.get('href')
                if href:
                    # Convert relative URLs to absolute
                    full_url = urljoin(base_url, href)
                    
                    # Filter out non-article URLs
                    if self._is_likely_article_url(full_url, base_url):
                        found_links.add(full_url)
        
        return list(found_links)
    
    def _is_likely_article_url(self, url: str, base_url: str) -> bool:
        """
        Check if a URL is likely an article (not navigation, category, etc.).
        
        Args:
            url: URL to check
            base_url: Base URL of the site
            
        Returns:
            True if likely an article URL
        """
        parsed = urlparse(url)
        parsed_base = urlparse(base_url)
        
        # Must be same domain
        if parsed.netloc != parsed_base.netloc:
            return False
        
        # Exclude common non-article paths
        exclude_patterns = [
            r'/category/',
            r'/tag/',
            r'/author/',
            r'/page/',
            r'/search',
            r'/about',
            r'/contact',
            r'/privacy',
            r'/terms',
            r'/wp-admin',
            r'/wp-content',
            r'/feed',
            r'/rss',
            r'#',
            r'\?',
        ]
        
        path = parsed.path.lower()
        for pattern in exclude_patterns:
            if re.search(pattern, path):
                return False
        
        return True
    
    async def scrape_article(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape content from a single article using Trafilatura.
        
        Args:
            url: Article URL
            
        Returns:
            Dictionary with article data or None if failed
        """
        try:
            # Fetch the article page
            async with httpx.AsyncClient(timeout=30.0, headers=self.headers, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
            
            html_content = response.text
            
            # Use Trafilatura to extract content and metadata with error handling
            metadata = None
            content = None
            
            try:
                # Extract metadata first
                metadata = trafilatura.extract_metadata(html_content)
            except Exception as e:
                logger.warning(f"Failed to extract metadata from {url}: {e}")
            
            try:
                # Extract main content as HTML to preserve formatting
                content = trafilatura.extract(
                    html_content,
                    include_comments=False,
                    include_tables=True,
                    include_images=True,
                    include_formatting=True,
                    no_fallback=False,
                    output_format='html',
                    target_language='en'
                )
            except Exception as e:
                logger.warning(f"Trafilatura extraction failed for {url}: {e}")
                # Fallback to simple text extraction
                try:
                    content = trafilatura.extract(
                        html_content,
                        include_formatting=False,
                        no_fallback=False,
                        output_format='txt'
                    )
                    if content:
                        # Wrap plain text in basic HTML
                        content = f"<p>{content.replace(chr(10), '</p><p>')}</p>"
                except Exception as e2:
                    logger.warning(f"Fallback extraction also failed for {url}: {e2}")
                    content = None
            
            # Build article data from Trafilatura extraction
            article_data = {
                'title': metadata.title if metadata else None,
                'content': content,
                'summary': metadata.description if metadata else None,
                'author': metadata.author if metadata else None,
                'published_date': None,
                'image_url': metadata.image if metadata else None,
                'metadata': {}
            }
            
            # Parse published date if available
            if metadata and metadata.date:
                try:
                    article_data['published_date'] = datetime.fromisoformat(metadata.date.replace('Z', '+00:00'))
                except Exception as e:
                    logger.debug(f"Could not parse date {metadata.date}: {e}")
            
            # Fallback to BeautifulSoup for image if Trafilatura didn't find one
            if not article_data['image_url']:
                try:
                    soup = BeautifulSoup(html_content, 'html.parser')
                    article_data['image_url'] = self._extract_main_image(soup, url)
                except Exception as e:
                    logger.warning(f"Failed to extract image from {url}: {e}")
                    article_data['image_url'] = None
            
            # Download and save the main image
            if article_data['image_url'] and self.images_directory:
                image_path = await self._download_image(
                    article_data['image_url'],
                    article_data['title'] or url
                )
                article_data['image_path'] = image_path
            
            # Validate we got meaningful content
            if not content or len(content.strip()) < 100:
                logger.warning(f"Article content too short or empty: {url}")
                return None
            
            # Also ensure we have at least a title or summary
            if not article_data.get('title') and not article_data.get('summary'):
                logger.warning(f"Article missing both title and summary: {url}")
                return None
            
            return article_data
            
        except Exception as e:
            logger.error(f"Error scraping article {url}: {e}", exc_info=True)
            return None
    
    # Old extraction methods removed - now using Trafilatura for better accuracy
    # Keeping _extract_main_image as fallback for images
    def _extract_main_image(self, soup: BeautifulSoup, base_url: str) -> Optional[str]:
        """Extract main article image URL."""
        # Try Open Graph image
        og_image = soup.find('meta', attrs={'property': 'og:image'})
        if og_image and og_image.get('content'):
            return urljoin(base_url, og_image['content'])
        
        # Try featured image
        selectors = [
            'article img.featured-image',
            'article img.post-image',
            '.featured-image img',
            'article img',
        ]
        
        for selector in selectors:
            img = soup.select_one(selector)
            if img and img.get('src'):
                return urljoin(base_url, img['src'])
        
        return None
    
    async def _download_image(self, image_url: str, title: str) -> Optional[str]:
        """
        Download and save an image.
        
        Args:
            image_url: URL of the image
            title: Article title (used for filename)
            
        Returns:
            Relative path to saved image or None if failed
        """
        if not self.images_directory:
            return None
        
        try:
            # Create images directory if it doesn't exist
            self.images_directory.mkdir(parents=True, exist_ok=True)
            
            # Generate filename
            url_hash = hashlib.md5(image_url.encode()).hexdigest()[:8]
            safe_title = re.sub(r'[^\w\s-]', '', title)[:50].strip().replace(' ', '_')
            ext = Path(urlparse(image_url).path).suffix or '.jpg'
            filename = f"{safe_title}_{url_hash}{ext}"
            filepath = self.images_directory / filename
            
            # Check if already downloaded
            if filepath.exists():
                logger.debug(f"Image already exists: {filename}")
                return str(filepath)
            
            # Download the image
            async with httpx.AsyncClient(timeout=30.0, headers=self.headers) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                
                # Save the image
                filepath.write_bytes(response.content)
                logger.info(f"Downloaded image: {filename}")
                
                return str(filepath)
                
        except Exception as e:
            logger.warning(f"Failed to download image from {image_url}: {e}")
            return None
