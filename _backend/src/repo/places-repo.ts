import { fetchJson } from '../utils/http.js';

// Type definition
export interface PlaceResult {
  place: string;
  formattedAddress: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

export interface AutocompleteResult {
  description: string;
  place_id: string;
}

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

interface FailureEntry {
  timestamp: number;
  error: Error;
}

const GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AUTOCOMPLETE_CACHE_TTL = 60 * 60 * 1000;  // 1 hour
const FAILURE_TTL = 15 * 1000;                  // 15 seconds
const MAX_CACHE_ENTRIES = 500;

const geocodeCache = new Map<string, CacheEntry<PlaceResult>>();
const geocodeFailed = new Map<string, FailureEntry>();
const geocodeInFlight = new Map<string, Promise<PlaceResult>>();

const autocompleteCache = new Map<string, CacheEntry<AutocompleteResult[]>>();
const autocompleteFailed = new Map<string, FailureEntry>();
const autocompleteInFlight = new Map<string, Promise<AutocompleteResult[]>>();

function normalizeKey(input: string): string {
  return input.trim().toLowerCase();
}

export function getPlacesStatus() {
  const hasKey = Boolean(process.env.GOOGLE_KEY);
  const lastFailure = Array.from(geocodeFailed.values()).pop();
  return {
    provider: 'Google Maps / Places',
    keyConfigured: hasKey,
    cachedEntries: geocodeCache.size + autocompleteCache.size,
    lastError: lastFailure ? String(lastFailure.error?.message || lastFailure.error) : null,
    status: !hasKey ? 'missing_key' : (lastFailure && (Date.now() - lastFailure.timestamp < FAILURE_TTL) ? 'error' : 'ok'),
  };
}

function setBoundedCache<T>(map: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, entry);
}

// Main function to geocode a place name (cached and deduplicated)
export async function geocodePlace(placeName: string): Promise<PlaceResult> {
  const key = normalizeKey(placeName);

  // 1. Check in-memory cache
  const cached = geocodeCache.get(key);
  if (cached && (Date.now() - cached.timestamp < GEOCODE_CACHE_TTL)) {
    return {
      ...cached.data,
      place: placeName
    };
  }

  // 2. Check negative failure cache
  const failed = geocodeFailed.get(key);
  if (failed && (Date.now() - failed.timestamp < FAILURE_TTL)) {
    throw failed.error;
  }

  // 3. Check in-flight requests (deduplication)
  let promise = geocodeInFlight.get(key);
  if (promise) {
    const resolved = await promise;
    return {
      ...resolved,
      place: placeName
    };
  }

  promise = fetchGeocodeFromApi(placeName);
  geocodeInFlight.set(key, promise);

  try {
    const result = await promise;
    setBoundedCache(geocodeCache, key, {
      timestamp: Date.now(),
      data: result
    });
    geocodeFailed.delete(key);
    return {
      ...result,
      place: placeName
    };
  } catch (error: any) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    geocodeFailed.set(key, {
      timestamp: Date.now(),
      error: errObj
    });
    throw errObj;
  } finally {
    geocodeInFlight.delete(key);
  }
}

async function fetchGeocodeFromApi(placeName: string): Promise<PlaceResult> {
  const apiKey = process.env.GOOGLE_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_KEY not configured');
  }

  try {
    const params = new URLSearchParams({
      address: placeName,
      key: apiKey,
      region: 'at' // Bias results to Austria
    });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
    const data = await fetchJson(url);

    if (data.status !== 'OK') {
      const errorMap: Record<string, string> = {
        ZERO_RESULTS: 'Place not found',
        OVER_QUERY_LIMIT: 'API quota exceeded',
        REQUEST_DENIED: 'Google API authentication failed',
        INVALID_REQUEST: 'Invalid place name'
      };

      const errorMessage = errorMap[data.status] || 'Geocoding failed';
      throw new Error(errorMessage);
    }

    const result = data.results[0];

    if (!result || !result.geometry || !result.geometry.location) {
      throw new Error('Invalid geocoding response');
    }

    return {
      place: placeName,
      formattedAddress: result.formatted_address,
      coordinates: {
        lat: result.geometry.location.lat,
        lon: result.geometry.location.lng // Convert lng to lon for consistency
      }
    };
  } catch (error: any) {
    console.error('Geocoding API error:', error);

    if (error.message) {
      throw error;
    }

    throw new Error('Geocoding service unavailable');
  }
}

// Function to get autocomplete suggestions for a place (cached and deduplicated)
export async function autocompletePlace(input: string): Promise<AutocompleteResult[]> {
  const key = normalizeKey(input);

  // 1. Check in-memory cache
  const cached = autocompleteCache.get(key);
  if (cached && (Date.now() - cached.timestamp < AUTOCOMPLETE_CACHE_TTL)) {
    return cached.data;
  }

  // 2. Check negative failure cache
  const failed = autocompleteFailed.get(key);
  if (failed && (Date.now() - failed.timestamp < FAILURE_TTL)) {
    throw failed.error;
  }

  // 3. Check in-flight requests
  let promise = autocompleteInFlight.get(key);
  if (promise) {
    return promise;
  }

  promise = fetchAutocompleteFromApi(input);
  autocompleteInFlight.set(key, promise);

  try {
    const results = await promise;
    setBoundedCache(autocompleteCache, key, {
      timestamp: Date.now(),
      data: results
    });
    autocompleteFailed.delete(key);
    return results;
  } catch (error: any) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    autocompleteFailed.set(key, {
      timestamp: Date.now(),
      error: errObj
    });
    throw errObj;
  } finally {
    autocompleteInFlight.delete(key);
  }
}

async function fetchAutocompleteFromApi(input: string): Promise<AutocompleteResult[]> {
  const apiKey = process.env.GOOGLE_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_KEY not configured');
  }

  try {
    const params = new URLSearchParams({
      input: input,
      key: apiKey,
      components: 'country:at', // Bias to Austria
      language: 'de'
    });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`;
    const data = await fetchJson(url);

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Autocomplete API failed with status: ${data.status}`);
    }

    if (data.status === 'ZERO_RESULTS') {
      return [];
    }

    return data.predictions.map((p: any) => ({
      description: p.description,
      place_id: p.place_id
    }));
  } catch (error: any) {
    console.error('Autocomplete API error:', error);
    throw new Error('Autocomplete service unavailable');
  }
}
