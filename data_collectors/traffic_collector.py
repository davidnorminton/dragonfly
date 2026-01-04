"""Traffic conditions data collector using Waze API via RapidAPI."""
import logging
import httpx
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from data_collectors.base_collector import BaseCollector
from config.location_loader import load_location_config
import json
from pathlib import Path
import math

logger = logging.getLogger(__name__)


class TrafficCollector(BaseCollector):
    """Collects traffic condition data within a radius of the configured location using Waze API."""
    
    def __init__(self):
        super().__init__("traffic")
        self.location_config = load_location_config()
        self.api_key = self._get_rapidapi_key()
    
    def _get_rapidapi_key(self) -> Optional[str]:
        """Get RapidAPI key from config if available."""
        try:
            api_keys_path = Path(__file__).parent.parent / "config" / "api_keys.json"
            if api_keys_path.exists():
                with open(api_keys_path, 'r') as f:
                    api_keys = json.load(f)
                    # Try waze or rapidapi key
                    return (
                        api_keys.get("waze", {}).get("api_key") or
                        api_keys.get("rapidapi", {}).get("api_key") or
                        api_keys.get("waze", {}).get("rapidapi_key")
                    )
        except Exception as e:
            logger.warning(f"Could not load RapidAPI key: {e}")
        return None
    
    def get_data_type(self) -> str:
        """Return the data type identifier."""
        return "traffic_conditions"
    
    def _calculate_bounding_box(self, lat: float, lon: float, radius_miles: int) -> tuple:
        """
        Calculate bounding box coordinates for a given center point and radius.
        
        Args:
            lat: Center latitude
            lon: Center longitude
            radius_miles: Radius in miles
        
        Returns:
            Tuple of (bottom_left_lat, bottom_left_lon, top_right_lat, top_right_lon)
        """
        # Approximate: 1 degree latitude ≈ 69 miles
        # Longitude depends on latitude: 1 degree longitude ≈ 69 * cos(latitude) miles
        lat_offset = radius_miles / 69.0
        lon_offset = radius_miles / (69.0 * abs(math.cos(math.radians(lat))))
        
        bottom_left_lat = lat - lat_offset
        bottom_left_lon = lon - lon_offset
        top_right_lat = lat + lat_offset
        top_right_lon = lon + lon_offset
        
        return (bottom_left_lat, bottom_left_lon, top_right_lat, top_right_lon)
    
    async def _geocode_location(self, location_name: str) -> Optional[tuple]:
        """Geocode location name to get latitude and longitude using OpenStreetMap Nominatim (free)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = "https://nominatim.openstreetmap.org/search"
                params = {
                    "q": location_name,
                    "format": "json",
                    "limit": 1
                }
                headers = {
                    "User-Agent": "DragonflyHomeAssistant/1.0"  # Required by Nominatim
                }
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                if data and len(data) > 0:
                    location = data[0]
                    return (float(location["lat"]), float(location["lon"]))
                else:
                    logger.warning(f"Geocoding failed: No results found")
                    return None
        except Exception as e:
            logger.error(f"Error geocoding location: {e}", exc_info=True)
            return None
    
    async def _get_waze_traffic(self, lat: float, lon: float, radius_miles: int) -> Dict[str, Any]:
        """Get traffic data using Waze API via RapidAPI."""
        if not self.api_key:
            return None
        
        try:
            # Calculate bounding box
            bottom_left_lat, bottom_left_lon, top_right_lat, top_right_lon = self._calculate_bounding_box(
                lat, lon, radius_miles
            )
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = "https://waze.p.rapidapi.com/alerts-and-jams"
                params = {
                    "bottom_left": f"{bottom_left_lat},{bottom_left_lon}",
                    "top_right": f"{top_right_lat},{top_right_lon}",
                    "max_alerts": 20,
                    "max_jams": 20
                }
                headers = {
                    "x-rapidapi-host": "waze.p.rapidapi.com",
                    "x-rapidapi-key": self.api_key
                }
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                return data
        except httpx.HTTPStatusError as e:
            logger.error(f"Waze API HTTP error: {e.response.status_code} - {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"Error getting traffic from Waze API: {e}", exc_info=True)
            return None
    
    def _parse_waze_data(self, waze_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse Waze API response into structured traffic data."""
        if not waze_data:
            return None
        
        alerts = waze_data.get("alerts", [])
        jams = waze_data.get("jams", [])
        
        # Count alerts by type/severity
        alert_counts = {}
        major_count = 0
        moderate_count = 0
        minor_count = 0
        
        for alert in alerts:
            alert_type = alert.get("type", "unknown")
            alert_counts[alert_type] = alert_counts.get(alert_type, 0) + 1
            
            # Categorize by severity (Waze alert types)
            if alert_type in ["ACCIDENT", "HAZARD", "ROAD_CLOSED"]:
                major_count += 1
            elif alert_type in ["JAM", "CONSTRUCTION", "WEATHERHAZARD"]:
                moderate_count += 1
            else:
                minor_count += 1
        
        # Analyze jams
        jam_count = len(jams)
        if jam_count > 0:
            moderate_count += jam_count
        
        total_incidents = len(alerts) + jam_count
        
        # Determine overall status
        if total_incidents == 0:
            status = "Clear"
        elif major_count > 0:
            status = "Heavy traffic"
        elif moderate_count > 0:
            status = "Moderate traffic"
        else:
            status = "Light traffic"
        
        return {
            "alerts": alerts,
            "jams": jams,
            "alert_counts": alert_counts,
            "total_alerts": len(alerts),
            "total_jams": jam_count,
            "total_incidents": total_incidents,
            "severity_breakdown": {
                "major": major_count,
                "moderate": moderate_count,
                "minor": minor_count
            },
            "status": status
        }
    
    async def collect(self, radius_miles: int = 30) -> Dict[str, Any]:
        """
        Collect traffic condition data within the specified radius using Waze API.
        
        Args:
            radius_miles: Radius in miles to check for traffic conditions (default: 30)
        
        Returns:
            Dictionary containing traffic condition data
        """
        try:
            location_name = self.location_config.get("display_name", "Unknown")
            
            traffic_data = {
                "location": {
                    "name": location_name,
                    "radius_miles": radius_miles
                },
                "conditions": [],
                "summary": {
                    "total_incidents": 0,
                    "total_alerts": 0,
                    "total_jams": 0,
                    "severity_breakdown": {
                        "major": 0,
                        "moderate": 0,
                        "minor": 0
                    },
                    "average_speed": None,
                    "current_status": "No traffic data available",
                    "delay_seconds": None
                },
                "last_updated": datetime.utcnow().isoformat(),
                "api_status": "not_configured"
            }
            
            # Try to get real traffic data if RapidAPI key is available
            if self.api_key:
                traffic_data["api_status"] = "configured"
                
                # Geocode the location (using free Nominatim service)
                coordinates = await self._geocode_location(location_name)
                if coordinates:
                    lat, lon = coordinates
                    traffic_data["location"]["latitude"] = lat
                    traffic_data["location"]["longitude"] = lon
                    
                    # Get traffic data from Waze
                    waze_data = await self._get_waze_traffic(lat, lon, radius_miles)
                    if waze_data:
                        # Log raw Waze API response for debugging
                        logger.info("=== Raw Waze API Response ===")
                        logger.info(f"Full response: {json.dumps(waze_data, indent=2, default=str)}")
                        logger.info(f"Alerts count: {len(waze_data.get('alerts', []))}")
                        logger.info(f"Jams count: {len(waze_data.get('jams', []))}")
                        if waze_data.get('alerts'):
                            logger.info(f"Sample alert: {json.dumps(waze_data['alerts'][0] if waze_data['alerts'] else {}, indent=2, default=str)}")
                        if waze_data.get('jams'):
                            logger.info(f"Sample jam: {json.dumps(waze_data['jams'][0] if waze_data['jams'] else {}, indent=2, default=str)}")
                        logger.info("=============================")
                        
                        parsed_data = self._parse_waze_data(waze_data)
                        if parsed_data:
                            traffic_data["summary"]["current_status"] = parsed_data["status"]
                            traffic_data["summary"]["total_incidents"] = parsed_data["total_incidents"]
                            traffic_data["summary"]["total_alerts"] = parsed_data["total_alerts"]
                            traffic_data["summary"]["total_jams"] = parsed_data["total_jams"]
                            traffic_data["summary"]["severity_breakdown"] = parsed_data["severity_breakdown"]
                            
                            # Add conditions from alerts and jams
                            for alert in parsed_data["alerts"][:10]:  # Limit to top 10
                                traffic_data["conditions"].append({
                                    "type": "alert",
                                    "alert_type": alert.get("type"),
                                    "subtype": alert.get("subtype"),
                                    "location": {
                                        "lat": alert.get("location", {}).get("y"),
                                        "lon": alert.get("location", {}).get("x")
                                    }
                                })
                            
                            for jam in parsed_data["jams"][:10]:  # Limit to top 10
                                traffic_data["conditions"].append({
                                    "type": "jam",
                                    "delay": jam.get("delay"),
                                    "length": jam.get("length"),
                                    "speed": jam.get("speed"),
                                    "level": jam.get("level")
                                })
            
            logger.info(f"Collected traffic data for location: {location_name}")
            
            return {
                "source": self.get_source(),
                "data_type": self.get_data_type(),
                "data": traffic_data
            }
            
        except Exception as e:
            logger.error(f"Error collecting traffic data: {e}", exc_info=True)
            return {
                "error": str(e),
                "source": self.get_source(),
                "data_type": self.get_data_type()
            }
