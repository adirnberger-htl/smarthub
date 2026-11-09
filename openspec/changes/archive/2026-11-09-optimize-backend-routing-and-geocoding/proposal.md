# Proposal

## Why

Deploying SmartHub on a small, resource-constrained server exposes severe RAM, CPU, and network bottlenecks across the routine configuration and route calculation pipeline:
1. **Container & Graph Memory Bloat**: `docker-compose.yaml` provisions ~18 GB of heap limits across Neo4j (4 GB heap + 4 GB tx), `neo4j-loader` (4 GB), `backend` (4 GB), and `frontend` (6 GB), even though `CSARouter` loads the entire GTFS graph into Node.js memory at startup and never queries Neo4j again once ready. Inside Node.js, `CSARouter` stores ~746,000 connections twice as heavy JS objects with string IDs and ignores GTFS `calendar.txt` service days.
2. **Slow Per-Query CSA Scans**: `findRoute` and `findReverseRoute` scan all ~746k connections from index 0 without binary search or `bestTotalTime` early-exit bounds, `findReverseRoute` leaks ~500k `Map` entries per query (`tripNextConnection`), and `findStopsWithinRadius` runs full Haversine trigonometry on all 10,424 stops.
3. **Uncached Geocoding & Chatty Routine/Widget Fetching**: `places-repo.ts` has no cache, causing 3 external Google Geocoding calls on every dashboard load; routines do not persist resolved coordinates; `BusWidget` fires a 2-request waterfall when the arrival-based departure is in the past and re-fetches whenever non-routing routine fields (alarms, active days, name) change; and `AddressAutocomplete` triggers a `PUT /api/routines/:id` save every 500ms while typing.

## What Changes

- **Direct GTFS / Cache-File Loader & Small-Server Docker Diet**: Load GTFS stops, routes, trips, calendar services, and connections directly from `/data` CSVs (with a fast serialized disk cache) so `CSARouter` operates without requiring Neo4j at runtime, and lower container memory limits in `docker-compose.yaml` for small-server deployment.
- **Compact Integer/TypedArray CSA Graph & Service-Day Filtering**: Represent stops, trips, and connections with compact integer indices / typed arrays and filter connections by active GTFS service day (`calendar.txt` / `calendar_dates.txt`) so weekend/weekday-only trips are respected and memory usage drops by ~70%.
- **Binary Search, Early-Exit, Reachable-Only State & Bounding-Box Stop Lookup in `CSARouter`**: Jump directly to the start/target timestamp via binary search, break early once `bestTotalTime` cannot be improved, move `tripNextConnection.set(...)` inside `if (canTake)` in `findReverseRoute`, and pre-filter stops by lat/lon bounding box before Haversine calculation.
- **Single-Request Route Fallback (`min_departure_time`)**: Allow `GET /api/bus/route` with `arrival_time` to accept an optional `min_departure_time` (e.g., current time) and automatically fall back to a forward `departure_time` search in the same request when the reverse route departs in the past or finds no route.
- **In-Memory Caching & Deduplication for Geocoding & Autocomplete**: Add normalized TTL caching, negative failure caching, and in-flight Promise deduplication to `geocodePlace` and `autocompletePlace` in `places-repo.ts`.
- **Routine Coordinate Persistence, Narrowed Widget Watchers & Commit-on-Select/Blur Address Input**: Persist resolved `startCoords` and `destCoords` in routine `config` so `BusWidget` and `WeatherWidget` skip geocoding for configured addresses; narrow `BusWidget`'s watcher to only re-fetch when `startAddress`, `destination`, or `arrivalTime` change; and update `AddressAutocomplete` so routine saves occur on suggestion selection or input blur rather than every keystroke.

## Capabilities

### New Capabilities
- `transit-routing`: High-performance in-memory CSA transit routing with direct GTFS/disk-cache loading, service-day filtering, compact memory layout, binary-searched time windows, early exit, and single-request arrival/departure fallback.
- `place-geocoding`: Cached and deduplicated place geocoding and autocomplete resolution against the Google Maps API.
- `routine-route-fetching`: Coordinate-aware routine configuration, debounced/blur-committed address editing, and targeted dashboard route/weather fetching without redundant API waterfalls.

### Modified Capabilities

## Impact

- **`_backend/src/repo/csa-router.ts` & `_backend/src/routers/bus-route.ts`**: Direct GTFS + disk-cache graph loader, service-day filtering, compact integer/TypedArray structures, binary search + early exit, `tripNextConnection` fix, bounding-box stop lookup, and `min_departure_time` fallback support.
- **`_backend/src/repo/places-repo.ts`**: Normalized TTL cache, negative cache, and in-flight deduplication for `geocodePlace` and `autocompletePlace`.
- **`docker-compose.yaml`**: Mount `/data` into `backend`, make Neo4j optional/profiled or lightweight, and reduce `NODE_OPTIONS` heap caps for small servers.
- **`_frontend/smarthub/app/composables/use-settings.ts`, `pages/settings.vue`, `components/bus-widget.vue`, `components/weather-widget.vue`, `components/address-autocomplete.vue`**: Persist `startCoords`/`destCoords` in routine `config`, use single-request `min_departure_time` fallback, watch only routing fields in `BusWidget`, and emit committed address updates on selection/blur.
