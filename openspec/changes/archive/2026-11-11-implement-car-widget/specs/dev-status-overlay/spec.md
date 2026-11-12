# Spec Delta

## MODIFIED Requirements

### Requirement: Lightweight backend status diagnostic endpoint
The backend system SHALL expose an authenticated `GET /api/dev/status` endpoint that aggregates the current in-memory status of internal subsystems (KNX service connection state, CSA transit router readiness, cached weather service status, driving route provider status, Google Places API configuration, and user Google auth connection) without issuing outbound external network requests or consuming third-party API quotas.

#### Scenario: Authenticated client requests dev status
- **WHEN** an authenticated user sends `GET /api/dev/status`
- **THEN** the server returns HTTP 200 with a JSON payload containing the KNX router state, multicast IP, physical address, CSA graph readiness, Open-Meteo cached status, driving route provider status (provider name, key/fallback state, cached entries), Google Places configuration status, and Google OAuth status

#### Scenario: Unauthenticated request to dev status
- **WHEN** an unauthenticated client sends `GET /api/dev/status`
- **THEN** the server returns HTTP 401 Unauthorized

### Requirement: High-contrast top-right API services overlay
The frontend SHALL display a high-contrast HUD overlay in the top-right corner of the viewport when developer mode is active, showing the health status of backend subsystems and external APIs (Express server latency, CSA transit engine, car routing provider, Open-Meteo cache, Google Geocoding configuration, and Google OAuth).

#### Scenario: All API services healthy
- **WHEN** all API subsystems report successful states
- **THEN** each service is displayed with a neon green `#00FF66` indicator and current response or cached state timestamp

#### Scenario: Subsystem degraded or unconfigured
- **WHEN** an API key is missing or a service encounters an error
- **THEN** the affected service row renders with an amber `#FFD600` or red `#FF0055` badge detailing the status without blocking the UI
