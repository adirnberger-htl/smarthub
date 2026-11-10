# dev-status-overlay Specification

## Purpose

Provides a developer diagnostic toggle in settings, lightweight local backend status reporting, and high-contrast corner HUD overlays displaying real-time KNX router connection status and upstream API health across all application views.

## Requirements

### Requirement: Developer diagnostic setting toggle
The system SHALL provide a developer diagnostics toggle in user settings, persisted in the user profile settings, that enables or disables the developer diagnostic HUD overlays across all application views.

#### Scenario: User toggles dev diagnostics on
- **WHEN** the user enables the developer diagnostics toggle in Settings
- **THEN** the preference is saved to user settings and the diagnostic overlays appear in the top-left and top-right corners across all application routes

#### Scenario: User toggles dev diagnostics off
- **WHEN** the user disables the developer diagnostics toggle in Settings
- **THEN** the preference is saved to user settings and the diagnostic overlays are immediately removed from all views

### Requirement: Lightweight backend status diagnostic endpoint
The backend system SHALL expose an authenticated `GET /api/dev/status` endpoint that aggregates the current in-memory status of internal subsystems (KNX service connection state, CSA transit router readiness, cached weather service status, Google Places API configuration, and user Google auth connection) without issuing outbound external network requests or consuming third-party API quotas.

#### Scenario: Authenticated client requests dev status
- **WHEN** an authenticated user sends `GET /api/dev/status`
- **THEN** the server returns HTTP 200 with a JSON payload containing the KNX router state, multicast IP, physical address, CSA graph readiness, Open-Meteo cached status, Google Places configuration status, and Google OAuth status

#### Scenario: Unauthenticated request to dev status
- **WHEN** an unauthenticated client sends `GET /api/dev/status`
- **THEN** the server returns HTTP 401 Unauthorized

### Requirement: Real-time KNX connection event broadcasting
The backend system SHALL emit an SSE event `knx-status` over the existing `/api/devices/events` stream whenever the KNX IP router connection transitions between connected, disconnected, or mock states, and upon initial client SSE handshake.

#### Scenario: KNX router disconnects
- **WHEN** the KNX multicast client detects a disconnect or socket error
- **THEN** the backend broadcasts a `knx-status` event with `connected: false` to all active SSE subscribers without delay

#### Scenario: KNX router connects
- **WHEN** the KNX multicast client establishes a connection to the multicast router
- **THEN** the backend broadcasts a `knx-status` event with `connected: true` and router connection metadata to all active SSE subscribers

### Requirement: High-contrast top-left KNX overlay
The frontend SHALL display a high-contrast HUD overlay in the top-left corner of the viewport when developer mode is active, showing the KNX router address (`224.0.23.12:3671`), physical address (`1.2.6`), connection status (`ONLINE`, `DISCONNECTED`, or `MOCK`), live SSE connection status, and time elapsed since the last received bus telegram.

#### Scenario: KNX is online and healthy
- **WHEN** the KNX service is connected and receiving telegrams
- **THEN** the top-left overlay renders the router IP and physical address with a neon green `#00FF66` status badge and active SSE indicator

#### Scenario: KNX disconnects
- **WHEN** the KNX service loses connection or encounters a bus failure
- **THEN** the top-left overlay immediately displays a high-contrast neon red `#FF0055` disconnected indicator

### Requirement: High-contrast top-right API services overlay
The frontend SHALL display a high-contrast HUD overlay in the top-right corner of the viewport when developer mode is active, showing the health status of backend subsystems and external APIs (Express server latency, CSA transit engine, Open-Meteo cache, Google Geocoding configuration, and Google OAuth).

#### Scenario: All API services healthy
- **WHEN** all API subsystems report successful states
- **THEN** each service is displayed with a neon green `#00FF66` indicator and current response or cached state timestamp

#### Scenario: Subsystem degraded or unconfigured
- **WHEN** an API key is missing or a service encounters an error
- **THEN** the affected service row renders with an amber `#FFD600` or red `#FF0055` badge detailing the status without blocking the UI

### Requirement: Viewport collision avoidance and compact collapse
The frontend diagnostic overlays SHALL provide a compact collapse toggle to minimize visual footprint, and SHALL automatically adjust top-right positioning on the `/settings` page to prevent overlapping the user profile button.

#### Scenario: Viewing settings page with overlay enabled
- **WHEN** the user navigates to `/settings` with dev diagnostics enabled
- **THEN** the top-right overlay shifts leftward or docks safely to maintain unobstructed access to the profile avatar button

#### Scenario: User collapses overlay
- **WHEN** the user clicks the minimize toggle on either HUD overlay
- **THEN** the overlay collapses into a single-line neon status pill badge showing key summary indicators

### Requirement: Low-traffic adaptive polling
The frontend diagnostics client SHALL poll `GET /api/dev/status` at a throttled interval of 15 seconds only when developer diagnostics are enabled, and SHALL pause polling when the browser tab becomes hidden.

#### Scenario: Browser tab becomes hidden
- **WHEN** the user switches tabs or minimizes the browser window
- **THEN** diagnostic polling intervals are paused until the tab becomes active again
