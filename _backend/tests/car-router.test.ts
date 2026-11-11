import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCarRoute, getCarRoutingStatus } from '../src/repo/car-router.js';

test('getCarRoutingStatus returns initial status', () => {
  const status = getCarRoutingStatus();
  assert.ok(status.provider === 'Google Directions' || status.provider === 'OSRM');
  assert.equal(typeof status.keyConfigured, 'boolean');
  assert.equal(typeof status.cachedEntries, 'number');
  assert.ok(['ok', 'degraded', 'error'].includes(status.status));
});

test('calculateCarRoute computes driving route between Linz Hbf and JKU Linz', async () => {
  // Linz Hbf (48.2902, 14.2906) to JKU Linz (48.3373, 14.3203)
  const result = await calculateCarRoute({
    latA: 48.2902,
    lonA: 14.2906,
    latB: 48.3373,
    lonB: 14.3203,
    arrivalTime: '08:30:00'
  });

  assert.ok(result);
  assert.equal(result.arrivalTime, '08:30:00');
  assert.ok(result.durationSeconds > 0, 'Duration should be positive');
  assert.ok(result.distanceMeters > 3000, 'Distance should be greater than 3km');
  assert.ok(result.departureTime < result.arrivalTime, 'Departure time should be earlier than arrival time');
  assert.ok(['normal', 'moderate', 'heavy'].includes(result.trafficCondition));
  assert.ok(result.steps.length > 0, 'Should return route steps');
  assert.ok(Array.isArray(result.geometry), 'Should return geometry array');
  assert.ok(result.geometry.length >= 2, 'Geometry should contain at least 2 coordinate points');
  assert.equal(result.geometry[0].length, 2, 'Coordinate should be [lat, lon]');
  assert.ok(['google', 'osrm'].includes(result.provider));

  // Verify caching: second call returns same result
  const cachedResult = await calculateCarRoute({
    latA: 48.2902,
    lonA: 14.2906,
    latB: 48.3373,
    lonB: 14.3203,
    arrivalTime: '08:30:00'
  });
  assert.equal(cachedResult.durationSeconds, result.durationSeconds);
  const statusAfter = getCarRoutingStatus();
  assert.ok(statusAfter.cachedEntries >= 1, 'Cache should have entries');
});
