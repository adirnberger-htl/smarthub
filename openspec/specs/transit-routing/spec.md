# transit-routing Specification

## Purpose
Provides high-performance in-memory public transit route calculation (both departure-time forward search and arrival-time reverse search) over GTFS data with direct file/cache loading, service-day filtering, and bounded CPU and memory usage per query.

## Requirements

### Requirement: Direct GTFS and disk-cache graph loading
The transit routing engine SHALL load GTFS datasets (`stops.txt`, `routes.txt`, `trips.txt`, `calendar.txt`, `calendar_dates.txt`, `stop_times.txt`) directly from the local `/data` directory (or a serialized binary/JSON cache file built from those files) without any external graph database dependency.

#### Scenario: Startup loads from local GTFS data and writes/reads cache
- **WHEN** the backend starts and GTFS dataset directories or zip archives exist under `/data`
- **THEN** `CSARouter` initializes its in-memory routing graph from the local GTFS files (or prebuilt cache file) and marks `ready = true`

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
