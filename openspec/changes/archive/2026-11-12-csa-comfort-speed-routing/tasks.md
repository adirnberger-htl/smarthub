# Tasks

## 1. Engine Multi-Candidate Probing & Utility Scoring

- [x] 1.1 Add route scoring logic in `_backend/src/repo/csa-router.ts` evaluating transit duration, transfer penalty (+8m), rail/tram comfort bonus (-12m for types 2 and 0), and early arrival offset (+0.3m/min). Verify function returns correct relative scores for test itineraries.
- [x] 1.2 Implement arrival-window candidate probing in `findReverseRoute` in `_backend/src/repo/csa-router.ts` (evaluating up to 4 candidate reverse scans within a 45-minute lookback window) and rank candidates. Verify `findReverseRoute` returns sorted candidates with the highest-utility route at index 0.
- [x] 1.3 Create unit test suite `_backend/tests/csa-comfort-speed.test.ts` asserting that for target arrival 19:00 from Leonding to Hargelsberg, the S1 rail connection is selected over the 3-bus itinerary. Verify with `npm test`.

## 2. Performance Benchmarks & End-to-End Verification

- [x] 2.1 Add reverse window search benchmarks to `_backend/tests/route-perf.bench.ts` validating that p95 latency remains under 10ms across 100+ queries. Verify by running `npm run test:perf`.
- [x] 2.2 Test `GET /api/bus/route` integration with routine parameters to confirm client components (`BusWidget.vue`, `settings.vue`) receive the optimal route without contract changes.
