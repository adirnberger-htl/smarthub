# Tasks

## 1. Direct GTFS / Cache Loader & Small-Server Docker Diet

- [x] 1.1 Implement direct GTFS CSV parsing (`stops.txt`, `routes.txt`, `calendar.txt`, `calendar_dates.txt`, `trips.txt`, `stop_times.txt`) and disk cache serialization (`/data/csa-graph-cache.json` or binary) in `_backend/src/repo/csa-router.ts` (with automatic `.zip` extraction if needed and Neo4j fallback if local `/data` files are absent) and verify `globalCSARouter` loads and marks `ready = true` directly from `/data` without Neo4j
- [x] 1.2 Update `docker-compose.yaml` to mount `./data:/data` into `backend`, remove the hard runtime dependency on `neo4j` health for `backend` startup, and tune down `NODE_OPTIONS` and Neo4j memory limits for small-server deployment, verifying `docker compose config` validates cleanly

## 2. Compact CSA Data Structures, Service Filtering & Query Speed

- [x] 2.1 Refactor `CSARouter` in `_backend/src/repo/csa-router.ts` to use integer stop/trip indices, TypedArray connection columns, and GTFS service-day (`calendar.txt` / `calendar_dates.txt`) filtering with out-of-range date fallback, verifying memory reduction and active service filtering
- [x] 2.2 Add latitude/longitude bounding-box pre-filtering to `findStopsWithinRadius` and binary search helpers (`findFirstDepartureIndex` and `findFirstArrivalReverseIndex`) in `_backend/src/repo/csa-router.ts`, verifying stop radius accuracy and exact index bounds
- [x] 2.3 Update `findRoute` and `findReverseRoute` in `_backend/src/repo/csa-router.ts` to use binary search start indices, dynamic `bestTotalTime` early exit via `endStopWalkMap`/`startStopWalkMap`, flat per-query typed arrays, and reachable-only `tripNextConnection` recording, verifying sub-5ms query execution and valid multi-leg route reconstruction
- [x] 2.4 Add `min_departure_time` query parameter support to `GET /api/bus/route` in `_backend/src/routers/bus-route.ts` so arrival-time queries automatically fall back to forward departure-time search in a single request when the reverse route departs before `min_departure_time` or is empty, and verify via endpoint test

## 3. Place Geocoding & Autocomplete Caching

- [x] 3.1 Implement normalized TTL caching (24h geocode, 1h autocomplete, max 500 entries), 15s negative failure caching, and in-flight Promise deduplication for `geocodePlace` and `autocompletePlace` in `_backend/src/repo/places-repo.ts`, and verify cache hits, preserved `place` field, and concurrent request deduplication

## 4. Routine Coordinate Persistence & Frontend Fetch Optimizations

- [x] 4.1 Extend `RoutineItem` in `_frontend/smarthub/app/composables/use-settings.ts` and `autoConfigure` in `_frontend/smarthub/app/pages/settings.vue` to store and preserve `startCoords` and `destCoords` inside routine `config` (invalidating when the address string changes), and verify coordinates persist across routine API serialization
- [x] 4.2 Update `_frontend/smarthub/app/components/address-autocomplete.vue` to emit `update:modelValue` on suggestion selection, Enter, or synchronous input blur (while keeping debounced autocomplete fetching on typing), and verify typing does not fire `PUT /api/routines/:id` on every keystroke
- [x] 4.3 Update `_frontend/smarthub/app/components/bus-widget.vue` and `_frontend/smarthub/app/components/weather-widget.vue` (and `pages/dashboard.vue`) to reuse stored routine coordinates when available, pass `min_departure_time` in `BusWidget` for single-request fallback, and narrow `BusWidget`'s watcher to `[startAddress, destination, arrivalTime]`, verifying no redundant geocode or route calls occur on non-routing routine edits
