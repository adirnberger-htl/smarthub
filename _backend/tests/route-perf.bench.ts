import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import http from 'node:http';
import express from 'express';
import { globalCSARouter } from '../src/repo/csa-router.js';
import busRouter from '../src/routers/bus-route.js';

interface LatencyStats {
  min: number;
  p50: number;
  mean: number;
  p95: number;
  p99: number;
  max: number;
  opsPerSec: number;
}

function computeStats(samplesMs: number[]): LatencyStats {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  return {
    min: sorted[0],
    p50: sorted[Math.floor(n * 0.5)],
    mean,
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    max: sorted[n - 1],
    opsPerSec: Math.round(1000 / mean)
  };
}

function formatStats(s: LatencyStats): string {
  return `p50=${s.p50.toFixed(3)}ms p95=${s.p95.toFixed(3)}ms p99=${s.p99.toFixed(3)}ms mean=${s.mean.toFixed(3)}ms (${s.opsPerSec} ops/s)`;
}

const FIXED_DATE = '20261109'; // Monday

const BENCHMARK_ROUTES = [
  {
    name: 'Walk-Only Very Short (<400m inside Linz)',
    latA: 48.3039, lonA: 14.2869,
    latB: 48.3059, lonB: 14.2862,
    maxFwdP50Ms: 0.35,
    maxFwdP95Ms: 0.80,
    maxBwdP50Ms: 0.35,
    maxBwdP95Ms: 0.80
  },
  {
    name: 'Short Urban (Linz Hbf -> Taubenmarkt)',
    latA: 48.2901, lonA: 14.2917,
    latB: 48.3039, lonB: 14.2869,
    maxFwdP50Ms: 0.50,
    maxFwdP95Ms: 1.00,
    maxBwdP50Ms: 1.50,
    maxBwdP95Ms: 3.00
  },
  {
    name: 'Campus Commute (Linz Hbf -> JKU Altenberger Str)',
    latA: 48.2901, lonA: 14.2917,
    latB: 48.3366, lonB: 14.3193,
    maxFwdP50Ms: 0.70,
    maxFwdP95Ms: 1.40,
    maxBwdP50Ms: 2.00,
    maxBwdP95Ms: 4.00
  },
  {
    name: 'Suburban Multi-Transfer (JKU -> PlusCity Pasching)',
    latA: 48.3366, lonA: 14.3193,
    latB: 48.2452, lonB: 14.2361,
    maxFwdP50Ms: 0.90,
    maxFwdP95Ms: 1.80,
    maxBwdP50Ms: 2.50,
    maxBwdP95Ms: 5.00
  },
  {
    name: 'Regional Medium (Linz Hbf -> Wels Hbf)',
    latA: 48.2901, lonA: 14.2917,
    latB: 48.1656, lonB: 14.0266,
    maxFwdP50Ms: 1.40,
    maxFwdP95Ms: 2.50,
    maxBwdP50Ms: 3.00,
    maxBwdP95Ms: 6.00
  },
  {
    name: 'Regional Long (Linz Hbf -> Steyr Bahnhof)',
    latA: 48.2901, lonA: 14.2917,
    latB: 48.0427, lonB: 14.4267,
    maxFwdP50Ms: 1.60,
    maxFwdP95Ms: 3.00,
    maxBwdP50Ms: 3.00,
    maxBwdP95Ms: 6.00
  }
];

describe('Route Fetching Logic Performance & Regression Suite', () => {
  let server: http.Server;
  let baseUrl = '';
  let warmLoadMs = 0;

  before(async () => {
    const t0 = performance.now();
    await globalCSARouter.loadGraph();
    warmLoadMs = performance.now() - t0;

    const app = express();
    app.use(busRouter);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    if (server) server.close();
  });

  it('loads compiled CSA routing graph within startup budget (< 500ms warm)', () => {
    assert.equal(globalCSARouter.ready, true, 'CSARouter should be marked ready');
    console.log(`  [Graph Init] Warm load: ${warmLoadMs.toFixed(2)}ms (budget: < 500ms)`);
    assert.ok(warmLoadMs < 500, `Expected warm cache load < 500ms, got ${warmLoadMs.toFixed(2)}ms`);
  });

  it('executes binary search on connection arrays within budget (p95 < 0.02ms)', () => {
    const samples: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const targetSec = (i * 17) % 86400;
      const t0 = performance.now();
      const fwdIdx = globalCSARouter.findFirstDepartureIndex(targetSec);
      const bwdIdx = globalCSARouter.findFirstArrivalReverseIndex(targetSec);
      samples.push(performance.now() - t0);
      assert.ok(fwdIdx >= 0 && bwdIdx >= 0);
    }
    const s = computeStats(samples);
    console.log(`  [Binary Search] ${formatStats(s)}`);
    assert.ok(s.p95 < 0.02, `Binary search p95 ${s.p95.toFixed(4)}ms exceeded 0.02ms budget`);
  });

  it('finds stops within walking radius in urban and remote areas within budget', () => {
    // Urban Linz (199 stops in radius)
    for (let w = 0; w < 20; w++) globalCSARouter.findStopsWithinRadius(48.2901, 14.2917, 1500);
    const urbanSamples: number[] = [];
    let urbanStopsCount = 0;
    for (let i = 0; i < 500; i++) {
      const t0 = performance.now();
      const res = globalCSARouter.findStopsWithinRadius(48.2901, 14.2917, 1500);
      urbanSamples.push(performance.now() - t0);
      urbanStopsCount = res.length;
    }
    const su = computeStats(urbanSamples);
    console.log(`  [Stop Radius Urban (${urbanStopsCount} stops)] ${formatStats(su)}`);
    assert.ok(urbanStopsCount > 50, 'Expected >50 stops near Linz Hbf');
    assert.ok(su.p50 < 0.12, `Urban stop search p50 ${su.p50.toFixed(3)}ms exceeded 0.12ms budget`);
    assert.ok(su.p95 < 0.25, `Urban stop search p95 ${su.p95.toFixed(3)}ms exceeded 0.25ms budget`);

    // Remote coordinate fallback (0 stops within 1.5km -> equirectangular nearest fallback)
    for (let w = 0; w < 20; w++) globalCSARouter.findStopsWithinRadius(47.5, 13.5, 1500);
    const remoteSamples: number[] = [];
    for (let i = 0; i < 500; i++) {
      const t0 = performance.now();
      const res = globalCSARouter.findStopsWithinRadius(47.5, 13.5, 1500);
      remoteSamples.push(performance.now() - t0);
      assert.equal(res.length, 1, 'Fallback must return single nearest stop');
    }
    const sr = computeStats(remoteSamples);
    console.log(`  [Stop Radius Remote Fallback] ${formatStats(sr)}`);
    assert.ok(sr.p50 < 0.15, `Remote fallback stop search p50 ${sr.p50.toFixed(3)}ms exceeded 0.15ms budget`);
    assert.ok(sr.p95 < 0.30, `Remote fallback stop search p95 ${sr.p95.toFixed(3)}ms exceeded 0.30ms budget`);
  });

  it('caches active service mask with sub-microsecond lookup', () => {
    const maskMon = globalCSARouter.getActiveServiceMask('20261109'); // Monday
    const maskSun = globalCSARouter.getActiveServiceMask('20261108'); // Sunday
    assert.ok(maskMon.length > 100);
    assert.notDeepEqual(maskMon, maskSun, 'Monday and Sunday service masks should differ');

    const samples: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const t0 = performance.now();
      globalCSARouter.getActiveServiceMask(FIXED_DATE);
      samples.push(performance.now() - t0);
    }
    const s = computeStats(samples);
    console.log(`  [Service Mask Cache] ${formatStats(s)}`);
    assert.ok(s.p95 < 0.01, `Cached service mask p95 ${s.p95.toFixed(4)}ms exceeded 0.01ms budget`);
  });

  it('meets forward routing (findRoute) latency and correctness budgets across all scenarios', () => {
    const ITERS = 150;
    for (const scenario of BENCHMARK_ROUTES) {
      for (let w = 0; w < 15; w++) {
        globalCSARouter.findRoute(scenario.latA, scenario.lonA, scenario.latB, scenario.lonB, '08:00:00', FIXED_DATE);
      }

      const samples: number[] = [];
      let routes: any[] = [];
      for (let i = 0; i < ITERS; i++) {
        const t0 = performance.now();
        routes = globalCSARouter.findRoute(scenario.latA, scenario.lonA, scenario.latB, scenario.lonB, '08:00:00', FIXED_DATE);
        samples.push(performance.now() - t0);
      }

      assert.ok(Array.isArray(routes) && routes.length > 0, `Expected forward route for ${scenario.name}`);
      const route = routes[0];
      assert.ok(Array.isArray(route.legs) && route.legs.length > 0, `Expected non-empty legs for ${scenario.name}`);
      assert.ok(route.departure_time >= '08:00:00', `Expected departure >= 08:00:00, got ${route.departure_time}`);

      const s = computeStats(samples);
      console.log(`  [FWD] ${scenario.name}: ${formatStats(s)} (budget p50<${scenario.maxFwdP50Ms}ms, p95<${scenario.maxFwdP95Ms}ms)`);
      assert.ok(
        s.p50 <= scenario.maxFwdP50Ms,
        `[FWD] ${scenario.name} p50=${s.p50.toFixed(3)}ms exceeded budget ${scenario.maxFwdP50Ms}ms`
      );
      assert.ok(
        s.p95 <= scenario.maxFwdP95Ms,
        `[FWD] ${scenario.name} p95=${s.p95.toFixed(3)}ms exceeded budget ${scenario.maxFwdP95Ms}ms`
      );
    }
  });

  it('meets reverse routing (findReverseRoute) latency and correctness budgets across all scenarios', () => {
    const ITERS = 150;
    for (const scenario of BENCHMARK_ROUTES) {
      for (let w = 0; w < 15; w++) {
        globalCSARouter.findReverseRoute(scenario.latA, scenario.lonA, scenario.latB, scenario.lonB, '08:30:00', FIXED_DATE);
      }

      const samples: number[] = [];
      let routes: any[] = [];
      for (let i = 0; i < ITERS; i++) {
        const t0 = performance.now();
        routes = globalCSARouter.findReverseRoute(scenario.latA, scenario.lonA, scenario.latB, scenario.lonB, '08:30:00', FIXED_DATE);
        samples.push(performance.now() - t0);
      }

      assert.ok(Array.isArray(routes) && routes.length > 0, `Expected reverse route for ${scenario.name}`);
      const route = routes[0];
      assert.ok(Array.isArray(route.legs) && route.legs.length > 0, `Expected non-empty legs for ${scenario.name}`);
      assert.ok(route.arrival_time <= '08:30:00', `Expected arrival <= 08:30:00, got ${route.arrival_time}`);

      const s = computeStats(samples);
      console.log(`  [BWD] ${scenario.name}: ${formatStats(s)} (budget p50<${scenario.maxBwdP50Ms}ms, p95<${scenario.maxBwdP95Ms}ms)`);
      assert.ok(
        s.p50 <= scenario.maxBwdP50Ms,
        `[BWD] ${scenario.name} p50=${s.p50.toFixed(3)}ms exceeded budget ${scenario.maxBwdP50Ms}ms`
      );
      assert.ok(
        s.p95 <= scenario.maxBwdP95Ms,
        `[BWD] ${scenario.name} p95=${s.p95.toFixed(3)}ms exceeded budget ${scenario.maxBwdP95Ms}ms`
      );
    }
  });

  it('meets HTTP /api/bus/route latency budgets (forward, reverse, auto-fallback, and concurrent load)', async () => {
    const endpoints = [
      {
        name: 'HTTP Forward',
        url: `${baseUrl}/api/bus/route?lat_a=48.2901&lon_a=14.2917&lat_b=48.3366&lon_b=14.3193&departure_time=08:00:00&max_transfers=2`,
        maxP50Ms: 3.0,
        maxP95Ms: 8.0
      },
      {
        name: 'HTTP Reverse',
        url: `${baseUrl}/api/bus/route?lat_a=48.2901&lon_a=14.2917&lat_b=48.3366&lon_b=14.3193&arrival_time=08:30:00&min_departure_time=07:00:00&max_transfers=2`,
        maxP50Ms: 3.0,
        maxP95Ms: 8.0
      },
      {
        name: 'HTTP Reverse + Fallback',
        url: `${baseUrl}/api/bus/route?lat_a=48.2901&lon_a=14.2917&lat_b=48.3366&lon_b=14.3193&arrival_time=08:00:00&min_departure_time=08:15:00&max_transfers=2`,
        maxP50Ms: 4.0,
        maxP95Ms: 10.0
      }
    ];

    for (const ep of endpoints) {
      // Warmup
      for (let w = 0; w < 10; w++) {
        const res = await fetch(ep.url);
        await res.json();
      }

      const samples: number[] = [];
      for (let i = 0; i < 80; i++) {
        const t0 = performance.now();
        const res = await fetch(ep.url);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(Array.isArray(body) && body.length > 0);
        samples.push(performance.now() - t0);
      }

      const s = computeStats(samples);
      console.log(`  [${ep.name}] ${formatStats(s)} (budget p50<${ep.maxP50Ms}ms, p95<${ep.maxP95Ms}ms)`);
      assert.ok(s.p50 <= ep.maxP50Ms, `${ep.name} p50=${s.p50.toFixed(3)}ms exceeded ${ep.maxP50Ms}ms`);
      assert.ok(s.p95 <= ep.maxP95Ms, `${ep.name} p95=${s.p95.toFixed(3)}ms exceeded ${ep.maxP95Ms}ms`);
    }

    // Concurrent burst test (300 requests, concurrency 20)
    const TOTAL_REQ = 300;
    const CONCURRENCY = 20;
    let nextIdx = 0;
    const tStart = performance.now();

    async function worker() {
      while (true) {
        const idx = nextIdx++;
        if (idx >= TOTAL_REQ) break;
        const r = BENCHMARK_ROUTES[idx % BENCHMARK_ROUTES.length];
        const url = `${baseUrl}/api/bus/route?lat_a=${r.latA}&lon_a=${r.lonA}&lat_b=${r.latB}&lon_b=${r.lonB}&arrival_time=08:30:00&min_departure_time=07:30:00&max_transfers=2`;
        const res = await fetch(url);
        assert.equal(res.status, 200);
        await res.json();
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    const wallMs = performance.now() - tStart;
    const throughput = Math.round((TOTAL_REQ / wallMs) * 1000);
    console.log(`  [HTTP Concurrent Load] ${TOTAL_REQ} reqs in ${wallMs.toFixed(1)}ms (${throughput} req/s, budget > 250 req/s)`);
    assert.ok(throughput >= 250, `Concurrent HTTP throughput ${throughput} req/s fell below 250 req/s budget`);
  });
});
