import { fetchJson } from '../utils/http.js';

// Timezone constant - always use Vienna time
const TIMEZONE = 'Europe/Vienna';

// WMO Weather code descriptions
const WEATHER_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

// Type definitions
export interface WeatherForecast {
  location: {
    latitude: number;
    longitude: number;
  };
  timezone: string;
  forecasts: ForecastInterval[];
}

export interface ForecastInterval {
  time: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  weatherDescription: string;
  cloudCover: number;
  visibility: number;
  isDay: boolean;
  conditions: {
    snow: boolean;
    rain: boolean;
    ice: boolean;
    sunny: boolean;
    cloudy: boolean;
  };
}

interface CacheEntry {
  timestamp: number;
  data: WeatherForecast;
}

const weatherCache = new Map<string, CacheEntry>();
const failedRequests = new Map<string, { timestamp: number; error: any }>();
const inFlightRequests = new Map<string, Promise<WeatherForecast>>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const FAILURE_TTL = 15 * 1000; // Cache errors/failures for 15 seconds (shorter for faster recovery)

// Check failure cache (negative caching)
export function getWeatherStatus() {
  const lastEntry = Array.from(weatherCache.values()).pop();
  const lastFailure = Array.from(failedRequests.values()).pop();
  return {
    provider: 'Open-Meteo',
    cachedEntries: weatherCache.size,
    lastSuccess: lastEntry ? new Date(lastEntry.timestamp).toISOString() : null,
    lastError: lastFailure ? String(lastFailure.error?.message || lastFailure.error) : null,
    status: lastFailure && (Date.now() - lastFailure.timestamp < FAILURE_TTL) ? 'error' : 'ok',
  };
}

// Main function to fetch weather forecast (cached and deduplicated)
export async function fetchWeatherForecast(lat: number, lon: number): Promise<WeatherForecast> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  // 1. Check in-memory cache
  const cached = weatherCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Weather Cache] Cache hit for key: ${key}`);
    return cached.data;
  }

  // Check failure cache (negative caching)
  const failed = failedRequests.get(key);
  if (failed && (Date.now() - failed.timestamp < FAILURE_TTL)) {
    console.log(`[Weather Cache] Failure cache hit for key: ${key}. Re-throwing cached error.`);
    throw failed.error;
  }

  // 2. Check in-flight requests (deduplication)
  let promise = inFlightRequests.get(key);
  if (promise) {
    console.log(`[Weather Cache] Reusing in-flight request for key: ${key}`);
    return promise;
  }

  // 3. Make request and manage maps
  console.log(`[Weather Cache] Cache miss. Fetching from OpenMeteo for key: ${key}`);
  promise = fetchWeatherForecastFromApi(lat, lon);
  inFlightRequests.set(key, promise);

  try {
    const forecast = await promise;
    weatherCache.set(key, {
      timestamp: Date.now(),
      data: forecast
    });
    failedRequests.delete(key); // clear failure cache on success
    return forecast;
  } catch (error: any) {
    failedRequests.set(key, {
      timestamp: Date.now(),
      error: error
    });
    throw error;
  } finally {
    inFlightRequests.delete(key);
  }
}

// Internal helper to fetch from OpenMeteo
async function fetchWeatherForecastFromApi(lat: number, lon: number): Promise<WeatherForecast> {
  try {
    // Build OpenMeteo API URL
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      hourly: [
        'temperature_2m',
        'apparent_temperature',
        'weather_code',
        'cloud_cover',
        'wind_speed_10m',
        'is_day'
      ].join(','),
      timezone: TIMEZONE,
      forecast_days: '1'
    });
    
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    
    // Fetch data from OpenMeteo (with rate-limit detection for automatic retry)
    const data = await fetchJson(url, 30000, 3, 2000, (responseData) => {
      if (responseData?.error) {
        const reason = responseData.reason || 'Unknown API error';
        throw new Error(`OpenMeteo rate limited: ${reason}`);
      }
    });
    
    // OpenMeteo returns HTTP 200 with {"error":true,"reason":"..."} on rate-limit/errors
    if (data.error) {
      const reason = data.reason || 'Unknown API error';
      console.warn(`[Weather] OpenMeteo returned error: ${reason}`);
      if (reason.toLowerCase().includes('concurrent') || reason.toLowerCase().includes('rate') || reason.toLowerCase().includes('too many')) {
        throw new Error(`Weather API rate limited: ${reason}`);
      }
      throw new Error(`Weather API error: ${reason}`);
    }
    
    if (!data.hourly) {
      throw new Error('Invalid weather data: missing hourly field');
    }
    
    // Get current time in Vienna timezone
    const now = new Date();
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const endOfDay = new Date(viennaTime);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Process hourly data into 2-hour intervals
    const forecasts: ForecastInterval[] = [];
    const hourly = data.hourly;
    
    for (let i = 0; i < hourly.time.length; i++) {
      // Only include even hours (0, 2, 4, 6, etc.) for 2-hour intervals
      const hour = new Date(hourly.time[i]).getHours();
      if (hour % 2 !== 0) continue;
      
      // Parse the forecast time
      const forecastTime = new Date(hourly.time[i]);
      
      // Only include times from now until end of day
      if (forecastTime < viennaTime || forecastTime > endOfDay) {
        continue;
      }
      
      const weatherCode = hourly.weather_code[i];
      const temperature = hourly.temperature_2m[i];
      const cloudCover = hourly.cloud_cover[i];
      const isDay = hourly.is_day[i] === 1;
      
      // Calculate condition flags
      const conditions = {
        snow: weatherCode >= 71 && weatherCode <= 77,
        rain: (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82),
        ice: temperature <= 0,
        sunny: cloudCover < 20 && isDay,
        cloudy: cloudCover >= 50
      };
      
      forecasts.push({
        time: hourly.time[i],
        temperature: temperature,
        feelsLike: hourly.apparent_temperature[i],
        humidity: 0,
        windSpeed: hourly.wind_speed_10m[i],
        windDirection: 0,
        windGusts: 0,
        precipitation: 0,
        precipitationProbability: 0,
        weatherCode: weatherCode,
        weatherDescription: WEATHER_CODE_MAP[weatherCode] || 'Unknown',
        cloudCover: cloudCover,
        visibility: 10000,
        isDay: isDay,
        conditions: conditions
      });
    }
    
    return {
      location: {
        latitude: lat,
        longitude: lon
      },
      timezone: TIMEZONE,
      forecasts: forecasts
    };
    
  } catch (error: any) {
    console.error('Weather API error:', error.message || error);
    // Preserve specific error messages for rate-limiting and known issues
    if (error.message?.includes('rate limited') || error.message?.includes('Rate limited')) {
      throw error; // Preserve the rate-limit message for better debugging
    }
    if (error.message?.includes('timeout')) {
      throw new Error('Weather service timeout');
    }
    if (error.message?.includes('Invalid') || error.message?.includes('missing')) {
      throw new Error('Invalid weather data');
    }
    if (error.message?.includes('Weather API error')) {
      throw error; // Preserve specific API errors
    }
    throw new Error('Weather service unavailable');
  }
}
