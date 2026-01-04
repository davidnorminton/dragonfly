import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import httpx
import xml.etree.ElementTree as ET
import re

from data_collectors.base_collector import BaseCollector

logger = logging.getLogger(__name__)


class NewsCollector(BaseCollector):
    """Collects news data from multiple RSS feeds (no API key required)."""
    
    def __init__(self):
        super().__init__("news")
        # Multiple RSS feeds that don't require API keys - using reliable sources
        self.feeds = {
            "top_stories": [
                {"name": "BBC Top Stories", "url": "https://feeds.bbci.co.uk/news/rss.xml"},
                {"name": "BBC UK", "url": "https://feeds.bbci.co.uk/news/uk/rss.xml"},
                {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
            ],
            "world": [
                {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
                {"name": "BBC Europe", "url": "https://feeds.bbci.co.uk/news/world/europe/rss.xml"},
            ],
            "technology": [
                {"name": "BBC Technology", "url": "https://feeds.bbci.co.uk/news/technology/rss.xml"},
            ],
            "science": [
                {"name": "BBC Science", "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"},
            ],
        }
    
    def get_data_type(self) -> str:
        """Return the data type identifier."""
        return "news_feed"
    
    def _parse_rss_item(self, item: ET.Element) -> Dict[str, Any]:
        """Parse a single RSS item into a structured dictionary."""
        title_elem = item.find("title")
        link_elem = item.find("link")
        description_elem = item.find("description")
        pub_date_elem = item.find("pubDate")
        
        # Handle RSS 2.0 and Atom feeds
        if title_elem is None:
            title_elem = item.find(".//{http://www.w3.org/2005/Atom}title")
        if link_elem is None:
            link_elem = item.find(".//{http://www.w3.org/2005/Atom}link")
            if link_elem is not None:
                link_text = link_elem.get("href", "")
            else:
                link_text = ""
        else:
            link_text = link_elem.text if link_elem.text else ""
            # Handle CDATA sections
            if not link_text and link_elem is not None:
                link_text = "".join(link_elem.itertext())
            
        if description_elem is None:
            description_elem = item.find(".//{http://www.w3.org/2005/Atom}summary")
        if pub_date_elem is None:
            pub_date_elem = item.find(".//{http://www.w3.org/2005/Atom}updated")
        
        title_text = title_elem.text if title_elem is not None and title_elem.text else ""
        if not title_text and title_elem is not None:
            title_text = "".join(title_elem.itertext())
        
        description_text = description_elem.text if description_elem is not None and description_elem.text else ""
        if not description_text and description_elem is not None:
            description_text = "".join(description_elem.itertext())
            
        pub_date_text = pub_date_elem.text if pub_date_elem is not None and pub_date_elem.text else ""
        if not pub_date_text and pub_date_elem is not None:
            pub_date_text = "".join(pub_date_elem.itertext())
        
        # Clean up description (remove HTML tags)
        if description_text:
            description_text = re.sub(r'<[^>]+>', '', description_text)
            description_text = description_text.strip()
            # Remove extra whitespace
            description_text = re.sub(r'\s+', ' ', description_text)
        
        # Extract image from media:thumbnail (common in RSS feeds)
        image_url = ""
        namespaces = {
            'media': 'http://search.yahoo.com/mrss/'
        }
        media_thumbnail = item.find(".//media:thumbnail", namespaces)
        if media_thumbnail is not None:
            image_url = media_thumbnail.get("url", "")
        # Fallback to enclosure if available
        if not image_url:
            enclosure = item.find("enclosure")
            if enclosure is not None and enclosure.get("type", "").startswith("image/"):
                image_url = enclosure.get("url", "")
        
        return {
            "title": title_text.strip(),
            "link": link_text.strip(),
            "description": description_text,
            "published_date": pub_date_text.strip(),
            "published_at": pub_date_text.strip(),
            "image_url": image_url
        }
    
    async def _fetch_feed(self, feed_info: Dict[str, str]) -> List[Dict[str, Any]]:
        """Fetch and parse a single RSS feed."""
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(feed_info["url"])
                response.raise_for_status()
                
                # Parse XML RSS feed
                try:
                    root = ET.fromstring(response.text)
                except ET.ParseError as e:
                    logger.warning(f"Failed to parse RSS feed {feed_info['name']}: {e}")
                    return []
                
                # Find all items (try multiple XPath patterns)
                items = root.findall(".//item")
                if not items:
                    items = root.findall(".//{http://purl.org/rss/1.0/}item")
                if not items:
                    items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
                
                articles = []
                for item in items[:20]:  # Limit per feed to avoid duplicates
                    article = self._parse_rss_item(item)
                    if article["title"]:  # Only add articles with titles
                        articles.append(article)
                
                logger.debug(f"Fetched {len(articles)} articles from {feed_info['name']}")
                return articles
        except httpx.HTTPStatusError as e:
            logger.warning(f"HTTP error fetching feed {feed_info['name']}: {e.response.status_code}")
            return []
        except Exception as e:
            logger.warning(f"Error fetching feed {feed_info['name']}: {e}")
            return []
    
    async def collect(self, feed_type: str = "top_stories", limit: int = 50) -> Dict[str, Any]:
        """
        Collect news data from multiple RSS feeds.
        
        Args:
            feed_type: Type of feed to collect (top_stories, world, technology, science)
            limit: Maximum number of articles to return (default: 50)
            
        Returns:
            Dictionary containing news data
        """
        if feed_type not in self.feeds:
            logger.error(f"Invalid feed type: {feed_type}. Available: {list(self.feeds.keys())}")
            return {
                "error": f"Invalid feed type: {feed_type}",
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
        
        feed_list = self.feeds[feed_type]
        all_articles = []
        
        try:
            # Fetch from all feeds in parallel
            tasks = [self._fetch_feed(feed_info) for feed_info in feed_list]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Combine articles from all feeds
            for articles in results:
                if isinstance(articles, list):
                    all_articles.extend(articles)
                elif isinstance(articles, Exception):
                    logger.warning(f"Feed fetch error: {articles}")
            
            # Remove duplicates based on title (simple deduplication)
            seen_titles = set()
            unique_articles = []
            for article in all_articles:
                title_lower = article["title"].lower().strip()
                # Skip empty titles and very short titles (likely parsing errors)
                if title_lower and len(title_lower) > 10 and title_lower not in seen_titles:
                    seen_titles.add(title_lower)
                    unique_articles.append(article)
            
            # Sort by published date (newest first)
            def parse_date(date_str):
                """Parse various date formats to datetime for sorting."""
                if not date_str:
                    return datetime.min
                try:
                    # Try parsing RFC 2822 format (common in RSS)
                    from email.utils import parsedate_to_datetime
                    return parsedate_to_datetime(date_str)
                except (ValueError, TypeError):
                    try:
                        # Try ISO format
                        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    except (ValueError, AttributeError):
                        try:
                            # Try common date formats
                            for fmt in ['%a, %d %b %Y %H:%M:%S %Z', '%a, %d %b %Y %H:%M:%S %z', '%Y-%m-%d %H:%M:%S']:
                                try:
                                    return datetime.strptime(date_str, fmt)
                                except ValueError:
                                    continue
                        except:
                            pass
                return datetime.min
            
            unique_articles.sort(key=lambda x: parse_date(x.get("published_date") or x.get("published_at", "")), reverse=True)
            
            # Limit after sorting
            unique_articles = unique_articles[:limit]
            
            news_data = {
                "feed_type": feed_type,
                "feed_name": feed_type.replace("_", " ").title(),
                "articles": unique_articles,
                "article_count": len(unique_articles),
                "sources": [f["name"] for f in feed_list],
                "collected_at": datetime.utcnow().isoformat()
            }
            
            logger.info(f"Collected {len(unique_articles)} unique news articles from {feed_type} feeds")
            
            return {
                "source": self.get_source(),
                "data_type": self.get_data_type(),
                "data": news_data
            }
            
        except Exception as e:
            logger.error(f"Error collecting news data: {e}", exc_info=True)
            return {
                "error": str(e),
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
