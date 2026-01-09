"""Weather data collector using RapidAPI Open Weather API."""
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import httpx
from data_collectors.base_collector import BaseCollector
from config.location_loader import load_location_config
from config.api_key_loader import load_api_keys
import json
from pathlib import Path

logger = logging.getLogger(__name__)


class WeatherCollector(BaseCollector):
    """Collects weather data from RapidAPI Open Weather API."""
    
    def __init__(self):
        super().__init__("weather")
        # Use open-weather13 API forecast endpoint - we'll extract current weather from it
        # The API structure matches OpenWeatherMap, so we can restructure the response
        self.base_url = "https://open-weather13.p.rapidapi.com/fivedaysforcast"
        self.location_config = None  # Will be loaded asynchronously
        self.api_key = None
    
    async def _get_rapidapi_key(self) -> Optional[str]:
        """Get RapidAPI key from database."""
        try:
            api_keys = await load_api_keys()
            rapidapi_config = api_keys.get("rapidapi", {})
            api_key = rapidapi_config.get("api_key")
            
            if api_key:
                logger.info("Loaded RapidAPI key from database")
                return api_key
            
            logger.warning("RapidAPI key not found")
            return None
        except Exception as e:
            logger.error(f"Error loading RapidAPI key: {e}")
            return None
    
    async def _get_coordinates(self) -> tuple[Optional[float], Optional[float]]:
        """Get latitude and longitude from location config."""
        try:
            if self.location_config is None:
                self.location_config = await load_location_config() or {}
            
            # Check direct keys first (they should be in the config dict)
            latitude = self.location_config.get("latitude")
            longitude = self.location_config.get("longitude")
            if latitude and longitude:
                try:
                    return float(latitude), float(longitude)
                except (ValueError, TypeError):
                    pass
            
            # Check if coordinates are in extra_data (for database-stored configs)
            extra_data = self.location_config.get("extra_data")
            if isinstance(extra_data, dict):
                latitude = extra_data.get("latitude")
                longitude = extra_data.get("longitude")
                if latitude and longitude:
                    try:
                        return float(latitude), float(longitude)
                    except (ValueError, TypeError):
                        pass
            
            # Default to coordinates for Sherburn in Elmet, Leeds
            logger.info("Using default coordinates for Sherburn in Elmet")
            return 53.79764, -1.25194  # Sherburn in Elmet coordinates
        except Exception as e:
            logger.error(f"Error getting coordinates: {e}")
            return 53.79764, -1.25194  # Fallback to default
    
    def get_data_type(self) -> str:
        """Return the data type identifier."""
        return "weather_current"
    
    async def collect(self) -> Dict[str, Any]:
        """
        Collect current weather data for the configured location using RapidAPI Open Weather.
        
        Returns:
            Dictionary containing weather data
        """
        try:
            # Load API key
            if self.api_key is None:
                self.api_key = await self._get_rapidapi_key()
            
            if not self.api_key:
                logger.error("RapidAPI key not configured")
                return {
                    "error": "RapidAPI key not configured",
                    "source": self.get_source(),
                    "data_type": self.get_data_type()
                }
            
            # Load location config and get coordinates
            if self.location_config is None:
                self.location_config = await load_location_config() or {}
            
            latitude, longitude = await self._get_coordinates()
            
            if not latitude or not longitude:
                logger.error("Coordinates not configured")
                return {
                    "error": "Coordinates not configured",
                    "source": self.get_source(),
                    "data_type": self.get_data_type()
                }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = self.base_url
                headers = {
                    "x-rapidapi-host": "open-weather13.p.rapidapi.com",
                    "x-rapidapi-key": self.api_key
                }
                # Use lat/lon parameters for current weather endpoint
                params = {
                    "latitude": latitude,
                    "longitude": longitude,
                    "lang": "EN"
                }
                
                logger.info(f"Fetching weather data from RapidAPI for lat={latitude}, lon={longitude}")
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                
                data = response.json()
                
                # Log all API data to console
                import json
                logger.info("=" * 80)
                logger.info("OPEN WEATHER API - FULL RESPONSE DATA:")
                logger.info("=" * 80)
                logger.info(json.dumps(data, indent=2, default=str))
                logger.info("=" * 80)
                print("=" * 80)
                print("OPEN WEATHER API - FULL RESPONSE DATA:")
                print("=" * 80)
                print(json.dumps(data, indent=2, default=str))
                print("=" * 80)
                
                # Check if this is a forecast response (has "list") or current weather (has "main" at root)
                if "list" in data:
                    # This is a forecast response - extract current weather from first item
                    forecast_list = data.get("list", [])
                    if not forecast_list:
                        logger.warning("No forecast data found in RapidAPI response")
                        return {
                            "error": "No weather data available",
                            "source": self.get_source(),
                            "data_type": self.get_data_type()
                        }
                    
                    # Get current weather (first forecast entry) and restructure to match current weather format
                    current = forecast_list[0]
                    main_data = current.get("main", {})
                    weather_info = current.get("weather", [{}])[0] if current.get("weather") else {}
                    wind_data = current.get("wind", {})
                    clouds_data = current.get("clouds", {})
                    coord_data = data.get("city", {}).get("coord", {}) if data.get("city") else {}
                    # For forecast, we don't have sys data, so create minimal structure
                    sys_data = current.get("sys", {})
                    dt = current.get("dt")
                elif "main" in data:
                    # This is a current weather response - data is at root level
                    if data.get("cod") != 200:
                        logger.warning(f"Open Weather API returned error code: {data.get('cod')}")
                        return {
                            "error": f"API error: {data.get('message', 'Unknown error')}",
                            "source": self.get_source(),
                            "data_type": self.get_data_type()
                        }
                    
                    main_data = data.get("main", {})
                    weather_info = data.get("weather", [{}])[0] if data.get("weather") else {}
                    wind_data = data.get("wind", {})
                    clouds_data = data.get("clouds", {})
                    coord_data = data.get("coord", {})
                    sys_data = data.get("sys", {})
                    dt = data.get("dt")
                else:
                    logger.error("Unexpected API response structure")
                    return {
                        "error": "Unexpected API response structure",
                        "source": self.get_source(),
                        "data_type": self.get_data_type()
                    }
                
                # Extract temperature (Open Weather API uses Fahrenheit for current endpoint, but check if it's Kelvin)
                # The API might return in different units, check the value to determine
                temp_raw = main_data.get("temp")
                # If temp is > 200, it's likely Kelvin, otherwise it might be Fahrenheit or Celsius
                if temp_raw and temp_raw > 200:
                    # Likely Kelvin
                    temp_c = round(temp_raw - 273.15, 1)
                    temp_f = round((temp_raw - 273.15) * 9/5 + 32, 1)
                elif temp_raw and temp_raw < 100:
                    # Likely Celsius (or very cold Fahrenheit)
                    temp_c = round(temp_raw, 1)
                    temp_f = round(temp_raw * 9/5 + 32, 1)
                else:
                    # Likely Fahrenheit
                    temp_f = round(temp_raw, 1)
                    temp_c = round((temp_raw - 32) * 5/9, 1)
                
                feels_like_raw = main_data.get("feels_like")
                if feels_like_raw:
                    if feels_like_raw > 200:
                        feels_like_c = round(feels_like_raw - 273.15, 1)
                    elif feels_like_raw < 100:
                        feels_like_c = round(feels_like_raw, 1)
                    else:
                        feels_like_c = round((feels_like_raw - 32) * 5/9, 1)
                else:
                    feels_like_c = temp_c
                
                temp_min_raw = main_data.get("temp_min")
                if temp_min_raw:
                    if temp_min_raw > 200:
                        temp_min_c = round(temp_min_raw - 273.15, 1)
                    elif temp_min_raw < 100:
                        temp_min_c = round(temp_min_raw, 1)
                    else:
                        temp_min_c = round((temp_min_raw - 32) * 5/9, 1)
                else:
                    temp_min_c = None
                
                temp_max_raw = main_data.get("temp_max")
                if temp_max_raw:
                    if temp_max_raw > 200:
                        temp_max_c = round(temp_max_raw - 273.15, 1)
                    elif temp_max_raw < 100:
                        temp_max_c = round(temp_max_raw, 1)
                    else:
                        temp_max_c = round((temp_max_raw - 32) * 5/9, 1)
                else:
                    temp_max_c = None
                
                # Extract wind data
                wind_speed_ms = wind_data.get("speed", 0)  # m/s
                wind_speed_kph = round(wind_speed_ms * 3.6, 1) if wind_speed_ms else 0
                wind_speed_mph = round(wind_speed_ms * 2.237, 1) if wind_speed_ms else 0
                wind_direction_deg = wind_data.get("deg")
                wind_gust_ms = wind_data.get("gust", 0)  # m/s
                wind_gust_kph = round(wind_gust_ms * 3.6, 1) if wind_gust_ms else 0
                wind_direction = self._degrees_to_direction(wind_direction_deg) if wind_direction_deg else ""
                
                # Extract weather icon code
                weather_icon = weather_info.get("icon", "")
                
                # Extract visibility (convert from meters to km)
                # For forecast response, visibility is in the current item, for current weather it's at root
                visibility_m = current.get("visibility", 0) if "list" in data else data.get("visibility", 0)
                visibility_km = round(visibility_m / 1000, 1) if visibility_m else None
                
                # Extract cloud coverage
                cloud_coverage = clouds_data.get("all", 0)  # percentage
                
                # Extract location info from API response
                # For forecast response, city info is in data.city, for current weather it's at root
                if "list" in data:
                    city_info = data.get("city", {})
                    api_city = city_info.get("name", "")
                    api_country = city_info.get("country", "")
                else:
                    api_city = data.get("name", "")
                    api_country = sys_data.get("country", "")
                
                # Extract and format relevant weather data
                weather_data = {
                    "temperature": temp_c,
                    "temperature_f": temp_f,
                    "temperature_min": temp_min_c,
                    "temperature_max": temp_max_c,
                    "feels_like": feels_like_c,
                    "humidity": main_data.get("humidity"),
                    "pressure": main_data.get("pressure"),  # hPa (same as mb)
                    "pressure_sea_level": main_data.get("sea_level"),
                    "pressure_ground_level": main_data.get("grnd_level"),
                    "pressure_direction": "",  # Not provided by current weather API
                    "description": weather_info.get("description", ""),
                    "weather_type": str(weather_info.get("id", "")),  # Weather condition ID
                    "weather_main": weather_info.get("main", ""),  # Main weather category (Rain, Snow, etc.)
                    "weather_icon": weather_icon,  # Icon code for OpenWeatherMap icons
                    "wind_speed": round(wind_speed_ms, 1) if wind_speed_ms else 0,
                    "wind_speed_mph": wind_speed_mph,
                    "wind_speed_kph": wind_speed_kph,
                    "wind_gust_kph": wind_gust_kph,
                    "wind_direction": wind_direction,
                    "wind_direction_full": self._degrees_to_direction_full(wind_direction_deg) if wind_direction_deg else "",
                    "wind_direction_degrees": wind_direction_deg,
                    "visibility": visibility_m,  # meters
                    "visibility_km": visibility_km,  # kilometers
                    "cloud_coverage": cloud_coverage,  # percentage
                    "location": {
                        "city": api_city or self.location_config.get("city", ""),
                        "region": self.location_config.get("region", ""),
                        "postcode": self.location_config.get("postcode", ""),
                        "country": api_country,
                        "latitude": coord_data.get("lat") or latitude,
                        "longitude": coord_data.get("lon") or longitude,
                        "display_name": api_city or self.location_config.get("display_name", "")
                    },
                    "observed_at": datetime.fromtimestamp(dt).isoformat() if dt else datetime.utcnow().isoformat(),
                    "sunrise": datetime.fromtimestamp(sys_data.get("sunrise", 0)).isoformat() if sys_data.get("sunrise") else (datetime.fromtimestamp(data.get("city", {}).get("sunrise", 0)).isoformat() if "list" in data and data.get("city", {}).get("sunrise") else None),
                    "sunset": datetime.fromtimestamp(sys_data.get("sunset", 0)).isoformat() if sys_data.get("sunset") else (datetime.fromtimestamp(data.get("city", {}).get("sunset", 0)).isoformat() if "list" in data and data.get("city", {}).get("sunset") else None),
                    "timezone": data.get("timezone") or (data.get("city", {}).get("timezone") if "list" in data else None),  # Timezone offset in seconds
                    "collected_at": datetime.utcnow().isoformat(),
                    "raw_data": current if "list" in data else data  # Keep raw data for reference (current weather item or full response)
                }
                
                logger.info(f"Collected RapidAPI weather data: {weather_data.get('temperature')}°C, {weather_data.get('description')}")
                
                return {
                    "source": self.get_source(),
                    "data_type": self.get_data_type(),
                    "data": weather_data
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching RapidAPI weather data: {e.response.status_code} - {e.response.text}")
            return {
                "error": f"HTTP error: {e.response.status_code}",
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
        except Exception as e:
            logger.error(f"Error collecting RapidAPI weather data: {e}", exc_info=True)
            return {
                "error": str(e),
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
    
    def _degrees_to_direction(self, degrees: Optional[float]) -> str:
        """Convert wind direction in degrees to cardinal direction."""
        if degrees is None:
            return ""
        directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                     "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        index = int((degrees + 11.25) / 22.5) % 16
        return directions[index]
    
    def _degrees_to_direction_full(self, degrees: Optional[float]) -> str:
        """Convert wind direction in degrees to full direction name."""
        if degrees is None:
            return ""
        directions = ["North", "North-Northeast", "Northeast", "East-Northeast",
                     "East", "East-Southeast", "Southeast", "South-Southeast",
                     "South", "South-Southwest", "Southwest", "West-Southwest",
                     "West", "West-Northwest", "Northwest", "North-Northwest"]
        index = int((degrees + 11.25) / 22.5) % 16
        return directions[index]
