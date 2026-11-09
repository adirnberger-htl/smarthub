import {
  getKnxDeviceWithState,
  getKnxEnvironmentState,
  KnxBlindDeviceConfig,
  KnxBlindState,
  KnxDeviceWithState,
  KnxEnvironmentDTO,
  KnxLightDeviceConfig,
  KnxLightState,
} from './knx-repo.js';
import { BlindAction } from '../services/knx-service.js';

export type { KnxEnvironmentDTO };

export type DeviceCategory = 'light' | 'outlet' | 'blind';

export type DeviceCapability =
  | 'switch'
  | 'brightness'
  | 'rgb'
  | 'blind_move'
  | 'blind_angle';

export type DeviceProtocol = 'knx' | 'led';

export interface SmartDeviceState {
  on?: boolean;
  brightness?: number;
  rgb?: string;
  lastAction?: BlindAction | null;
  heightPos?: number;
  slatAngle?: number;
  updatedAt: string | null;
}

export interface SmartDeviceDTO {
  id: string;
  name: string;
  room: string;
  category: DeviceCategory;
  capabilities: DeviceCapability[];
  state: SmartDeviceState;
}

export interface DeviceCommandDTO {
  on?: boolean;
  brightness?: number;
  rgb?: string;
  blindAction?: BlindAction;
  slatAngle?: number;
}

export interface DeviceDefinition {
  id: string;
  name: string;
  room: string;
  category: DeviceCategory;
  protocol: DeviceProtocol;
  capabilities: DeviceCapability[];
}

export const KZ_WEST_SMART_DEVICES: readonly DeviceDefinition[] = [
  {
    id: 'ceiling-light',
    name: 'Deckenlicht KZ West',
    room: 'KZ West',
    category: 'light',
    protocol: 'knx',
    capabilities: ['switch'],
  },
  {
    id: 'desk-light',
    name: 'Schreibtischlicht Arthur',
    room: 'KZ West',
    category: 'light',
    protocol: 'knx',
    capabilities: ['switch', 'brightness'],
  },
  {
    id: 'room-leds',
    name: 'LED Strip KZ West',
    room: 'KZ West',
    category: 'light',
    protocol: 'led',
    capabilities: ['switch', 'brightness', 'rgb'],
  },
  {
    id: 'outlet',
    name: 'Steckdose KZ West',
    room: 'KZ West',
    category: 'outlet',
    protocol: 'knx',
    capabilities: ['switch'],
  },
  {
    id: 'blind-west',
    name: 'Jalousie West',
    room: 'KZ West',
    category: 'blind',
    protocol: 'knx',
    capabilities: ['blind_move', 'blind_angle'],
  },
  {
    id: 'blind-south',
    name: 'Jalousie Süd',
    room: 'KZ West',
    category: 'blind',
    protocol: 'knx',
    capabilities: ['blind_move', 'blind_angle'],
  },
  {
    id: 'blinds-all',
    name: 'Alle Jalousien KZ West',
    room: 'KZ West',
    category: 'blind',
    protocol: 'knx',
    capabilities: ['blind_move', 'blind_angle'],
  },
];

const definitionMap = new Map<string, DeviceDefinition>(
  KZ_WEST_SMART_DEVICES.map((d) => [d.id, d])
);

const customStateStore = new Map<string, SmartDeviceState>([
  [
    'room-leds',
    {
      on: false,
      brightness: 100,
      rgb: '#00ff66',
      updatedAt: null,
    },
  ],
  [
    'blinds-all',
    {
      lastAction: null,
      slatAngle: 0,
      updatedAt: null,
    },
  ],
]);

export function getDeviceDefinition(id: string): DeviceDefinition | undefined {
  return definitionMap.get(id);
}

export function toSmartDeviceFromKnx(knxDevice: KnxDeviceWithState): SmartDeviceDTO | undefined {
  const def = definitionMap.get(knxDevice.id);
  if (!def) return undefined;

  if (knxDevice.type === 'blind') {
    const blindState = (knxDevice as KnxBlindDeviceConfig & { state: KnxBlindState }).state;
    const customState = customStateStore.get(def.id);
    const slatAngle =
      blindState.slatPos !== undefined
        ? blindState.slatPos
        : customState?.slatAngle ?? 0;

    return {
      id: def.id,
      name: def.name,
      room: def.room,
      category: def.category,
      capabilities: [...def.capabilities],
      state: {
        lastAction: blindState.lastAction,
        ...(blindState.heightPos !== undefined ? { heightPos: blindState.heightPos } : {}),
        slatAngle,
        updatedAt: blindState.updatedAt ?? customState?.updatedAt ?? null,
      },
    };
  }

  const lightState = (knxDevice as KnxLightDeviceConfig & { state: KnxLightState }).state;
  return {
    id: def.id,
    name: def.name,
    room: def.room,
    category: def.category,
    capabilities: [...def.capabilities],
    state: {
      on: lightState.on,
      ...(def.capabilities.includes('brightness')
        ? { brightness: lightState.brightness ?? 0 }
        : {}),
      updatedAt: lightState.updatedAt,
    },
  };
}

export function getSmartDevice(id: string): SmartDeviceDTO | undefined {
  const def = definitionMap.get(id);
  if (!def) return undefined;

  if (def.protocol === 'knx') {
    const knx = getKnxDeviceWithState(id);
    if (!knx) return undefined;
    return toSmartDeviceFromKnx(knx);
  }

  const state = customStateStore.get(id) ?? { updatedAt: null };
  return {
    id: def.id,
    name: def.name,
    room: def.room,
    category: def.category,
    capabilities: [...def.capabilities],
    state: { ...state },
  };
}

export function listSmartDevices(): SmartDeviceDTO[] {
  return KZ_WEST_SMART_DEVICES.map((d) => getSmartDevice(d.id)!);
}

export function getSmartEnvironment(): KnxEnvironmentDTO {
  return getKnxEnvironmentState();
}

export function updateCustomDeviceState(
  id: string,
  patch: Partial<SmartDeviceState>
): SmartDeviceDTO | undefined {
  const def = definitionMap.get(id);
  if (!def) return undefined;

  const current = customStateStore.get(id) ?? { updatedAt: null };
  const next: SmartDeviceState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  customStateStore.set(id, next);
  return getSmartDevice(id);
}
