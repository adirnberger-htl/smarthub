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
    | 'posSlat';
  dpt: string;
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

const deviceMap = new Map<string, KnxDeviceConfig>();
const gaLookup = new Map<string, GaTargetResolution[]>();
const stateStore = new Map<string, KnxDeviceState>();

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
