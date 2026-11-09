import { EventEmitter } from 'events';
import { KNXClient, KNXClientEvents, dptlib } from 'knxultimate';
import {
  getKnxDevice,
  getKnxDeviceWithState,
  getStartupReadGroupAddresses,
  KnxDeviceWithState,
  listKnxDevices,
  resolveGroupAddress,
  updateBlindState,
  updateLightState,
} from '../repo/knx-repo.js';

export type BlindAction = 'up' | 'down' | 'stop' | 'stepUp' | 'stepDown';

interface QueuedCommand {
  run: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class KnxService extends EventEmitter {
  private client: KNXClient | null = null;
  private enabled = false;
  private connected = false;
  private commandQueue: QueuedCommand[] = [];
  private processingQueue = false;
  private minCommandIntervalMs = 50;
  private startupReadTimer: NodeJS.Timeout | null = null;

  public start(): void {
    const envEnabled = (process.env.KNX_ENABLED ?? 'true').toLowerCase();
    this.enabled = envEnabled !== 'false' && envEnabled !== '0' && envEnabled !== 'no';

    if (!this.enabled) {
      console.log('[KNX] Running in mock/dry-run mode (KNX_ENABLED=false)');
      return;
    }

    const ipAddr = process.env.KNX_MULTICAST_IP || '224.0.23.12';
    const ipPort = Number(process.env.KNX_PORT || 3671);
    const physAddr = process.env.KNX_PHYS_ADDR || '1.2.6';
    const knxInterface = process.env.KNX_INTERFACE?.trim() || undefined;

    try {
      this.client = new KNXClient({
        ipAddr,
        ipPort,
        physAddr,
        hostProtocol: 'Multicast',
        KNXQueueSendIntervalMilliseconds: 50,
        suppress_ack_ldatareq: false,
        loglevel: 'error',
        ...(knxInterface
          ? /^\d+\.\d+\.\d+\.\d+$/.test(knxInterface)
            ? { localIPAddress: knxInterface }
            : { interface: knxInterface }
          : {}),
      });

      this.client.on(KNXClientEvents.connected, () => {
        this.connected = true;
        console.log(`[KNX] Connected via Multicast ${ipAddr}:${ipPort} (physAddr ${physAddr})`);
        this.scheduleStartupStatusReads();
      });

      this.client.on(KNXClientEvents.disconnected, (reason: string) => {
        this.connected = false;
        console.warn(`[KNX] Disconnected: ${reason}`);
      });

      this.client.on(KNXClientEvents.error, (err: Error) => {
        console.error('[KNX] Error:', err.message);
      });

      this.client.on(KNXClientEvents.indication, (packet, echoed) => {
        if (echoed) return;
        this.handleIndicationPacket(packet);
      });

      this.client.Connect();
    } catch (err) {
      console.error('[KNX] Failed to initialize KNXClient, falling back to mock state:', err);
      this.client = null;
      this.connected = false;
    }
  }

  public async stop(): Promise<void> {
    if (this.startupReadTimer) {
      clearTimeout(this.startupReadTimer);
      this.startupReadTimer = null;
    }
    if (this.client) {
      try {
        await this.client.Disconnect();
      } catch {
        // Ignore disconnect errors on shutdown
      }
      this.client = null;
      this.connected = false;
    }
  }

  public getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      protocol: 'Multicast',
      multicastIp: process.env.KNX_MULTICAST_IP || '224.0.23.12',
      port: Number(process.env.KNX_PORT || 3671),
      physAddr: process.env.KNX_PHYS_ADDR || '1.2.6',
      devices: listKnxDevices(),
    };
  }

  public async controlLight(
    id: string,
    payload: { on?: boolean; brightness?: number }
  ): Promise<KnxDeviceWithState> {
    const device = getKnxDevice(id);
    if (!device || (device.type !== 'light' && device.type !== 'outlet')) {
      throw new Error(`Unknown light/outlet device: ${id}`);
    }

    if (payload.brightness !== undefined) {
      if (!device.dimGA) {
        throw new Error(`Device ${id} does not support dimming`);
      }
      const clamped = Math.max(0, Math.min(100, Math.round(payload.brightness)));
      const shouldBeOn = payload.on !== undefined ? Boolean(payload.on) : clamped > 0;

      if (this.enabled && this.client) {
        await this.enqueueCommand(async () => {
          await this.client!.write(device.dimGA!, clamped, '5.001');
        });
        if (payload.on !== undefined || clamped === 0 || clamped > 0) {
          await this.enqueueCommand(async () => {
            await this.client!.write(device.switchGA, shouldBeOn, '1.001');
          });
        }
      }

      const updated = updateLightState(id, { on: shouldBeOn, brightness: clamped })!;
      this.emitStateUpdate(updated);
      return updated;
    }

    if (payload.on !== undefined) {
      const onVal = Boolean(payload.on);
      if (this.enabled && this.client) {
        await this.enqueueCommand(async () => {
          await this.client!.write(device.switchGA, onVal, '1.001');
        });
      }

      const updated = updateLightState(id, { on: onVal })!;
      this.emitStateUpdate(updated);
      return updated;
    }

    return getKnxDeviceWithState(id)!;
  }

  public async controlBlind(id: string, action: BlindAction): Promise<KnxDeviceWithState> {
    const device = getKnxDevice(id);
    if (!device || device.type !== 'blind') {
      throw new Error(`Unknown blind device: ${id}`);
    }

    const isMove = action === 'up' || action === 'down';
    const targetGA = isMove ? device.moveGA : device.stepStopGA;
    const dpt = isMove ? '1.008' : '1.007';
    // KNX DPT 1.008: 0 = Up, 1 = Down
    // KNX DPT 1.007: 0 = Step Up / Stop, 1 = Step Down
    const bitValue = action === 'down' || action === 'stepDown' ? 1 : 0;

    if (this.enabled && this.client) {
      await this.enqueueCommand(async () => {
        await this.client!.write(targetGA, bitValue, dpt);
      });
    }

    const updated = updateBlindState(id, { lastAction: action })!;
    this.emitStateUpdate(updated);
    if (id === 'blinds-all') {
      const west = getKnxDeviceWithState('blind-west');
      const south = getKnxDeviceWithState('blind-south');
      if (west) this.emitStateUpdate(west);
      if (south) this.emitStateUpdate(south);
    }
    return updated;
  }

  public handleIncomingTelegram(ga: string, rawBuffer: Buffer): void {
    const resolutions = resolveGroupAddress(ga);
    if (!resolutions.length) return;

    for (const res of resolutions) {
      if (
        res.role === 'switch' ||
        res.role === 'altSwitch' ||
        res.role === 'status' ||
        res.role === 'altStatus'
      ) {
        const val = Boolean(dptlib.fromBuffer(rawBuffer, dptlib.resolve('1.001')));
        const updated = updateLightState(res.deviceId, { on: val });
        if (updated) this.emitStateUpdate(updated);
      } else if (res.role === 'dim') {
        const decoded = Number(dptlib.fromBuffer(rawBuffer, dptlib.resolve('5.001')));
        if (!Number.isNaN(decoded)) {
          const brightness = Math.max(0, Math.min(100, Math.round(decoded)));
          const updated = updateLightState(res.deviceId, {
            brightness,
            on: brightness > 0,
          });
          if (updated) this.emitStateUpdate(updated);
        }
      } else if (res.role === 'move') {
        const bit = Boolean(dptlib.fromBuffer(rawBuffer, dptlib.resolve('1.008')));
        const updated = updateBlindState(res.deviceId, {
          lastAction: bit ? 'down' : 'up',
        });
        if (updated) this.emitStateUpdate(updated);
      } else if (res.role === 'stepStop') {
        const updated = updateBlindState(res.deviceId, {
          lastAction: 'stop',
        });
        if (updated) this.emitStateUpdate(updated);
      } else if (res.role === 'posHeight' || res.role === 'posSlat') {
        const { raw, percent } = this.decodeTwoBytePosition(rawBuffer);
        const updated = updateBlindState(
          res.deviceId,
          res.role === 'posHeight'
            ? { heightPos: percent, rawHeightPos: raw }
            : { slatPos: percent, rawSlatPos: raw }
        );
        if (updated) this.emitStateUpdate(updated);
      }
    }
  }

  private decodeTwoBytePosition(buf: Buffer): { raw: number; percent: number } {
    if (buf.length === 1) {
      const raw = buf.readUInt8(0);
      const percent = raw <= 100 ? raw : Math.round((raw / 255) * 100);
      return { raw, percent };
    }
    if (buf.length >= 2) {
      const raw = buf.readUInt16BE(0);
      if (raw <= 100) {
        return { raw, percent: raw };
      }
      if (raw <= 255) {
        return { raw, percent: Math.round((raw / 255) * 100) };
      }
      return { raw, percent: Math.round((raw / 65535) * 100) };
    }
    return { raw: 0, percent: 0 };
  }

  private handleIndicationPacket(packet: any): void {
    try {
      const cemi = packet?.cEMIMessage;
      if (!cemi || !cemi.npdu || !cemi.dstAddress) return;
      if (!cemi.npdu.isGroupWrite && !cemi.npdu.isGroupResponse) return;

      const ga = cemi.dstAddress.toString();
      const dataBuf: Buffer | undefined = cemi.npdu.dataValue;
      if (!dataBuf) return;

      this.handleIncomingTelegram(ga, dataBuf);
    } catch (err) {
      console.error('[KNX] Failed to parse indication telegram:', err);
    }
  }

  private scheduleStartupStatusReads(): void {
    const readTargets = getStartupReadGroupAddresses();
    let index = 0;

    const readNext = () => {
      if (!this.client || !this.connected || index >= readTargets.length) {
        this.startupReadTimer = null;
        return;
      }
      const target = readTargets[index++];
      this.client.read(target.ga).catch((err) => {
        console.warn(`[KNX] Startup read failed for ${target.ga}:`, err?.message ?? err);
      });
      this.startupReadTimer = setTimeout(readNext, 100);
    };

    this.startupReadTimer = setTimeout(readNext, 100);
  }

  private enqueueCommand(fn: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.commandQueue.push({ run: fn, resolve, reject });
      this.drainQueue();
    });
  }

  private async drainQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.commandQueue.length > 0) {
      const item = this.commandQueue.shift()!;
      try {
        await item.run();
        item.resolve();
      } catch (err) {
        item.reject(err);
      }
      if (this.commandQueue.length > 0) {
        await new Promise((r) => setTimeout(r, this.minCommandIntervalMs));
      }
    }

    this.processingQueue = false;
  }

  private emitStateUpdate(device: KnxDeviceWithState): void {
    this.emit('knx-state', device);
  }
}

export const globalKnxService = new KnxService();
