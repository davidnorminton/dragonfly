import { useWeather } from '../hooks/useWeather';
import { WiDaySunny, WiNightClear, WiDayCloudy, WiNightAltCloudy, WiCloud, WiCloudy, 
         WiRain, WiDayRain, WiNightAltRain, WiThunderstorm, WiSnow, WiDaySnow, 
         WiNightAltSnow, WiFog, WiDayFog, WiNightFog, WiWindy, WiStrongWind,
         WiRaindrops, WiHumidity } from 'react-icons/wi';

// Get OpenWeatherMap icon URL
const getWeatherIconUrl = (iconCode) => {
  if (!iconCode) return null;
  // OpenWeatherMap icon URLs format: https://openweathermap.org/img/wn/{icon}@2x.png
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
};

// Map weather types/descriptions to icons (fallback if no icon URL)
const getWeatherIcon = (description, weatherType) => {
  if (!description && !weatherType) return WiDaySunny;
  
  const desc = (description || '').toLowerCase();
  const type = (weatherType || '').toLowerCase();
  
  // Clear/Sunny
  if (desc.includes('clear') || desc.includes('sunny') || type.includes('clear') || type.includes('sunny')) {
    return WiDaySunny;
  }
  
  // Cloudy
  if (desc.includes('cloudy') || type.includes('cloudy')) {
    if (desc.includes('partly') || type.includes('partly')) {
      return WiDayCloudy;
    }
    return WiCloudy;
  }
  
  // Rain
  if (desc.includes('rain') || type.includes('rain') || desc.includes('drizzle') || type.includes('drizzle')) {
    if (desc.includes('heavy') || desc.includes('shower')) {
      return WiRain;
    }
    return WiDayRain;
  }
  
  // Thunderstorm
  if (desc.includes('thunder') || desc.includes('storm') || type.includes('thunder') || type.includes('storm')) {
    return WiThunderstorm;
  }
  
  // Snow
  if (desc.includes('snow') || type.includes('snow') || desc.includes('sleet') || type.includes('sleet')) {
    return WiDaySnow;
  }
  
  // Fog/Mist
  if (desc.includes('fog') || desc.includes('mist') || type.includes('fog') || type.includes('mist')) {
    return WiDayFog;
  }
  
  // Windy
  if (desc.includes('wind') || type.includes('wind')) {
    return WiWindy;
  }
  
  // Default to partly cloudy
  return WiDayCloudy;
};

export function Weather() {
  const { weather } = useWeather();

  if (!weather) {
    return (
      <div className="widget">
        <div className="widget-title">Weather</div>
        <div>Loading...</div>
      </div>
    );
  }

  const conditionText = weather.description || weather.weather_main || 'Data unavailable';
  
  // Get weather icon URL if available, otherwise use fallback icon component
  const weatherIconUrl = getWeatherIconUrl(weather.weather_icon);
  const WeatherIcon = getWeatherIcon(weather.description, weather.weather_type);

  return (
    <div className="widget">
      <div className="weather-main">
        <div className="weather-icon-container">
          {weatherIconUrl ? (
            <img 
              src={weatherIconUrl} 
              alt={conditionText}
              className="weather-icon-image"
              onError={(e) => {
                // Fallback to icon component if image fails to load
                e.target.style.display = 'none';
                const fallback = e.target.nextSibling;
                if (fallback) fallback.style.display = 'block';
              }}
            />
          ) : null}
          <WeatherIcon 
            className="weather-icon" 
            style={{ display: weatherIconUrl ? 'none' : 'block' }}
          />
        </div>
        <div className="weather-info">
          <div className="weather-temp">
            {weather.temperature !== null && weather.temperature !== undefined 
              ? `${weather.temperature}°C` 
              : '--°C'}
          </div>
          <div className="weather-condition">{conditionText}</div>
        </div>
      </div>
      <div className="stat-boxes">
        {weather.humidity !== null && weather.humidity !== undefined && (
          <div className="stat-box">
            <div className="stat-box-label">Humidity</div>
            <div className="stat-box-value">{weather.humidity}%</div>
          </div>
        )}
        {weather.wind_speed_kph !== null && weather.wind_speed_kph !== undefined && weather.wind_speed_kph > 0 && (
          <div className="stat-box">
            <div className="stat-box-label">Wind Speed</div>
            <div className="stat-box-value">
              {weather.wind_speed_kph} km/h
            </div>
          </div>
        )}
        {weather.wind_direction && 
         weather.wind_direction !== '-99' && 
         weather.wind_direction !== 'Direction not available' && (
          <div className="stat-box">
            <div className="stat-box-label">Wind Direction</div>
            <div className="stat-box-value">
              {weather.wind_direction_full || weather.wind_direction}
            </div>
          </div>
        )}
        {weather.visibility_km !== null && weather.visibility_km !== undefined && (
          <div className="stat-box">
            <div className="stat-box-label">Visibility</div>
            <div className="stat-box-value">{weather.visibility_km} km</div>
          </div>
        )}
        {weather.cloud_coverage !== null && weather.cloud_coverage !== undefined && (
          <div className="stat-box">
            <div className="stat-box-label">Clouds</div>
            <div className="stat-box-value">{weather.cloud_coverage}%</div>
          </div>
        )}
        {(weather.snow_3h !== null && weather.snow_3h !== undefined && weather.snow_3h > 0) && (
          <div className="stat-box">
            <div className="stat-box-label">Snow (3h)</div>
            <div className="stat-box-value">{weather.snow_3h} mm</div>
          </div>
        )}
      </div>
    </div>
  );
}
