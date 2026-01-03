"""Weather data collector using BBC Weather API."""
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import httpx
from data_collectors.base_collector import BaseCollector
from config.location_loader import load_location_config
import json
from pathlib import Path

logger = logging.getLogger(__name__)


class WeatherCollector(BaseCollector):
    """Collects weather data from BBC Weather API."""
    
    def __init__(self):
        super().__init__("weather")
        self.base_url = "https://weather-broker-cdn.api.bbci.co.uk/en/observation"
        self.location_config = load_location_config()
        self.location_id = self._get_location_id()
    
    def _get_location_id(self) -> Optional[str]:
        """Get BBC Weather location ID from config or use default for Leeds area."""
        try:
            api_keys_path = Path(__file__).parent.parent / "config" / "api_keys.json"
            if api_keys_path.exists():
                with open(api_keys_path, 'r') as f:
                    api_keys = json.load(f)
                    location_id = api_keys.get("bbc_weather", {}).get("location_id")
                    if location_id:
                        return str(location_id)
            
            # Default location ID for Leeds (2637891) - can be overridden in config
            # To find your location ID: search on bbc.co.uk/weather and check the URL
            logger.info("Using default location ID for Leeds area")
            return "2637891"  # Leeds location ID
        except Exception as e:
            logger.error(f"Error loading location ID: {e}")
            return "2637891"  # Fallback to Leeds
    
    def get_data_type(self) -> str:
        """Return the data type identifier."""
        return "weather_current"
    
    async def collect(self) -> Dict[str, Any]:
        """
        Collect current weather data for the configured location.
        
        Returns:
            Dictionary containing weather data
        """
        if not self.location_id:
            logger.error("BBC Weather location ID not configured")
            return {
                "error": "Location ID not configured",
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"{self.base_url}/{self.location_id}"
                response = await client.get(url)
                response.raise_for_status()
                
                data = response.json()
                
                # BBC Weather API structure
                observations = data.get("observations", [])
                if not observations:
                    logger.warning("No observations found in BBC Weather response")
                    return {
                        "error": "No weather data available",
                        "source": self.get_source(),
                        "data_type": self.get_data_type()
                    }
                
                # Get the latest observation
                latest = observations[0]
                
                # Extract temperature (BBC uses "C" for Celsius)
                temp_c = latest.get("temperature", {}).get("C")
                temp_f = latest.get("temperature", {}).get("F")
                
                # Extract wind data
                wind = latest.get("wind", {})
                wind_speed_mph = wind.get("windSpeedMph", 0)
                wind_speed_kph = wind.get("windSpeedKph", 0)
                wind_direction = wind.get("windDirection", "")
                
                # Extract and format relevant weather data
                weather_data = {
                    "temperature": temp_c,
                    "temperature_f": temp_f,
                    "humidity": latest.get("humidityPercent"),
                    "pressure": latest.get("pressureMb"),
                    "pressure_direction": latest.get("pressureDirection", ""),
                    "description": latest.get("weatherTypeText", ""),
                    "weather_type": latest.get("weatherType"),
                    "wind_speed": round(wind_speed_kph / 3.6, 1) if wind_speed_kph else 0,  # Convert kph to m/s
                    "wind_speed_mph": wind_speed_mph,
                    "wind_speed_kph": wind_speed_kph,
                    "wind_direction": wind_direction,
                    "wind_direction_full": wind.get("windDirectionFull", ""),
                    "visibility": latest.get("visibility", ""),
                    "location": {
                        "city": self.location_config.get("city", ""),
                        "region": self.location_config.get("region", ""),
                        "postcode": self.location_config.get("postcode", ""),
                        "location_id": self.location_id,
                        "station_name": data.get("station", {}).get("name", ""),
                        "station_distance_km": data.get("station", {}).get("distance", {}).get("km")
                    },
                    "observed_at": latest.get("localDate", "") + " " + latest.get("localTime", ""),
                    "collected_at": datetime.utcnow().isoformat(),
                    "raw_data": latest  # Keep raw data for reference
                }
                
                # Calculate feels like temperature (simple approximation if not provided)
                # BBC doesn't always provide feels like, so we'll use temperature for now
                weather_data["feels_like"] = temp_c
                
                logger.info(f"Collected BBC weather data: {weather_data.get('temperature')}°C, {weather_data.get('description')}")
                
                return {
                    "source": self.get_source(),
                    "data_type": self.get_data_type(),
                    "data": weather_data
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching BBC weather data: {e.response.status_code} - {e.response.text}")
            return {
                "error": f"HTTP error: {e.response.status_code}",
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
        except Exception as e:
            logger.error(f"Error collecting BBC weather data: {e}", exc_info=True)
            return {
                "error": str(e),
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
