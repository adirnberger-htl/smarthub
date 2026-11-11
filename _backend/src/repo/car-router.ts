import { fetchJson } from '../utils/http.js';

export interface CarRouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface CarRouteResult {
  departureTime: string; // HH:MM:SS
  arrivalTime: string;   // HH:MM:SS
  durationSeconds: number;
  durationInTrafficSeconds: number;
  distanceMeters: number;
  trafficCondition: 'normal' | 'moderate' | 'heavy';
  trafficDelayMinutes: number;
  summary: string;
  steps: CarRouteStep[];
  provider: 'google' | 'osrm';
  timestamp: string;
}

interface CacheEntry {
  timestamp: number;
  data: CarRouteResult;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 200;

const carRouteCache = new Map<string, CacheEntry>();
let lastSuccessTime: string | null = null;
let lastError: Error | null = null;
let lastErrorTime = 0;

function quantize(coord: number): string {
  return coord.toFixed(3);
}

function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':').map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;
  return hh * 3600 + mm * 60 + ss;
}

function secondsToTimeString(totalSeconds: number): string {
  let sec = totalSeconds % 86400;
  if (sec < 0) sec += 86400;
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function classifyTraffic(baseDurationSec: number, trafficDurationSec: number): { condition: 'normal' | 'moderate' | 'heavy'; delayMinutes: number } {
  const delaySec = Math.max(0, trafficDurationSec - baseDurationSec);
  const delayMinutes = Math.round(delaySec / 60);

  if (delayMinutes >= 10 || (baseDurationSec > 0 && trafficDurationSec >= baseDurationSec * 1.35)) {
    return { condition: 'heavy', delayMinutes };
  }
  if (delayMinutes >= 3 || (baseDurationSec > 0 && trafficDurationSec >= baseDurationSec * 1.15)) {
    return { condition: 'moderate', delayMinutes };
  }
  return { condition: 'normal', delayMinutes };
}

export function getCarRoutingStatus() {
  const hasKey = Boolean(process.env.GOOGLE_KEY);
  const isRecentError = lastError !== null && (Date.now() - lastErrorTime < 15000);
  return {
    provider: hasKey ? 'Google Directions' : 'OSRM',
    keyConfigured: hasKey,
    cachedEntries: carRouteCache.size,
    lastSuccess: lastSuccessTime,
    lastError: lastError ? String(lastError.message || lastError) : null,
    status: isRecentError ? 'error' : (hasKey ? 'ok' : 'degraded'),
  };
}

export async function calculateCarRoute(params: {
  latA: number;
  lonA: number;
  latB: number;
  lonB: number;
  arrivalTime?: string;
  departureTime?: string;
}): Promise<CarRouteResult> {
  const { latA, lonA, latB, lonB, arrivalTime, departureTime } = params;

  // Determine timing anchor
  let isArrival = false;
  let targetTimeSec: number;

  const now = new Date();
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  if (arrivalTime) {
    isArrival = true;
    targetTimeSec = timeStringToSeconds(arrivalTime);
  } else if (departureTime) {
    targetTimeSec = timeStringToSeconds(departureTime);
  } else {
    targetTimeSec = currentSec;
  }

  // Quantized cache key (round coordinates to ~110m and time to 5-min window)
  const timeWindowBucket = Math.floor(targetTimeSec / 300);
  const cacheKey = `${quantize(latA)},${quantize(lonA)}->${quantize(latB)},${quantize(lonB)}:${isArrival ? 'arr' : 'dep'}:${timeWindowBucket}`;

  const cached = carRouteCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    let result: CarRouteResult;
    const apiKey = process.env.GOOGLE_KEY;

    if (apiKey) {
      try {
        result = await fetchGoogleDirections({
          latA, lonA, latB, lonB, isArrival, targetTimeSec, apiKey
        });
      } catch (googleError: any) {
        console.warn('Google Directions failed, falling back to OSRM:', googleError.message);
        result = await fetchOsrmRoute({
          latA, lonA, latB, lonB, isArrival, targetTimeSec
        });
      }
    } else {
      result = await fetchOsrmRoute({
        latA, lonA, latB, lonB, isArrival, targetTimeSec
      });
    }

    // Set bounded cache
    if (carRouteCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = carRouteCache.keys().next().value;
      if (oldestKey) carRouteCache.delete(oldestKey);
    }
    carRouteCache.set(cacheKey, { timestamp: Date.now(), data: result });

    lastSuccessTime = new Date().toISOString();
    lastError = null;
    return result;
  } catch (err: any) {
    lastError = err instanceof Error ? err : new Error(String(err));
    lastErrorTime = Date.now();
    throw err;
  }
}

async function fetchGoogleDirections(opts: {
  latA: number;
  lonA: number;
  latB: number;
  lonB: number;
  isArrival: boolean;
  targetTimeSec: number;
  apiKey: string;
}): Promise<CarRouteResult> {
  const { latA, lonA, latB, lonB, isArrival, targetTimeSec, apiKey } = opts;

  const urlParams = new URLSearchParams({
    origin: `${latA},${lonA}`,
    destination: `${latB},${lonB}`,
    mode: 'driving',
    departure_time: 'now',
    key: apiKey,
    region: 'at'
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`;
  const data = await fetchJson(url, 15000);

  if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
    throw new Error(`Google Directions API error status: ${data.status || 'NO_ROUTES'}`);
  }

  const route = data.routes[0];
  const leg = route.legs?.[0];
  if (!leg) {
    throw new Error('Google Directions response missing route leg');
  }

  const distanceMeters = leg.distance?.value || 0;
  const durationSeconds = leg.duration?.value || 0;
  const durationInTrafficSeconds = leg.duration_in_traffic?.value || durationSeconds;

  const { condition, delayMinutes } = classifyTraffic(durationSeconds, durationInTrafficSeconds);

  let depTime: string;
  let arrTime: string;

  if (isArrival) {
    arrTime = secondsToTimeString(targetTimeSec);
    depTime = secondsToTimeString(targetTimeSec - durationInTrafficSeconds);
  } else {
    depTime = secondsToTimeString(targetTimeSec);
    arrTime = secondsToTimeString(targetTimeSec + durationInTrafficSeconds);
  }

  const steps: CarRouteStep[] = (leg.steps || []).map((s: any) => ({
    instruction: String(s.html_instructions || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    distanceMeters: s.distance?.value || 0,
    durationSeconds: s.duration?.value || 0,
  }));

  return {
    departureTime: depTime,
    arrivalTime: arrTime,
    durationSeconds,
    durationInTrafficSeconds,
    distanceMeters,
    trafficCondition: condition,
    trafficDelayMinutes: delayMinutes,
    summary: route.summary || (steps[0]?.instruction ? steps[0].instruction.slice(0, 40) : 'Standard Route'),
    steps,
    provider: 'google',
    timestamp: new Date().toISOString()
  };
}

async function fetchOsrmRoute(opts: {
  latA: number;
  lonA: number;
  latB: number;
  lonB: number;
  isArrival: boolean;
  targetTimeSec: number;
}): Promise<CarRouteResult> {
  const { latA, lonA, latB, lonB, isArrival, targetTimeSec } = opts;

  // OSRM coordinates: {lon},{lat};{lon},{lat}
  const url = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=false&steps=true`;
  const data = await fetchJson(url, 15000);

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM routing error: ${data.code || 'NO_ROUTES'}`);
  }

  const route = data.routes[0];
  const leg = route.legs?.[0];
  const distanceMeters = Math.round(route.distance || 0);
  const durationSeconds = Math.round(route.duration || 0);
  const durationInTrafficSeconds = durationSeconds; // OSRM does not provide live traffic

  let depTime: string;
  let arrTime: string;

  if (isArrival) {
    arrTime = secondsToTimeString(targetTimeSec);
    depTime = secondsToTimeString(targetTimeSec - durationInTrafficSeconds);
  } else {
    depTime = secondsToTimeString(targetTimeSec);
    arrTime = secondsToTimeString(targetTimeSec + durationInTrafficSeconds);
  }

  const steps: CarRouteStep[] = (leg?.steps || []).map((s: any) => {
    const maneuverType = s.maneuver?.type || 'turn';
    const modifier = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : '';
    const name = s.name ? ` onto ${s.name}` : '';
    return {
      instruction: `${maneuverType}${modifier}${name}`.trim(),
      distanceMeters: Math.round(s.distance || 0),
      durationSeconds: Math.round(s.duration || 0),
    };
  });

  const summary = (route.legs?.[0]?.summary || steps.find(s => s.instruction.includes('onto'))?.instruction || 'Car Route').replace(/^turn (onto )?/i, '');

  return {
    departureTime: depTime,
    arrivalTime: arrTime,
    durationSeconds,
    durationInTrafficSeconds,
    distanceMeters,
    trafficCondition: 'normal',
    trafficDelayMinutes: 0,
    summary,
    steps,
    provider: 'osrm',
    timestamp: new Date().toISOString()
  };
}
