import { useWeather } from '../hooks/useWeather';
import { WiDaySunny, WiNightClear, WiDayCloudy, WiNightAltCloudy, WiCloud, WiCloudy, 
         WiRain, WiDayRain, WiNightAltRain, WiThunderstorm, WiSnow, WiDaySnow, 
         WiNightAltSnow, WiFog, WiDayFog, WiNightFog, WiWindy, WiStrongWind,
         WiRaindrops, WiHumidity } from 'react-icons/wi';

// Map weather types/descriptions to icons
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

  const conditionText = weather.description 
    ? weather.weather_type 
      ? `${weather.description} (${weather.weather_type})`
      : weather.description
    : weather.weather_type || 'Data unavailable';

  const WeatherIcon = getWeatherIcon(weather.description, weather.weather_type);

  return (
    <div className="widget">
      <div className="widget-title">Weather</div>
      <div className="weather-main">
        <div className="weather-icon-container">
          <WeatherIcon className="weather-icon" />
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
            <div className="stat-box-value">{weather.wind_speed_kph} km/h</div>
          </div>
        )}
        {weather.wind_direction && 
         weather.wind_direction !== '-99' && 
         weather.wind_direction !== 'Direction not available' &&
         weather.wind_direction_full &&
         weather.wind_direction_full !== 'Direction not available' && (
          <div className="stat-box">
            <div className="stat-box-label">Wind Direction</div>
            <div className="stat-box-value">{weather.wind_direction}</div>
          </div>
        )}
        {weather.pressure !== null && weather.pressure !== undefined && (
          <div className="stat-box">
            <div className="stat-box-label">Pressure</div>
            <div className="stat-box-value">
              {weather.pressure} mb
              {weather.pressure_direction && weather.pressure_direction !== 'Not available' 
                ? ` (${weather.pressure_direction})` 
                : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
