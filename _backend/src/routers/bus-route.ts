import {Router, Request, Response} from 'express';
import {parseCoordinatePair, validateTimeFormat, validateMaxTransfers} from '../utils/validation.js';
import { globalCSARouter } from '../repo/csa-router.js';

const router = Router();

console.log('bus router loaded');

// Test endpoint for routing backend
router.get('/api/bus/test', async (req: Request, res: Response) => {
    try {
        return res.json({
            status: globalCSARouter.ready ? 'ok' : 'loading',
            backend: 'csa-in-memory',
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Route finding endpoint
// GET /api/bus/route?lat_a=48.30&lon_a=14.28&lat_b=48.25&lon_b=14.32&departure_time=08:30:00&max_transfers=2
router.get('/api/bus/route', async (req: Request, res: Response) => {
    try {
        const { lat_a, lon_a, lat_b, lon_b, departure_time, arrival_time, min_departure_time, max_transfers } = req.query;

        const coords = parseCoordinatePair(lat_a as string, lon_a as string, lat_b as string, lon_b as string);
        if (!coords.valid) {
            return res.status(400).json({ error: coords.error });
        }

        let timeResult;
        let isArrival = false;
        
        if (arrival_time) {
            timeResult = validateTimeFormat(arrival_time as string, 'arrival_time');
            isArrival = true;
        } else {
            timeResult = validateTimeFormat(departure_time as string, 'departure_time');
        }

        if (!timeResult.valid) {
            return res.status(400).json({ error: timeResult.error });
        }

        let minDepTime: string | null = null;
        if (min_departure_time) {
            const rawMinDep = String(min_departure_time).trim();
            const normalizedMinDep = /^\d{2}:\d{2}$/.test(rawMinDep) ? `${rawMinDep}:00` : rawMinDep;
            const minDepResult = validateTimeFormat(normalizedMinDep, 'min_departure_time');
            if (!minDepResult.valid) {
                return res.status(400).json({ error: minDepResult.error });
            }
            minDepTime = minDepResult.time;
        }

        const transfersResult = validateMaxTransfers(max_transfers as string);
        if (!transfersResult.valid) {
            return res.status(400).json({ error: transfersResult.error });
        }

        if (!globalCSARouter.ready) {
            return res.status(503).json({ error: 'Transit routing graph not ready' });
        }

        let routes = [];
        if (isArrival) {
            routes = globalCSARouter.findReverseRoute(
                coords.latA, coords.lonA,
                coords.latB, coords.lonB,
                timeResult.time
            );
            if (minDepTime && (!routes || routes.length === 0 || routes[0].departure_time < minDepTime)) {
                routes = globalCSARouter.findRoute(
                    coords.latA, coords.lonA,
                    coords.latB, coords.lonB,
                    minDepTime
                );
            }
        } else {
            routes = globalCSARouter.findRoute(
                coords.latA, coords.lonA,
                coords.latB, coords.lonB,
                timeResult.time
            );
        }
        res.set('X-Route-Backend', 'csa-in-memory');
        
        res.json(routes);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
