import { Router, Request, Response } from 'express';
import { parseCoordinatePair, validateTimeFormat } from '../utils/validation.js';
import { calculateCarRoute } from '../repo/car-router.js';

const router = Router();

// GET /api/car/route?lat_a=48.29&lon_a=14.29&lat_b=48.33&lon_b=14.32&arrival_time=08:30:00
router.get('/api/car/route', async (req: Request, res: Response) => {
  try {
    const { lat_a, lon_a, lat_b, lon_b, departure_time, arrival_time } = req.query;

    const coords = parseCoordinatePair(lat_a as string, lon_a as string, lat_b as string, lon_b as string);
    if (!coords.valid) {
      return res.status(400).json({ error: coords.error });
    }

    let depTime: string | undefined;
    let arrTime: string | undefined;

    if (arrival_time) {
      const rawArrival = String(arrival_time).trim();
      const normalizedArrival = /^\d{2}:\d{2}$/.test(rawArrival) ? `${rawArrival}:00` : rawArrival;
      const arrivalResult = validateTimeFormat(normalizedArrival, 'arrival_time');
      if (!arrivalResult.valid) {
        return res.status(400).json({ error: arrivalResult.error });
      }
      arrTime = arrivalResult.time;
    } else if (departure_time) {
      const rawDep = String(departure_time).trim();
      const normalizedDep = /^\d{2}:\d{2}$/.test(rawDep) ? `${rawDep}:00` : rawDep;
      const depResult = validateTimeFormat(normalizedDep, 'departure_time');
      if (!depResult.valid) {
        return res.status(400).json({ error: depResult.error });
      }
      depTime = depResult.time;
    }

    const route = await calculateCarRoute({
      latA: coords.latA,
      lonA: coords.lonA,
      latB: coords.latB,
      lonB: coords.lonB,
      arrivalTime: arrTime,
      departureTime: depTime
    });

    res.set('X-Route-Backend', route.provider);
    return res.json(route);
  } catch (err: any) {
    console.error('Car routing endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || 'Driving route calculation failed'
    });
  }
});

export default router;
