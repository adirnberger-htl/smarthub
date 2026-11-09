import { EventEmitter } from 'events';
import {
  DeviceCommandDTO,
  getDeviceDefinition,
  getSmartDevice,
  getSmartEnvironment,
  KnxEnvironmentDTO,
  listSmartDevices,
  SmartDeviceDTO,
  toSmartDeviceFromKnx,
  updateCustomDeviceState,
} from '../repo/device-repo.js';
import { KnxDeviceWithState, updateBlindState } from '../repo/knx-repo.js';
import { BlindAction, globalKnxService } from './knx-service.js';

const VALID_BLIND_ACTIONS: readonly BlindAction[] = [
  'up',
  'down',
  'stop',
  'stepUp',
  'stepDown',
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export class DeviceNotFoundError extends Error {
  constructor(id: string) {
    super(`Device '${id}' not found`);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceValidationError';
  }
}

export class DeviceService extends EventEmitter {
  constructor() {
    super();

    globalKnxService.on('knx-state', (knxDevice: KnxDeviceWithState) => {
      const normalized = toSmartDeviceFromKnx(knxDevice);
      if (normalized) {
        this.emit('device-state', normalized);
      }
    });

    globalKnxService.on('knx-environment', (env: KnxEnvironmentDTO) => {
      this.emit('environment-state', env);
    });
  }

  public listDevices(): SmartDeviceDTO[] {
    return listSmartDevices();
  }

  public getEnvironment(): KnxEnvironmentDTO {
    return getSmartEnvironment();
  }

  public getDevice(id: string): SmartDeviceDTO | undefined {
    return getSmartDevice(id);
  }

  public validateCommand(id: string, cmd: DeviceCommandDTO): void {
    const def = getDeviceDefinition(id);
    if (!def) {
      throw new DeviceNotFoundError(id);
    }

    if (!cmd || typeof cmd !== 'object') {
      throw new DeviceValidationError('Request body must be a JSON object');
    }

    const { on, brightness, rgb, blindAction, slatAngle } = cmd;
    const hasField =
      on !== undefined ||
      brightness !== undefined ||
      rgb !== undefined ||
      blindAction !== undefined ||
      slatAngle !== undefined;

    if (!hasField) {
      throw new DeviceValidationError(
        'Provide at least one command field: on, brightness, rgb, blindAction, or slatAngle'
      );
    }

    if (on !== undefined) {
      if (!def.capabilities.includes('switch')) {
        throw new DeviceValidationError(`Device '${id}' does not support capability 'switch'`);
      }
      if (typeof on !== 'boolean') {
        throw new DeviceValidationError('"on" must be a boolean');
      }
    }

    if (brightness !== undefined) {
      if (!def.capabilities.includes('brightness')) {
        throw new DeviceValidationError(`Device '${id}' does not support capability 'brightness'`);
      }
      if (
        typeof brightness !== 'number' ||
        Number.isNaN(brightness) ||
        brightness < 0 ||
        brightness > 100
      ) {
        throw new DeviceValidationError('"brightness" must be a number between 0 and 100');
      }
    }

    if (rgb !== undefined) {
      if (!def.capabilities.includes('rgb')) {
        throw new DeviceValidationError(`Device '${id}' does not support capability 'rgb'`);
      }
      if (typeof rgb !== 'string' || !HEX_COLOR_RE.test(rgb)) {
        throw new DeviceValidationError('"rgb" must be a hex color string (e.g. "#00ff66")');
      }
    }

    if (blindAction !== undefined) {
      if (!def.capabilities.includes('blind_move') && !def.capabilities.includes('blind_angle')) {
        throw new DeviceValidationError(`Device '${id}' does not support blind actions`);
      }
      if (!VALID_BLIND_ACTIONS.includes(blindAction)) {
        throw new DeviceValidationError(
          `"blindAction" must be one of: ${VALID_BLIND_ACTIONS.join(', ')}`
        );
      }
    }

    if (slatAngle !== undefined) {
      if (!def.capabilities.includes('blind_angle')) {
        throw new DeviceValidationError(`Device '${id}' does not support capability 'blind_angle'`);
      }
      if (
        typeof slatAngle !== 'number' ||
        Number.isNaN(slatAngle) ||
        slatAngle < 0 ||
        slatAngle > 100
      ) {
        throw new DeviceValidationError('"slatAngle" must be a number between 0 and 100');
      }
    }
  }

  public async executeCommand(id: string, cmd: DeviceCommandDTO): Promise<SmartDeviceDTO> {
    this.validateCommand(id, cmd);
    const def = getDeviceDefinition(id)!;

    if (def.protocol === 'led') {
      const current = getSmartDevice(id)!;
      const nextBrightness =
        cmd.brightness !== undefined
          ? Math.max(0, Math.min(100, Math.round(cmd.brightness)))
          : current.state.brightness ?? 100;
      const nextRgb = cmd.rgb !== undefined ? cmd.rgb.toLowerCase() : current.state.rgb ?? '#00ff66';
      const nextOn =
        cmd.on !== undefined
          ? Boolean(cmd.on)
          : cmd.rgb !== undefined
          ? true
          : cmd.brightness !== undefined
          ? nextBrightness > 0
          : Boolean(current.state.on);

      const updated = updateCustomDeviceState(id, {
        on: nextOn,
        brightness: nextBrightness,
        rgb: nextRgb,
      })!;
      this.emit('device-state', updated);
      return updated;
    }

    // KNX protocol devices
    if (def.category === 'light' || def.category === 'outlet') {
      await globalKnxService.controlLight(id, {
        on: cmd.on,
        brightness: cmd.brightness,
      });
      return getSmartDevice(id)!;
    }

    // KNX blind devices
    if (cmd.slatAngle !== undefined) {
      const clampedAngle = Math.max(0, Math.min(100, Math.round(cmd.slatAngle)));
      const current = getSmartDevice(id)!;
      const currentAngle = current.state.slatAngle ?? 0;
      const delta = clampedAngle - currentAngle;
      const stepAction: BlindAction = delta >= 0 ? 'stepDown' : 'stepUp';

      updateBlindState(id, { slatPos: clampedAngle });
      updateCustomDeviceState(id, { slatAngle: clampedAngle });
      if (id === 'blinds-all') {
        updateBlindState('blind-west', { slatPos: clampedAngle });
        updateBlindState('blind-south', { slatPos: clampedAngle });
      }

      await globalKnxService.controlBlind(id, stepAction);
      const updated = getSmartDevice(id)!;
      this.emit('device-state', updated);
      return updated;
    }

    if (cmd.blindAction !== undefined) {
      await globalKnxService.controlBlind(id, cmd.blindAction);
      return getSmartDevice(id)!;
    }

    return getSmartDevice(id)!;
  }
}

export const globalDeviceService = new DeviceService();
