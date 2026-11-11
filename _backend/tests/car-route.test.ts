import test from 'node:test';
import assert from 'node:assert/strict';
import carRouter from '../src/routers/car-route.js';

test('carRouter defines /api/car/route endpoint', () => {
  assert.ok(carRouter);
  const routes = carRouter.stack.map((layer: any) => layer.route?.path).filter(Boolean);
  assert.ok(routes.includes('/api/car/route'), 'Route /api/car/route should exist');
});

test('carRouter handles route computation via Express request/response simulation', async () => {
  // Find route handler
  const layer = carRouter.stack.find((l: any) => l.route?.path === '/api/car/route');
  assert.ok(layer, 'Route layer should be found');
  const handler = layer.route.stack[0].handle;

  // Test 1: Missing coordinates -> 400
  let statusCode = 200;
  let jsonResponse: any = null;
  const mockReq1: any = { query: {} };
  const mockRes1: any = {
    status(code: number) { statusCode = code; return this; },
    json(data: any) { jsonResponse = data; return this; },
    set() { return this; }
  };
  await handler(mockReq1, mockRes1);
  assert.equal(statusCode, 400);
  assert.ok(jsonResponse?.error?.includes('Missing required parameters'));

  // Test 2: Valid coordinates -> 200
  statusCode = 200;
  jsonResponse = null;
  const mockReq2: any = {
    query: {
      lat_a: '48.2902',
      lon_a: '14.2906',
      lat_b: '48.3373',
      lon_b: '14.3203',
      arrival_time: '08:30'
    }
  };
  const mockRes2: any = {
    status(code: number) { statusCode = code; return this; },
    json(data: any) { jsonResponse = data; return this; },
    set() { return this; }
  };
  await handler(mockReq2, mockRes2);
  assert.equal(statusCode, 200);
  assert.ok(jsonResponse);
  assert.equal(jsonResponse.arrivalTime, '08:30:00');
  assert.ok(jsonResponse.durationSeconds > 0);
  assert.ok(jsonResponse.steps.length > 0);
});
