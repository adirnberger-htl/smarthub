# Spec Delta: driving-routing

## MODIFIED Requirements

### Requirement: Driving route computation with traffic awareness
The backend system SHALL expose an authenticated endpoint `GET /api/car/route` that calculates automotive driving routes between origin coordinates (`lat_a`, `lon_a`) and destination coordinates (`lat_b`, `lon_b`) for a target arrival time or departure time, returning duration in seconds, duration in traffic, distance in meters, departure time, arrival time, route summary, key route steps, and a complete polyline `geometry` as an array of `[latitude, longitude]` coordinate pairs.

#### Scenario: Requesting car route with target arrival time
- **WHEN** an authenticated user sends `GET /api/car/route` with valid `lat_a`, `lon_a`, `lat_b`, `lon_b`, and `arrival_time=08:30:00`
- **THEN** the server returns HTTP 200 with route details including `duration_seconds`, `duration_in_traffic_seconds`, `distance_meters`, `departure_time` (arrival time minus traffic duration), `arrival_time`, route road summary (e.g. "A7"), and non-empty `geometry` coordinate array containing start and destination coordinates

#### Scenario: Requesting car route with missing coordinates
- **WHEN** a client sends `GET /api/car/route` with missing or unparseable latitude/longitude parameters
- **THEN** the server returns HTTP 400 with an explicit validation error payload
