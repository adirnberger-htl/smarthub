# Design

## Context

See `proposal.md` for motivation and full scope. This design covers all 6 performance optimization layers across the backend routing engine (`_backend/src/repo/csa-router.ts`, `_backend/src/routers/bus-route.ts`), geocoding service (`_backend/src/repo/places-repo.ts`), container orchestration (`docker-compose.yaml`), and frontend routine/dashboard components (`_frontend/smarthub/app/...`).

## Goals / Non-Goals

**Goals:**
- Allow `CSARouter` to load GTFS directly from `/data` CSVs (and cache a compiled binary/JSON snapshot on disk) so the server does not need Neo4j's 4GB+ JVM heap to run transit routing, and lower container memory limits in `docker-compose.yaml`.
- Cut Node.js memory usage and filter out invalid weekend/school-day trips by indexing stops/trips as integers, storing connections in compact typed arrays, and filtering by GTFS `calendar.txt` / `calendar_dates.txt`.
- Reduce per-query CSA scan time from ~100ms+ to <2ms via binary search entry, dynamic `bestTotalTime` early exit, reachable-only `tripNextConnection` state, and bounding-box stop filtering.
- Collapse the `BusWidget` arrival -> departure fallback into a single `/api/bus/route` request via `min_departure_time`.
- Eliminate redundant Google Geocoding and Autocomplete HTTP calls via backend TTL/in-flight caching plus routine coordinate persistence (`startCoords` / `destCoords`), narrow `BusWidget` watchers, and commit-on-select/blur address inputs.

**Non-Goals:**
- Changing the SQLite table columns (routine coordinates are stored inside the existing `config_json` column).
- Removing the legacy Neo4j code files (`bus-repo-neo4j.ts` remains as a fallback if neither GTFS files nor CSA are available).

## Decisions

### 1. Direct GTFS Loader with Disk Cache & Small-Server Docker Config
- **Direct GTFS Parsing**:
  - Mount `./data:/data` into the `backend` container in `docker-compose.yaml` (and resolve `../data` or `/data` in local dev).
  - If `/data/LINZ_AG_GTFS_2026/stops.txt` or `/data/OOEVV_GTFS_2026/stops.txt` are not yet extracted from their `.zip` archives, extract them or stream them.
  - On startup, `CSARouter.loadGraph` first checks for `/data/csa-graph-cache.json` (or `.bin`) whose mtime is newer than the GTFS `stops.txt`/`stop_times.txt` files. If valid, it loads the pre-sorted arrays in ~300ms.
  - Otherwise, it streams `stops.txt`, `routes.txt`, `calendar.txt`, `calendar_dates.txt`, `trips.txt`, and `stop_times.txt` directly from `/data/LINZ_AG_GTFS_2026` and `/data/OOEVV_GTFS_2026`, builds the sorted arrays, writes `/data/csa-graph-cache.bin` (or `.json`), and marks `this.ready = true`. If `/data` is missing, it falls back to the existing Neo4j loader.
- **Docker Compose Memory Tuning**:
  - Reduce `backend` `NODE_OPTIONS` from `4096` to `1024` MB, `frontend` from `6000` to `1536` MB, and `neo4j` heap from `4G` to `512M` / `1G` (or place `neo4j` + `neo4j-loader` under an optional profile / minimal footprint so `backend` starts immediately without waiting for Neo4j).

### 2. Compact Integer / TypedArray Graph & Service-Day Filtering in `CSARouter`
- **Integer Indexing & TypedArrays**:
  - Map each string `stop_id` to a sequential integer index `0 .. numStops - 1` and each `trip_id` to `0 .. numTrips - 1`.
  - Store forward connections (`connections`) and reverse connections (`backwardConnections`) using parallel `Int32Array` / `Uint32Array` columns (`depStopIdx`, `arrStopIdx`, `depTime`, `arrTime`, `tripIdx`) instead of `1.5M` heap-allocated JS objects. This cuts V8 heap overhead from ~300MB+ to ~30MB.
  - Use flat `Int32Array` arrays of length `numStops` / `numTrips` for `earliestArrivalTime`, `earliestArrivalTransfers`, `tripBoardStop`, and `tripAlightStop` per query instead of allocating 10,424-entry `Map<string, { time, transfers }>` objects on every request.
- **GTFS Calendar / Service-Day Filtering**:
  - Parse `calendar.txt` (weekday bitmask `0..6` + `start_date`/`end_date` `YYYYMMDD`) and `calendar_dates.txt` (`exception_type`: `1` = added, `2` = removed) per `service_id`.
  - Each `tripIdx` stores its `serviceIdx`. During `findRoute` / `findReverseRoute`, compute an active `Uint8Array(numServices)` for the target date (current date in `Europe/Vienna`, or optional `date` parameter) in <0.1ms and skip any connection whose `activeService[tripServiceIdx[tripIdx]] === 0` (falling back to all services if no services match the current date, e.g., when testing outside the GTFS feed year).

### 3. Binary Search Entry, `bestTotalTime` Early Exit, Reachable-Only State & Bounding-Box Stop Lookup
- **Binary Search Entry**:
  - Forward search uses binary search on `fwdDepTime` to start at the first connection with `depTime >= startTime`.
  - Reverse search uses binary search on `bwdArrTime` (sorted descending) to start at the first connection with `arrTime <= targetTime`.
- **Dynamic `bestTotalTime` Early Exit**:
  - Forward search tracks `bestTotalTime` whenever an `endStop` (directly or via footpath) improves its arrival time, and breaks the loop as soon as `depTime > bestTotalTime`.
  - Reverse search tracks `bestTotalTime` whenever a `startStop` (directly or via footpath) improves its departure time, and breaks the loop as soon as `arrTime < bestTotalTime`.
- **Reachable-Only `tripNextConnection`**:
  - In `findReverseRoute`, record hop-by-hop connection indices only inside `if (canTake)` so unreachable trips never allocate state.
- **Bounding-Box Stop Lookup**:
  - In `findStopsWithinRadius`, pre-filter stops using `Math.abs(stop.lat - lat) <= latDelta && Math.abs(stop.lon - lon) <= lonDelta` before calling `getDistanceMeters`.

### 4. Single-Request Arrival-to-Departure Fallback (`min_departure_time`)
- In `GET /api/bus/route` (`_backend/src/routers/bus-route.ts`), accept optional query parameter `min_departure_time` (`HH:MM` or `HH:MM:SS`).
- When `arrival_time` is provided alongside `min_departure_time`, run `findReverseRoute` first; if the returned list is empty or `routes[0].departure_time < minDepartureTime`, immediately invoke `findRoute(..., minDepartureTime)` in memory (<1ms) and return that result.

### 5. In-Memory Cache & In-Flight Deduplication in `places-repo.ts`
- Add normalized (`input.trim().toLowerCase()`) TTL cache (`24h` for `geocodePlace`, `1h` for `autocompletePlace`, max 500 entries), `15s` negative failure cache, and `inFlightRequests` Promise deduplication in `_backend/src/repo/places-repo.ts`.

### 6. Routine Coordinate Persistence, Narrowed `BusWidget` Watcher & Commit-on-Select/Blur Address Input
- **Routine Coordinates**:
  - Extend `RoutineItem` (`use-settings.ts`) to preserve `startCoords?: { address: string; lat: number; lon: number; formattedAddress?: string }` and `destCoords?: { address: string; lat: number; lon: number; formattedAddress?: string }` inside `config` when saving/loading routines.
  - When `autoConfigure` (`settings.vue`) or `BusWidget` (`bus-widget.vue`) geocodes `startAddress` or `destination`, cache the resolved coordinates onto the routine item (and persist via `updateRoutineItem` when configured in Settings).
  - In `BusWidget`, if `routine.startCoords?.address === startPlace` (and same for `destCoords`), use `lat`/`lon` directly without calling `/api/places/geocode`, and pass `min_departure_time: getCurrentTimeParam()` to `/api/bus/route` so only 1 HTTP request is made.
  - In `WeatherWidget` (`weather-widget.vue`), accept optional `activeDestinationCoords` (or read from the active routine) so destination weather uses `/api/weather/forecast?lat=...&lon=...` when coordinates are already known.
- **Narrowed `BusWidget` Watcher**:
  - Replace `watch(busRoutine, ...)` in `bus-widget.vue` with a computed tuple watcher `watch(() => [busRoutine.value?.startAddress, busRoutine.value?.destination, busRoutine.value?.arrivalTime], ...)` so editing alarms, active days, or routine name does not re-trigger route calculation.
- **Commit-on-Select/Blur in `AddressAutocomplete`**:
  - In `address-autocomplete.vue`, keep debounced `fetchSuggestions` on `@input`, but only `emit('update:modelValue', ...)` when the user selects a suggestion (`selectSuggestion`) or when the input blurs / presses Enter (`onBlur` / `@change`), preventing `PUT /api/routines/:id` from firing every 500ms mid-typing.

## Risks / Trade-offs

- **[Risk] Server system clock or test date falls outside the GTFS calendar date range** → **Mitigation**: When computing active services for a date, if `0` services match the date (e.g., clock is set outside the GTFS feed window), automatically fall back to matching by day-of-week (`monday`..`sunday`) ignoring `start_date`/`end_date` bounds, and if still `0`, enable all services.
- **[Risk] User types an address in Settings and immediately clicks "Auto-Configure" before blur fires** → **Mitigation**: Have `onBlur` emit synchronously on blur (before the 200ms dropdown-hide timeout) so clicking the "Auto-Configure" button always sees the latest typed value.
