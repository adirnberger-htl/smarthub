# Spec Delta

## Purpose

Provides backend driving route calculation, commute duration with live traffic, travel distance, maneuver steps, and resilient fallback routing for automotive commuters.

## ADDED Requirements

### Requirement: Driving route computation with traffic awareness
The backend system SHALL expose an authenticated endpoint `GET /api/car/route` that calculates automotive driving routes between origin coordinates (`lat_a`, `lon_a`) and destination coordinates (`lat_b`, `lon_b`) for a target arrival time or departure time, returning duration in seconds, duration in traffic, distance in meters, departure time, arrival time, route summary, and key route steps.

#### Scenario: Requesting car route with target arrival time
- **WHEN** an authenticated user sends `GET /api/car/route` with valid `lat_a`, `lon_a`, `lat_b`, `lon_b`, and `arrival_time=08:30:00`
- **THEN** the server returns HTTP 200 with route details including `duration_seconds`, `duration_in_traffic_seconds`, `distance_meters`, `departure_time` (arrival time minus traffic duration), `arrival_time`, and route road summary (e.g. "A7")

#### Scenario: Requesting car route with missing coordinates
- **WHEN** a client sends `GET /api/car/route` with missing or unparseable latitude/longitude parameters
- **THEN** the server returns HTTP 400 with an explicit validation error payload

### Requirement: Resilient routing provider fallback
The driving route engine SHALL utilize Google Directions API when `GOOGLE_KEY` is configured in the environment, and SHALL automatically fall back to an open routing provider (OSRM) when `GOOGLE_KEY` is absent or the external service reports quota errors, returning standard route duration and distance without failing the request.

#### Scenario: GOOGLE_KEY configured and valid
- **WHEN** `GOOGLE_KEY` is set and valid
- **THEN** routes are queried via Google Directions API and include `duration_in_traffic_seconds` and live traffic condition indicators

#### Scenario: GOOGLE_KEY missing or quota exceeded
- **WHEN** `GOOGLE_KEY` is not configured or returns OVER_QUERY_LIMIT
- **THEN** the system falls back to OSRM driving route service, returning computed distance and estimated duration without raising an unhandled exception

### Requirement: In-memory commute route caching
The driving route service SHALL cache route calculation responses in memory keyed by rounded origin and destination coordinates (within ~100m) and time window for a configurable TTL of at least 5 minutes to prevent redundant external API queries during morning routine display.

#### Scenario: Repeated route queries within cache TTL
- **WHEN** the dashboard or settings queries `/api/car/route` for identical origin and destination coordinates within 5 minutes
- **THEN** the cached route response is returned immediately without issuing outbound external HTTP requests
