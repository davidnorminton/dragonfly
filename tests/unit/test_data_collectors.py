"""Unit tests for data collectors."""
import pytest
from unittest.mock import Mock, patch, AsyncMock
from data_collectors.weather_collector import WeatherCollector
from data_collectors.news_collector import NewsCollector
from data_collectors.traffic_collector import TrafficCollector


class TestWeatherCollector:
    """Test cases for WeatherCollector."""
    
    @pytest.fixture
    def weather_collector(self):
        """Create a WeatherCollector instance."""
        return WeatherCollector()
    
    def test_init(self, weather_collector):
        """Test WeatherCollector initialization."""
        assert weather_collector.name == "weather"
        assert weather_collector.get_source() == "weather"
        assert weather_collector.get_data_type() == "weather_current"
    
    @pytest.mark.asyncio
    @patch('data_collectors.weather_collector.httpx.AsyncClient')
    async def test_collect_weather_data(self, mock_client, weather_collector, mock_api_keys):
        """Test collecting weather data."""
        # Mock API response
        mock_response = AsyncMock()
        mock_response.json.return_value = {
            "data": {
                "temperature": 20,
                "description": "Sunny"
            }
        }
        mock_response.status_code = 200
        
        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        
        with patch('config.api_key_loader.load_api_keys', return_value=mock_api_keys):
            result = await weather_collector.collect()
            
            assert result is not None
            assert "data" in result or "temperature" in str(result)


class TestNewsCollector:
    """Test cases for NewsCollector."""
    
    @pytest.fixture
    def news_collector(self):
        """Create a NewsCollector instance."""
        return NewsCollector()
    
    def test_init(self, news_collector):
        """Test NewsCollector initialization."""
        assert news_collector.name == "news"
        assert news_collector.get_source() == "news"
        # data_type comes from get_data_type() method
        assert news_collector.get_data_type() == "news_feed"
    
    @pytest.mark.asyncio
    @patch('data_collectors.news_collector.httpx.AsyncClient')
    async def test_collect_news_data(self, mock_client, news_collector):
        """Test collecting news data."""
        # Mock RSS feed response
        mock_response = AsyncMock()
        mock_response.text = """<?xml version="1.0"?>
        <rss>
            <channel>
                <item>
                    <title>Test News</title>
                    <description>Test description</description>
                    <link>https://example.com/news</link>
                    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
                </item>
            </channel>
        </rss>"""
        mock_response.status_code = 200
        
        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        
        result = await news_collector.collect()
        
        assert result is not None
        # News collector returns data nested in "data" key
        assert "data" in result
        assert "articles" in result.get("data", {}) or "article_count" in result.get("data", {})


class TestTrafficCollector:
    """Test cases for TrafficCollector."""
    
    @pytest.fixture
    def traffic_collector(self):
        """Create a TrafficCollector instance."""
        return TrafficCollector()
    
    def test_init(self, traffic_collector):
        """Test TrafficCollector initialization."""
        assert traffic_collector.name == "traffic"
        assert traffic_collector.get_source() == "traffic"
        # data_type comes from get_data_type() method
        assert traffic_collector.get_data_type() == "traffic_conditions"
    
    @pytest.mark.asyncio
    @patch('data_collectors.traffic_collector.httpx.AsyncClient')
    async def test_collect_traffic_data(self, mock_client, traffic_collector, mock_api_keys):
        """Test collecting traffic data."""
        # Mock API response
        mock_response = AsyncMock()
        mock_response.json.return_value = {
            "alerts": [],
            "jams": [],
            "total_incidents": 0
        }
        mock_response.status_code = 200
        
        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        
        with patch('config.api_key_loader.load_api_keys', return_value=mock_api_keys):
            with patch('data_collectors.traffic_collector.load_location_config', return_value={"location": "Test"}):
                result = await traffic_collector.collect()
                
                assert result is not None
                assert "alerts" in result or "jams" in result

