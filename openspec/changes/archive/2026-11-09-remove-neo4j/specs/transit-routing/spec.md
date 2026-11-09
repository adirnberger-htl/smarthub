# Spec Delta

## MODIFIED Requirements

### Requirement: Direct GTFS and disk-cache graph loading
The transit routing engine SHALL load GTFS datasets (`stops.txt`, `routes.txt`, `trips.txt`, `calendar.txt`, `calendar_dates.txt`, `stop_times.txt`) directly from the local `/data` directory (or a serialized binary/JSON cache file built from those files) without any external graph database dependency.

#### Scenario: Startup loads from local GTFS data and writes/reads cache
- **WHEN** the backend starts and GTFS dataset directories or zip archives exist under `/data`
- **THEN** `CSARouter` initializes its in-memory routing graph from the local GTFS files (or prebuilt cache file) and marks `ready = true`

#### Scenario: Startup fails gracefully when local GTFS data is absent
- **WHEN** the backend starts and no GTFS dataset directories, zip archives, or cache files exist under `/data`
- **THEN** `CSARouter` logs an error and leaves `ready = false` without attempting any external database connection

## ADDED Requirements

### Requirement: Unavailable status when routing graph is not ready
When the in-memory transit routing graph is not yet initialized (`ready = false`), `GET /api/bus/route` SHALL return HTTP `503 Service Unavailable` with a JSON error message (`{ "error": "Transit routing graph not ready" }`), and `GET /api/bus/test` SHALL return `{ "status": "loading", "backend": "csa-in-memory", "timestamp": "<ISO-8601>" }` (or `"status": "ok"` when `ready = true`).

#### Scenario: Route request while graph is uninitialized returns 503
- **WHEN** a client requests `GET /api/bus/route` with valid parameters while `globalCSARouter.ready` is `false`
- **THEN** the endpoint responds with HTTP `503` and `{ "error": "Transit routing graph not ready" }`

#### Scenario: Health check endpoint reports CSA in-memory status only
- **WHEN** a client requests `GET /api/bus/test`
- **THEN** the endpoint responds with HTTP `200` and `{ "status": "ok" | "loading", "backend": "csa-in-memory", "timestamp": "<ISO-8601>" }` containing no `neo4j` field
