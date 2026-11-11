import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCarRoute, getCarRoutingStatus } from '../src/repo/car-router.js';
import carRouter from '../src/routers/car-route.js';

test('End-to-End Car Commute Routing Workflow', async () => {
  // 1. Calculate route from Linz Hauptplatz (48.3060, 14.2861) to PlusCity Pasching (48.2435, 14.2343)
  const route = await calculateCarRoute({
    latA: 48.3060,
    lonA: 14.2861,
    latB: 48.2435,
    lonB: 14.2343,
    arrivalTime: '08:45:00'
  });

  assert.ok(route, 'Route must be returned');
  assert.equal(route.arrivalTime, '08:45:00');
  assert.ok(route.departureTime < route.arrivalTime, 'Departure must precede arrival');
  assert.ok(route.durationSeconds > 0, 'Duration must be positive');
  assert.ok(route.distanceMeters > 5000, 'Distance must exceed 5km');
  assert.ok(route.steps.length > 0, 'Must contain route maneuver steps');
  assert.ok(Array.isArray(route.geometry) && route.geometry.length >= 2, 'Must contain route geometry coordinates');
  assert.ok(['normal', 'moderate', 'heavy'].includes(route.trafficCondition));
  assert.ok(['google', 'osrm'].includes(route.provider));

  // 2. Departure calculation matches arrival time minus duration in traffic
  const [arrH, arrM, arrS] = route.arrivalTime.split(':').map(Number);
  const [depH, depM, depS] = route.departureTime.split(':').map(Number);
  const arrSec = arrH * 3600 + arrM * 60 + arrS;
  const depSec = depH * 3600 + depM * 60 + depS;
  const diffSec = (arrSec - depSec + 86400) % 86400;
  assert.equal(diffSec, route.durationInTrafficSeconds, 'Time difference must equal traffic duration');

  // 3. Dev status reports carRouting health
  const devStatus = getCarRoutingStatus();
  assert.ok(devStatus);
  assert.ok(['Google Directions', 'OSRM'].includes(devStatus.provider));
  assert.ok(devStatus.cachedEntries >= 1);
  assert.ok(['ok', 'degraded'].includes(devStatus.status));

  // 4. Express router integration
  const layer = carRouter.stack.find((l: any) => l.route?.path === '/api/car/route');
  assert.ok(layer, 'Route layer exists');
  const handler = layer.route.stack[0].handle;

  let statusCode = 200;
  let responseData: any = null;
  const mockReq: any = {
    query: {
      lat_a: '48.3060',
      lon_a: '14.2861',
      lat_b: '48.2435',
      lon_b: '14.2343',
      arrival_time: '08:45'
    }
  };
  const mockRes: any = {
    status(c: number) { statusCode = c; return this; },
    json(d: any) { responseData = d; return this; },
    set() { return this; }
  };
  await handler(mockReq, mockRes);
  assert.equal(statusCode, 200);
  assert.equal(responseData.arrivalTime, '08:45:00');
  assert.ok(responseData.durationSeconds > 0);
});
