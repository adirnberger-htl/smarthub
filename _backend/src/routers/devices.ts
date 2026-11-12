import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { DeviceCommandDTO, KnxEnvironmentDTO, SmartDeviceDTO } from '../repo/device-repo.js';
import {
  DeviceNotFoundError,
  DeviceValidationError,
  globalDeviceService,
} from '../services/device-service.js';
import { globalKnxService } from '../services/knx-service.js';

const router = Router();

router.get('/api/devices', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({
    devices: globalDeviceService.listDevices(),
    environment: globalDeviceService.getEnvironment(),
  });
});

router.get('/api/devices/events', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(
    `event: device-snapshot\ndata: ${JSON.stringify(globalDeviceService.listDevices())}\n\n`
  );
  res.write(
    `event: environment-state\ndata: ${JSON.stringify(globalDeviceService.getEnvironment())}\n\n`
  );
  res.write(
    `event: knx-status\ndata: ${JSON.stringify(globalKnxService.getConnectionStatus())}\n\n`
  );

  const onState = (device: SmartDeviceDTO) => {
    res.write(`event: device-state\ndata: ${JSON.stringify(device)}\n\n`);
  };

  const onEnv = (env: KnxEnvironmentDTO) => {
    res.write(`event: environment-state\ndata: ${JSON.stringify(env)}\n\n`);
  };

  const onKnxStatus = (status: unknown) => {
    res.write(`event: knx-status\ndata: ${JSON.stringify(status)}\n\n`);
  };

  globalDeviceService.on('device-state', onState);
  globalDeviceService.on('environment-state', onEnv);
  globalDeviceService.on('knx-status', onKnxStatus);

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    globalDeviceService.off('device-state', onState);
    globalDeviceService.off('environment-state', onEnv);
    globalDeviceService.off('knx-status', onKnxStatus);
  });
});

router.post('/api/devices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = String(req.params.id ?? '');
  const cmd = (req.body ?? {}) as DeviceCommandDTO;

  try {
    const updated = await globalDeviceService.executeCommand(id, cmd);
    return res.json(updated);
  } catch (err: any) {
    if (err instanceof DeviceNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof DeviceValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err?.message || 'Failed to control device' });
  }
});

export default router;
