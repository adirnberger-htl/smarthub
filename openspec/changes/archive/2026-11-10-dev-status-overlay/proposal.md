# Proposal

## Why

SmartHub relies on a local KNX IP router (`224.0.23.12:3671`) and multiple backend services (Open-Meteo weather, Google Places geocoding, CSA GTFS transit routing, and Google authentication). Currently, developers and operators have no quick visual indicator on the dashboard or settings page to verify whether the KNX bus is reachable or if upstream services are healthy, requiring manual terminal inspection or browser console debugging.

Providing a dedicated developer toggle in Settings that displays high-contrast status overlays in the top-left and top-right corners gives immediate, low-overhead visual diagnostics across the application without generating excessive network or API quota traffic.

## What Changes

- Add a Developer Settings toggle (`devOverlayEnabled`) in `useSettings` and the Settings page, persisted in `user_settings` SQLite table.
- Expose a lightweight backend diagnostic endpoint `GET /api/dev/status` reporting local in-memory status (KNX connection state, CSA router readiness, cached weather status, Google API configuration, and Google auth session) with zero external network pings.
- Emit KNX connection and disconnection transitions over the existing `/api/devices/events` Server-Sent Events (SSE) stream for real-time router state changes without high-frequency polling.
- Implement a global `DevStatusOverlay` component rendered on all application routes when dev mode is enabled:
  - Top-Left Overlay: KNX router status (Multicast IP, physical address, connection state, live SSE stream indicator, last telegram timing).
  - Top-Right Overlay: Upstream API status (Express backend ping/latency, CSA GTFS transit graph readiness, Open-Meteo cache status, Google Geocoding key status, Google auth status).
  - High-contrast visual styling (deep dark background, neon green/red/amber status badges, monospace typography).
  - Safe positioning and collision avoidance with existing UI elements such as `<ProfileButton>` on `/settings`.
  - Minimizable / collapsible mode to toggle compact pill view.

## Capabilities

### New Capabilities
- `dev-status-overlay`: Developer diagnostics toggle in settings, lightweight backend status aggregation and SSE notifications, and persistent high-contrast top-corner HUD overlays across frontend views.

### Modified Capabilities
<!-- None -->

## Impact

- **Backend**:
  - `_backend/src/services/knx-service.ts`: emit connection state events.
  - `_backend/src/routers/devices.ts` or new `_backend/src/routers/dev.ts`: endpoint `GET /api/dev/status` and broadcast status updates over SSE.
- **Frontend**:
  - `_frontend/smarthub/app/composables/use-settings.ts`: `devOverlayEnabled` setting property and persistence.
  - `_frontend/smarthub/app/pages/settings.vue`: Developer section with toggle switch.
  - `_frontend/smarthub/app/components/dev-status-overlay.vue`: New overlay component.
  - `_frontend/smarthub/app/app.vue`: Global mounting of the overlay.
- **Network / Performance**:
  - Zero external calls during health checks (uses local cache & memory state).
  - Throttled local polling (15s interval, paused when browser tab is hidden).
