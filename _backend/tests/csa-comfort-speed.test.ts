import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { globalCSARouter } from '../src/repo/csa-router.js';

describe('CSA Comfort and Speed Routing', () => {
  before(async () => {
    await globalCSARouter.loadGraph();
    assert.equal(globalCSARouter.ready, true, 'Router must be ready');
  });

  it('scoreRoute correctly evaluates duration, rail bonus, and transfer penalties', () => {
    const targetSec = 19 * 3600; // 19:00:00

    const fastRailRoute = {
      total_duration_minutes: 69,
      num_transfers: 2,
      arrival_time: '18:38:00',
      legs: [
        { route_type: 99, route_short_name: 'Walk' },
        { route_type: 0, route_short_name: '4' },
        { route_type: 2, route_short_name: 'S1' },
        { route_type: 3, route_short_name: '402' }
      ]
    };

    const slowBusRoute = {
      total_duration_minutes: 80,
      num_transfers: 2,
      arrival_time: '18:56:00',
      legs: [
        { route_type: 99, route_short_name: 'Walk' },
        { route_type: 3, route_short_name: '601' },
        { route_type: 3, route_short_name: '411' },
        { route_type: 3, route_short_name: '412' }
      ]
    };

    const railScore = globalCSARouter.scoreRoute(fastRailRoute, targetSec);
    const busScore = globalCSARouter.scoreRoute(slowBusRoute, targetSec);

    assert.ok(railScore < busScore, `Rail route score (${railScore}) should be better than slow bus score (${busScore})`);
  });

  it('findReverseRoute selects faster S1 connection over slow multi-bus route for 19:00 arrival', () => {
    const latA = 48.2684159;
    const lonA = 14.2517532; // HTL Leonding
    const latB = 48.1492485;
    const lonB = 14.4264341; // Pfarrfeld 6 Hargelsberg

    const routes = globalCSARouter.findReverseRoute(latA, lonA, latB, lonB, '19:00:00');
    assert.ok(routes.length > 0, 'Routes should be found');

    const topRoute = routes[0];
    assert.ok(
      topRoute.legs.some((l: any) => l.route_short_name === 'S1'),
      'Top route should utilize the S1 train connection'
    );
    assert.ok(
      topRoute.legs.some((l: any) => l.route_short_name === '402'),
      'Top route should utilize Bus 402'
    );
    assert.ok(
      topRoute.total_duration_minutes < 75,
      `Top route travel duration (${topRoute.total_duration_minutes}m) should be faster than 75m`
    );
    assert.ok(
      topRoute.arrival_time <= '19:00:00',
      `Arrival time (${topRoute.arrival_time}) should be <= target 19:00:00`
    );
  });

  it('findReverseRoute respects min_departure_time filtering', () => {
    const latA = 48.2684159;
    const lonA = 14.2517532;
    const latB = 48.1492485;
    const lonB = 14.4264341;

    // If min_departure_time is 17:35:00, S1 (dep 17:29) is in the past, so next viable route must depart >= 17:35
    const routes = globalCSARouter.findReverseRoute(latA, lonA, latB, lonB, '19:00:00', undefined, '17:35:00');
    assert.ok(routes.length > 0, 'Should find route');
    assert.ok(routes[0].departure_time >= '17:35:00', `Departure (${routes[0].departure_time}) must be >= 17:35:00`);
  });

  it('HTTP endpoint GET /api/bus/route returns the comfort and speed optimized route', async () => {
    const express = (await import('express')).default;
    const busRouter = (await import('../src/routers/bus-route.js')).default;
    const app = express();
    app.use(busRouter);

    let server: any;
    try {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
      });
      const port = server.address().port;
      const url = `http://localhost:${port}/api/bus/route?lat_a=48.2684159&lon_a=14.2517532&lat_b=48.1492485&lon_b=14.4264341&arrival_time=19:00:00&max_transfers=2`;
      const res = await fetch(url);
      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.ok(Array.isArray(data) && data.length > 0, 'Should return route array');
      assert.ok(data[0].legs.some((l: any) => l.route_short_name === 'S1'), 'Primary route should use S1 train');
      assert.ok(data[0].total_duration_minutes < 75, 'Duration should be under 75m');
    } finally {
      if (server) server.close();
    }
  });
});
