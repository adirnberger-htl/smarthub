import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { globalKnxService } from '../services/knx-service.js';
import { globalCSARouter } from '../repo/csa-router.js';
import { getWeatherStatus } from '../repo/weather-repo.js';
import { getPlacesStatus } from '../repo/places-repo.js';
import { getCarRoutingStatus } from '../repo/car-router.js';
import { findGoogleAccountByUserId } from '../repo/auth-repo.js';

const router = Router();

router.get('/api/dev/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const googleAccount = findGoogleAccountByUserId(req.user.id);
  const knxStatus = globalKnxService.getConnectionStatus();
  const weatherStatus = getWeatherStatus();
  const placesStatus = getPlacesStatus();
  const carStatus = getCarRoutingStatus();

  return res.json({
    timestamp: new Date().toISOString(),
    knx: knxStatus,
    apis: {
      backend: {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      csaTransit: {
        status: globalCSARouter.ready ? 'ok' : 'loading',
        ready: globalCSARouter.ready,
        backend: 'csa-in-memory',
      },
      carRouting: carStatus,
      weather: weatherStatus,
      googlePlaces: placesStatus,
      googleAuth: {
        status: googleAccount ? 'ok' : 'not_connected',
        connected: Boolean(googleAccount),
        email: googleAccount?.email ?? null,
      },
    },
  });
});

export default router;
