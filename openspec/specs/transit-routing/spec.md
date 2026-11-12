# transit-routing Specification

## Purpose
Provides high-performance in-memory public transit route calculation (both departure-time forward search and arrival-time reverse search) over GTFS data with direct file/cache loading, service-day filtering, and bounded CPU and memory usage per query.

## Requirements

### Requirement: Direct GTFS and disk-cache graph loading
The transit routing engine SHALL dynamically discover all GTFS dataset directories and `.zip` archives directly from the local GTFS data directory (`/data` or configured `GTFS_DATA_DIR`). If a discovered `.zip` archive has not been extracted or has a newer modification time than its corresponding extracted folder, the engine SHALL automatically extract it, automatically resolve any single nested container subdirectory containing GTFS files (such as `GTFS_Fahrplan_2026/`), assign a deterministic agency prefix, and build the unified in-memory routing graph from all discovered GTFS feeds without any external database dependency. The engine SHALL persist and load a serialized binary/JSON disk cache (`csa-graph-cache.bin` and `csa-graph-cache.meta.json`) validated against the composite modification timestamps and composition of all discovered datasets.

#### Scenario: Startup loads from local GTFS data and writes/reads cache
- **WHEN** the backend starts and GTFS dataset directories or zip archives (including dynamically discovered feeds like `LINZ_AG_GTFS_2026`, `OOEVV_GTFS_2026`, and `OEBB-gtfs.zip`) exist under `/data`
- **THEN** `CSARouter` initializes its in-memory routing graph from all discovered GTFS files (or prebuilt binary cache file validated against composite dataset modification timestamps), marks `ready = true`, and reloads in under 500 milliseconds on warm start

#### Scenario: Startup fails gracefully when local GTFS data is absent
- **WHEN** the backend starts and no GTFS dataset directories, zip archives, or cache files exist under `/data`
- **THEN** `CSARouter` logs an error and leaves `ready = false` without attempting any external database connection

### Requirement: Service-day filtering of transit connections
The transit routing engine SHALL filter evaluated connections according to GTFS service calendars (`calendar.txt` and `calendar_dates.txt`) for the target query date (defaulting to the current date in `Europe/Vienna`).

#### Scenario: Weekend or inactive service trips are excluded on a weekday
- **WHEN** a route is requested for a date (or current day) on which a trip's `service_id` is inactive according to `calendar.txt` / `calendar_dates.txt`
- **THEN** connections belonging to that inactive trip are ignored during route scanning

### Requirement: Time-bounded connection scanning
The transit routing engine SHALL locate the initial connection in its sorted connection arrays using binary search and SHALL terminate scanning early once remaining connections cannot improve the best known destination arrival time (in forward search) or origin departure time (in reverse search).

#### Scenario: Forward search skips earlier connections and exits after optimal arrival
- **WHEN** a route is requested with a `departure_time` of `08:30:00`
- **THEN** the router starts scanning at the first connection with `departure_time >= 08:30:00` via binary search and stops scanning as soon as a connection's `departure_time` exceeds the earliest known total arrival time at the destination (`bestTotalTime`)

#### Scenario: Reverse search skips later connections and exits before optimal departure
- **WHEN** a route is requested with an `arrival_time` of `08:00:00`
- **THEN** the router starts scanning the descending-arrival connection list at the first connection with `arrival_time <= 08:00:00` via binary search and stops scanning as soon as a connection's `arrival_time` is earlier than the latest known total departure time from the origin (`bestTotalTime`)

### Requirement: Reachable-only trip state tracking
The transit routing engine SHALL record hop-by-hop trip traversal connections only for connections that are reachable from the origin (in forward search) or from the destination (in reverse search).

#### Scenario: Reverse search does not allocate state for unreachable connections
- **WHEN** a reverse route search evaluates a connection whose arrival stop has not been reached and whose trip has not been boarded
- **THEN** the router does not insert that connection into the per-query trip traversal map

### Requirement: Bounding-box pre-filtered stop radius search
When finding transit stops within a walking radius of a coordinate, the routing engine SHALL apply a latitude/longitude bounding-box check before computing trigonometric Haversine distance.

#### Scenario: Stops within walking radius are returned identically
- **WHEN** searching for stops within 1500 meters of an origin or destination coordinate
- **THEN** stops outside the degree bounding box are rejected without Haversine calculation, and all stops within 1500 meters (or the single nearest stop if none exist within 1500 meters) are returned with accurate walking times

### Requirement: Single-request arrival-to-departure fallback
When `GET /api/bus/route` is called with both `arrival_time` and `min_departure_time`, the endpoint SHALL automatically fall back to a forward route search starting at `min_departure_time` if the reverse search returns no route or returns a route whose `departure_time` is earlier than `min_departure_time`.

#### Scenario: Arrival-based route departing in the past falls back in one request
- **WHEN** a client requests `/api/bus/route?arrival_time=08:00:00&min_departure_time=07:50:00...` and the latest route arriving by `08:00:00` departs at `07:35:00`
- **THEN** the backend automatically computes and returns the next available route departing at or after `07:50:00` in the same HTTP response

### Requirement: Unavailable status when routing graph is not ready
When the in-memory transit routing graph is not yet initialized (`ready = false`), `GET /api/bus/route` SHALL return HTTP `503 Service Unavailable` with a JSON error message (`{ "error": "Transit routing graph not ready" }`), and `GET /api/bus/test` SHALL return `{ "status": "loading", "backend": "csa-in-memory", "timestamp": "<ISO-8601>" }` (or `"status": "ok"` when `ready = true`).

#### Scenario: Route request while graph is uninitialized returns 503
- **WHEN** a client requests `GET /api/bus/route` with valid parameters while `globalCSARouter.ready` is `false`
- **THEN** the endpoint responds with HTTP `503` and `{ "error": "Transit routing graph not ready" }`

#### Scenario: Health check endpoint reports CSA in-memory status only
- **WHEN** a client requests `GET /api/bus/test`
- **THEN** the endpoint responds with HTTP `200` and `{ "status": "ok" | "loading", "backend": "csa-in-memory", "timestamp": "<ISO-8601>" }` containing no `neo4j` field

### Requirement: Comfort and speed optimized reverse transit routing
When calculating transit connections for a specified arrival time (`arrival_time`), the transit routing engine SHALL evaluate candidate itineraries arriving within an arrival lookback window (up to 45 minutes prior to target arrival time) and rank them using a composite utility score balancing total travel duration, transit mode comfort (prioritizing rail and tram over buses), and transfer count, returning the highest-utility connection as the primary result.

#### Scenario: Faster rail connection preferred over slightly later slow multi-bus route
- **WHEN** a route is requested with a target arrival time where an itinerary utilizing rail (S-Bahn, Regionalbahn) or tram achieves substantially lower travel duration than an all-bus connection that departs slightly later
- **THEN** the routing engine selects and returns the faster, higher-comfort rail/tram itinerary as the top route

#### Scenario: Direct or low-transfer route preferred when durations are comparable
- **WHEN** candidate connections within the arrival window have comparable travel times
- **THEN** the routing engine favors itineraries with fewer transfers and departures closest to the target arrival time

#### Scenario: Multi-probe search maintains bounded in-memory latency
- **WHEN** an arrival-time route search executes multi-probe candidate evaluation against the active GTFS graph
- **THEN** the complete candidate search and ranking executes in under 10 milliseconds using existing in-memory graph structures
