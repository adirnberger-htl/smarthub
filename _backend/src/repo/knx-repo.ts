export type KnxDeviceType = 'light' | 'outlet' | 'blind';

export interface KnxLightDeviceConfig {
  id: string;
  name: string;
  room: string;
  type: 'light' | 'outlet';
  switchGA: string;
  altSwitchGA?: string;
  statusGA?: string;
  altStatusGA?: string;
  dimGA?: string;
}

export interface KnxBlindDeviceConfig {
  id: string;
  name: string;
  room: string;
  type: 'blind';
  moveGA: string;
  stepStopGA: string;
  posHeightGA?: string;
  posSlatGA?: string;
}

export type KnxDeviceConfig = KnxLightDeviceConfig | KnxBlindDeviceConfig;

export interface KnxLightState {
  on: boolean;
  brightness?: number;
  updatedAt: string | null;
}

export interface KnxBlindState {
  lastAction: 'up' | 'down' | 'stop' | 'stepUp' | 'stepDown' | null;
  heightPos?: number;
  slatPos?: number;
  rawHeightPos?: number;
  rawSlatPos?: number;
  updatedAt: string | null;
}

export type KnxDeviceState = KnxLightState | KnxBlindState;

export type KnxDeviceWithState =
  | (KnxLightDeviceConfig & { state: KnxLightState })
  | (KnxBlindDeviceConfig & { state: KnxBlindState });

export type WeatherFieldRole =
  | 'weather_raining'
  | 'weather_outdoorTemp'
  | 'weather_sunElevation'
  | 'weather_sunAzimuth'
  | 'weather_luxSouth4B'
  | 'weather_luxWest4B'
  | 'weather_luxSouth2B'
  | 'weather_luxWest2B'
  | 'weather_luxMax4B'
  | 'weather_solarRadiation';

export interface GaTargetResolution {
  deviceId: string;
  role:
    | 'switch'
    | 'altSwitch'
    | 'status'
    | 'altStatus'
    | 'dim'
    | 'move'
    | 'stepStop'
    | 'posHeight'
    | 'posSlat'
    | WeatherFieldRole;
  dpt: string;
}

export interface KnxEnvironmentDTO {
  sunElevation: number;
  sunAzimuth: number;
  luxWest: number;
  luxSouth: number;
  luxMax: number;
  outdoorTemp: number;
  raining: boolean;
  solarRadiation: number;
  source: 'knx' | 'fallback';
  updatedAt: string | null;
}

export const KZ_WEST_DEVICES: readonly KnxDeviceConfig[] = [
  {
    id: 'ceiling-light',
    name: 'Deckenlicht KZ West',
    room: 'KZ West',
    type: 'light',
    switchGA: '0/0/29',
    altSwitchGA: '0/0/203',
    statusGA: '0/0/55',
    altStatusGA: '0/0/206',
  },
  {
    id: 'desk-light',
    name: 'Schreibtischlicht Arthur',
    room: 'KZ West',
    type: 'light',
    switchGA: '0/0/95',
    dimGA: '0/0/96',
  },
  {
    id: 'outlet',
    name: 'Steckdose KZ West',
    room: 'KZ West',
    type: 'outlet',
    switchGA: '0/0/30',
    statusGA: '0/0/56',
  },
  {
    id: 'blind-west',
    name: 'Jalousie West',
    room: 'KZ West',
    type: 'blind',
    moveGA: '0/1/14',
    stepStopGA: '0/1/15',
    posHeightGA: '0/1/70',
    posSlatGA: '0/1/71',
  },
  {
    id: 'blind-south',
    name: 'Jalousie Süd',
    room: 'KZ West',
    type: 'blind',
    moveGA: '0/1/21',
    stepStopGA: '0/1/20',
    posHeightGA: '0/1/64',
    posSlatGA: '0/1/65',
  },
  {
    id: 'blinds-all',
    name: 'Alle Jalousien KZ West',
    room: 'KZ West',
    type: 'blind',
    moveGA: '0/1/28',
    stepStopGA: '0/1/36',
  },
];

export const KNX_WEATHER_STATION_GAS: ReadonlyArray<{
  ga: string;
  role: WeatherFieldRole;
  dpt: string;
}> = [
  { ga: '0/5/6', role: 'weather_raining', dpt: '1.001' },
  { ga: '0/5/7', role: 'weather_outdoorTemp', dpt: '9.001' },
  { ga: '0/5/8', role: 'weather_sunElevation', dpt: '5.004' },
  { ga: '0/5/12', role: 'weather_sunAzimuth', dpt: '5.003' },
  { ga: '0/5/13', role: 'weather_luxSouth4B', dpt: '14.027' },
  { ga: '0/5/14', role: 'weather_luxWest4B', dpt: '14.027' },
  { ga: '0/5/16', role: 'weather_luxSouth2B', dpt: '9.004' },
  { ga: '0/5/17', role: 'weather_luxWest2B', dpt: '9.004' },
  { ga: '0/5/19', role: 'weather_luxMax4B', dpt: '14.027' },
  { ga: '0/5/26', role: 'weather_solarRadiation', dpt: '9.024' },
];

const deviceMap = new Map<string, KnxDeviceConfig>();
const gaLookup = new Map<string, GaTargetResolution[]>();
const stateStore = new Map<string, KnxDeviceState>();

interface PartialEnvironmentCache {
  sunElevation?: number;
  sunAzimuth?: number;
  luxWest?: number;
  luxSouth?: number;
  luxMax?: number;
  outdoorTemp?: number;
  raining?: boolean;
  solarRadiation?: number;
  updatedAt: string | null;
}

const environmentCache: PartialEnvironmentCache = {
  updatedAt: null,
};

function registerGa(ga: string | undefined, resolution: GaTargetResolution) {
  if (!ga) return;
  const list = gaLookup.get(ga) ?? [];
  list.push(resolution);
  gaLookup.set(ga, list);
}

for (const device of KZ_WEST_DEVICES) {
  deviceMap.set(device.id, device);

  if (device.type !== 'blind') {
    stateStore.set(device.id, {
      on: false,
      ...(device.dimGA ? { brightness: 0 } : {}),
      updatedAt: null,
    });
    registerGa(device.switchGA, { deviceId: device.id, role: 'switch', dpt: '1.001' });
    registerGa(device.altSwitchGA, { deviceId: device.id, role: 'altSwitch', dpt: '1.001' });
    registerGa(device.statusGA, { deviceId: device.id, role: 'status', dpt: '1.001' });
    registerGa(device.altStatusGA, { deviceId: device.id, role: 'altStatus', dpt: '1.001' });
    registerGa(device.dimGA, { deviceId: device.id, role: 'dim', dpt: '5.001' });
  } else {
    stateStore.set(device.id, {
      lastAction: null,
      ...(device.posHeightGA ? { heightPos: 0 } : {}),
      ...(device.posSlatGA ? { slatPos: 0 } : {}),
      updatedAt: null,
    });
    registerGa(device.moveGA, { deviceId: device.id, role: 'move', dpt: '1.008' });
    registerGa(device.stepStopGA, { deviceId: device.id, role: 'stepStop', dpt: '1.007' });
    registerGa(device.posHeightGA, { deviceId: device.id, role: 'posHeight', dpt: '7.001' });
    registerGa(device.posSlatGA, { deviceId: device.id, role: 'posSlat', dpt: '7.001' });
  }
}

for (const w of KNX_WEATHER_STATION_GAS) {
  registerGa(w.ga, {
    deviceId: 'weather-station',
    role: w.role,
    dpt: w.dpt,
  });
}

/**
 * Compute deterministic astronomical solar elevation, azimuth, and estimated facade Lux
 * for Linz, Austria (48.3069° N, 14.2858° E) when KNX weather station data has not arrived yet.
 */
export function computeAstronomicalFallback(now = new Date()): Omit<KnxEnvironmentDTO, 'source' | 'updatedAt'> {
  const latDeg = 48.3069;
  const lonDeg = 14.2858;
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const trueSolarTimeMin = (utcHours * 60 + eqTime + 4 * lonDeg + 1440) % 1440;
  const hourAngleDeg = trueSolarTimeMin / 4 < 0 ? trueSolarTimeMin / 4 + 180 : trueSolarTimeMin / 4 - 180;
  const haRad = hourAngleDeg * rad;
  const latRad = latDeg * rad;

  const sinElev =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const sunElevation = Math.round(elevRad * deg * 10) / 10;

  const cosZenith = Math.sin(elevRad);
  const sinZenith = Math.sqrt(Math.max(0.0001, 1 - cosZenith * cosZenith));
  let cosAz =
    (Math.sin(latRad) * cosZenith - Math.sin(decl)) /
    (Math.cos(latRad) * sinZenith);
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let azimuth = Math.acos(cosAz) * deg;
  if (hourAngleDeg > 0) {
    azimuth = (azimuth + 180) % 360;
  } else {
    azimuth = (540 - azimuth) % 360;
  }
  const sunAzimuth = Math.round(azimuth * 10) / 10;

  // Estimate realistic outdoor Lux and facade distribution
  const daylightFactor = Math.max(0, Math.sin(Math.max(0, sunElevation) * rad));
  const luxMax = sunElevation > 0 ? Math.round(1200 + daylightFactor * 52000) : 15;

  // West facade (270°) & South facade (180°) directional incidence
  const westIncidence = Math.max(0.15, Math.cos((sunAzimuth - 270) * rad));
  const southIncidence = Math.max(0.15, Math.cos((sunAzimuth - 180) * rad));
  const luxWest = sunElevation > 0 ? Math.round(luxMax * (0.25 + 0.75 * westIncidence)) : 10;
  const luxSouth = sunElevation > 0 ? Math.round(luxMax * (0.25 + 0.75 * southIncidence)) : 10;
  const solarRadiation = sunElevation > 0 ? Math.round(daylightFactor * 680) : 0;

  return {
    sunElevation,
    sunAzimuth,
    luxWest,
    luxSouth,
    luxMax,
    outdoorTemp: 14.5,
    raining: false,
    solarRadiation,
  };
}

export function getKnxEnvironmentState(now = new Date()): KnxEnvironmentDTO {
  const fallback = computeAstronomicalFallback(now);
  const hasKnxData = environmentCache.updatedAt !== null;

  const luxWest = environmentCache.luxWest ?? fallback.luxWest;
  const luxSouth = environmentCache.luxSouth ?? fallback.luxSouth;
  const luxMax =
    environmentCache.luxMax ?? Math.max(luxWest, luxSouth, fallback.luxMax);

  return {
    sunElevation: environmentCache.sunElevation ?? fallback.sunElevation,
    sunAzimuth: environmentCache.sunAzimuth ?? fallback.sunAzimuth,
    luxWest,
    luxSouth,
    luxMax,
    outdoorTemp: environmentCache.outdoorTemp ?? fallback.outdoorTemp,
    raining: environmentCache.raining ?? fallback.raining,
    solarRadiation: environmentCache.solarRadiation ?? fallback.solarRadiation,
    source: hasKnxData ? 'knx' : 'fallback',
    updatedAt: environmentCache.updatedAt,
  };
}

export function updateKnxEnvironmentState(
  patch: Partial<Omit<KnxEnvironmentDTO, 'source' | 'updatedAt'>>
): KnxEnvironmentDTO {
  if (patch.sunElevation !== undefined && !Number.isNaN(patch.sunElevation)) {
    environmentCache.sunElevation = Math.max(-90, Math.min(90, Math.round(patch.sunElevation * 10) / 10));
  }
  if (patch.sunAzimuth !== undefined && !Number.isNaN(patch.sunAzimuth)) {
    environmentCache.sunAzimuth = ((Math.round(patch.sunAzimuth * 10) / 10) % 360 + 360) % 360;
  }
  if (patch.luxWest !== undefined && !Number.isNaN(patch.luxWest)) {
    environmentCache.luxWest = Math.max(0, Math.round(patch.luxWest));
  }
  if (patch.luxSouth !== undefined && !Number.isNaN(patch.luxSouth)) {
    environmentCache.luxSouth = Math.max(0, Math.round(patch.luxSouth));
  }
  if (patch.luxMax !== undefined && !Number.isNaN(patch.luxMax)) {
    environmentCache.luxMax = Math.max(0, Math.round(patch.luxMax));
  }
  if (patch.outdoorTemp !== undefined && !Number.isNaN(patch.outdoorTemp)) {
    environmentCache.outdoorTemp = Math.round(patch.outdoorTemp * 10) / 10;
  }
  if (patch.raining !== undefined) {
    environmentCache.raining = Boolean(patch.raining);
  }
  if (patch.solarRadiation !== undefined && !Number.isNaN(patch.solarRadiation)) {
    environmentCache.solarRadiation = Math.max(0, Math.round(patch.solarRadiation));
  }
  environmentCache.updatedAt = new Date().toISOString();
  return getKnxEnvironmentState();
}

export function listKnxDevices(): KnxDeviceWithState[] {
  return KZ_WEST_DEVICES.map((device) => getKnxDeviceWithState(device.id)!);
}

export function getKnxDevice(id: string): KnxDeviceConfig | undefined {
  return deviceMap.get(id);
}

export function getKnxDeviceWithState(id: string): KnxDeviceWithState | undefined {
  const device = deviceMap.get(id);
  const state = stateStore.get(id);
  if (!device || !state) return undefined;
  if (device.type === 'blind') {
    return { ...device, state: { ...(state as KnxBlindState) } };
  }
  return { ...device, state: { ...(state as KnxLightState) } };
}

export function resolveGroupAddress(ga: string): GaTargetResolution[] {
  return gaLookup.get(ga) ?? [];
}

export function getStartupReadGroupAddresses(): Array<{ ga: string; dpt: string }> {
  const result: Array<{ ga: string; dpt: string }> = [];
  const seen = new Set<string>();

  for (const device of KZ_WEST_DEVICES) {
    if (device.type !== 'blind') {
      const candidates: Array<{ ga?: string; dpt: string }> = [
        { ga: device.statusGA ?? device.switchGA, dpt: '1.001' },
        { ga: device.altStatusGA, dpt: '1.001' },
        { ga: device.dimGA, dpt: '5.001' },
      ];
      for (const c of candidates) {
        if (c.ga && !seen.has(c.ga)) {
          seen.add(c.ga);
          result.push({ ga: c.ga, dpt: c.dpt });
        }
      }
    } else {
      const candidates: Array<{ ga?: string; dpt: string }> = [
        { ga: device.posHeightGA, dpt: '7.001' },
        { ga: device.posSlatGA, dpt: '7.001' },
      ];
      for (const c of candidates) {
        if (c.ga && !seen.has(c.ga)) {
          seen.add(c.ga);
          result.push({ ga: c.ga, dpt: c.dpt });
        }
      }
    }
  }

  for (const w of KNX_WEATHER_STATION_GAS) {
    if (!seen.has(w.ga)) {
      seen.add(w.ga);
      result.push({ ga: w.ga, dpt: w.dpt });
    }
  }

  return result;
}

export function updateLightState(
  id: string,
  patch: { on?: boolean; brightness?: number }
): KnxDeviceWithState | undefined {
  const device = deviceMap.get(id);
  if (!device || (device.type !== 'light' && device.type !== 'outlet')) {
    return undefined;
  }
  const current = stateStore.get(id) as KnxLightState;
  const next: KnxLightState = {
    ...current,
    ...(patch.on !== undefined ? { on: Boolean(patch.on) } : {}),
    ...(patch.brightness !== undefined
      ? { brightness: Math.max(0, Math.min(100, Math.round(patch.brightness))) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  stateStore.set(id, next);
  return getKnxDeviceWithState(id);
}

export function updateBlindState(
  id: string,
  patch: {
    lastAction?: 'up' | 'down' | 'stop' | 'stepUp' | 'stepDown';
    heightPos?: number;
    slatPos?: number;
    rawHeightPos?: number;
    rawSlatPos?: number;
  }
): KnxDeviceWithState | undefined {
  const device = deviceMap.get(id);
  if (!device || device.type !== 'blind') {
    return undefined;
  }
  const current = stateStore.get(id) as KnxBlindState;
  const next: KnxBlindState = {
    ...current,
    ...(patch.lastAction !== undefined ? { lastAction: patch.lastAction } : {}),
    ...(patch.heightPos !== undefined ? { heightPos: patch.heightPos } : {}),
    ...(patch.slatPos !== undefined ? { slatPos: patch.slatPos } : {}),
    ...(patch.rawHeightPos !== undefined ? { rawHeightPos: patch.rawHeightPos } : {}),
    ...(patch.rawSlatPos !== undefined ? { rawSlatPos: patch.rawSlatPos } : {}),
    updatedAt: new Date().toISOString(),
  };
  stateStore.set(id, next);

  // If "blinds-all" was triggered, mirror lastAction to blind-west and blind-south
  if (id === 'blinds-all' && patch.lastAction) {
    for (const childId of ['blind-west', 'blind-south']) {
      const childCurrent = stateStore.get(childId) as KnxBlindState | undefined;
      if (childCurrent) {
        stateStore.set(childId, {
          ...childCurrent,
          lastAction: patch.lastAction,
          updatedAt: next.updatedAt,
        });
      }
    }
  }

  return getKnxDeviceWithState(id);
}
