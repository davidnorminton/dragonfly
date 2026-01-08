"""
Service for summarizing news articles using web scraping and AI.
"""
import logging
import httpx
from typing import Optional, Dict, Any
from bs4 import BeautifulSoup
from urllib.parse import urlparse

from config.persona_loader import load_persona_config, get_current_persona_name
from config.settings import settings
import anthropic
from anthropic import AsyncAnthropic
import os
import json

logger = logging.getLogger(__name__)


class ArticleSummarizer:
    """Service to scrape and summarize news articles."""
    
    def __init__(self):
        self.timeout = 30.0
        self.max_content_length = 50000  # Limit content to avoid token limits
        self.async_client = None
        self._load_api_key()
        
    def _load_api_key(self):
        """Load API key from config file or environment."""
        api_key = None
        try:
            api_keys_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "api_keys.json")
            if os.path.exists(api_keys_path):
                with open(api_keys_path, 'r') as f:
                    api_keys = json.load(f)
                    api_key = api_keys.get("anthropic", {}).get("api_key")
        except Exception as e:
            logger.warning(f"Could not load API key from config file: {e}")
        
        if not api_key:
            api_key = os.getenv("ANTHROPIC_API_KEY")
        
        if api_key:
            self.async_client = AsyncAnthropic(api_key=api_key)
        else:
            logger.warning("No Anthropic API key found for article summarization")
        
    async def scrape_article_content(self, url: str) -> Optional[str]:
        """
        Scrape article content from a URL.
        Attempts to extract main article text, removing navigation, ads, etc.
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                
                # Parse HTML
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "header", "footer", "aside"]):
                    script.decompose()
                
                # Try to find main article content
                # Common article content selectors
                article_selectors = [
                    'article',
                    '[role="article"]',
                    '.article-body',
                    '.article-content',
                    '.post-content',
                    '.entry-content',
                    '.content',
                    'main',
                ]
                
                article_content = None
                for selector in article_selectors:
                    article_content = soup.select_one(selector)
                    if article_content:
                        break
                
                # If no specific article container found, use body
                if not article_content:
                    article_content = soup.find('body')
                
                if article_content:
                    text = article_content.get_text(separator=' ', strip=True)
                    # Clean up whitespace
                    text = ' '.join(text.split())
                    # Limit length
                    if len(text) > self.max_content_length:
                        text = text[:self.max_content_length] + "..."
                    return text
                else:
                    # Fallback: get all text
                    text = soup.get_text(separator=' ', strip=True)
                    text = ' '.join(text.split())
                    if len(text) > self.max_content_length:
                        text = text[:self.max_content_length] + "..."
                    return text
                    
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error scraping {url}: {e.response.status_code}")
            return None
        except httpx.RequestError as e:
            logger.error(f"Request error scraping {url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error scraping article from {url}: {e}", exc_info=True)
            return None
    
    async def summarize_article(self, url: str, article_content: str) -> Optional[str]:
        """
        Summarize article content using the default AI model.
        """
        try:
            if not self.async_client:
                logger.error("Anthropic API client not initialized")
                return None
            
            # Get default persona config
            persona_name = await get_current_persona_name()
            persona_config = await load_persona_config(persona_name)
            
            # Create a summarization prompt
            prompt = f"""Please provide a concise summary of the following news article. Focus on the key facts, main points, and important information. Keep the summary clear and informative, approximately 3-5 sentences.

Article URL: {url}

Article Content:
{article_content}

Summary:"""
            
            # Use the default persona settings or fallback to defaults
            if persona_config and "anthropic" in persona_config:
                anthropic_config = persona_config["anthropic"]
                model = anthropic_config.get("anthropic_model", "claude-3-5-haiku-20241022")
                system_prompt = anthropic_config.get("prompt_context", "")
                temperature = anthropic_config.get("temperature", 0.6)
                top_p = anthropic_config.get("top_p", 0.9)
                max_tokens = anthropic_config.get("max_tokens", 512)
            else:
                model = "claude-3-5-haiku-20241022"
                system_prompt = None
                temperature = 0.3
                top_p = 0.8
                max_tokens = 512
            
            # Build the API call parameters
            api_params = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
                "top_p": top_p,
            }
            
            if system_prompt:
                api_params["system"] = system_prompt
            
            # Generate summary using Anthropic API
            message = await self.async_client.messages.create(**api_params)
            
            # Extract the response text
            summary = ""
            if message.content:
                for content_block in message.content:
                    if content_block.type == "text":
                        summary += content_block.text
            
            return summary if summary else None
            
        except Exception as e:
            logger.error(f"Error summarizing article: {e}", exc_info=True)
            return None
    
    async def summarize_article_from_url(self, url: str) -> Dict[str, Any]:
        """
        Complete workflow: scrape article and generate summary.
        Returns a dictionary with 'summary' and 'error' keys.
        """
        try:
            # Validate URL
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return {
                    "success": False,
                    "error": "Invalid URL format"
                }
            
            # Scrape content
            logger.info(f"Scraping article from: {url}")
            content = await self.scrape_article_content(url)
            
            if not content:
                return {
                    "success": False,
                    "error": "Failed to scrape article content"
                }
            
            if len(content) < 100:
                return {
                    "success": False,
                    "error": "Article content too short or empty"
                }
            
            # Generate summary
            logger.info(f"Generating summary for article: {url}")
            summary = await self.summarize_article(url, content)
            
            if not summary:
                return {
                    "success": False,
                    "error": "Failed to generate summary"
                }
            
            return {
                "success": True,
                "summary": summary
            }
            
        except Exception as e:
            logger.error(f"Error in summarize_article_from_url: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
