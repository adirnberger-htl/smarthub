import test from 'node:test';
import assert from 'node:assert/strict';
import { globalKnxService } from '../src/services/knx-service.js';
import { getWeatherStatus } from '../src/repo/weather-repo.js';
import { getPlacesStatus } from '../src/repo/places-repo.js';
import devRouter from '../src/routers/dev.js';

test('KnxService provides connection status and events', () => {
  const status = globalKnxService.getConnectionStatus();
  assert.equal(typeof status.enabled, 'boolean');
  assert.equal(typeof status.connected, 'boolean');
  assert.equal(status.protocol, 'Multicast');
  assert.equal(status.multicastIp, '224.0.23.12');
  assert.equal(status.port, 3671);
  assert.equal(status.physAddr, '1.2.6');
});

test('getWeatherStatus returns cached/in-memory status without outbound requests', () => {
  const weather = getWeatherStatus();
  assert.equal(weather.provider, 'Open-Meteo');
  assert.equal(typeof weather.cachedEntries, 'number');
  assert.ok(['ok', 'error'].includes(weather.status));
});

test('getPlacesStatus returns configuration and in-memory status', () => {
  const places = getPlacesStatus();
  assert.equal(places.provider, 'Google Maps / Places');
  assert.equal(typeof places.keyConfigured, 'boolean');
  assert.equal(typeof places.cachedEntries, 'number');
  assert.ok(['ok', 'missing_key', 'error'].includes(places.status));
});

test('devRouter endpoint is defined', () => {
  assert.ok(devRouter);
  const routes = devRouter.stack.map((layer: any) => layer.route?.path).filter(Boolean);
  assert.ok(routes.includes('/api/dev/status'), 'Route /api/dev/status should exist');
});
