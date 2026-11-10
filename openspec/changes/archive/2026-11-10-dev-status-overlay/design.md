# Design

## Context

SmartHub consists of an Express backend with SQLite and a Nuxt 3 frontend. The backend maintains an in-memory client connection to the local KNXnet/IP multicast router (`224.0.23.12:3671`), loads a CSA GTFS graph for transit, caches weather data from Open-Meteo in memory, and interfaces with Google Maps Geocoding. The frontend currently maintains a persistent SSE connection (`/api/devices/events`) managed by `useDeviceOsd` and stores user preferences via `useSettings` in SQLite `user_settings.settings_json`.

See `proposal.md` for problem motivation and `specs/dev-status-overlay/spec.md` for observable requirement contracts.

## Goals / Non-Goals

**Goals:**
- Provide zero-external-traffic diagnostic status reporting by inspecting only local memory caches and connection sockets.
- Transmit instant KNX router disconnect/reconnect transitions over the existing SSE channel.
- Render high-contrast visual HUD cards in the top-left (KNX) and top-right (API services) corners across all routes.
- Prevent layout collisions with `<ProfileButton>` on `/settings` and provide a compact single-line pill mode.
- Throttle polling to 15s and pause when the browser tab is hidden.

**Non-Goals:**
- Not building an external APM/log aggregation platform.
- Not pinging third-party APIs (Google/Open-Meteo) on health checks to avoid rate limits and costs.
- Not replacing the primary user dashboard widgets.

## Decisions

### 1. In-memory diagnostic aggregation endpoint (`GET /api/dev/status`)
- **Decision**: The backend will aggregate status strictly from existing in-memory objects: `globalKnxService.getStatus()`, `globalCSARouter.ready`, `weatherCache` timestamp, `process.env.GOOGLE_KEY` check, and req.user session state.
- **Rationale**: External health calls to Google or Open-Meteo would consume quotas, increase network latency, and incur cloud billing.
- **Alternatives considered**:
  - Live HTTP HEAD to `maps.googleapis.com` & `api.open-meteo.com`: Rejected due to traffic, rate limits, and latency spikes.

### 2. Event-driven KNX status broadcasting over SSE
- **Decision**: Hook into `KNXClientEvents.connected`, `disconnected`, and `error` in `KnxService`. Emit `knx-status` event over `globalDeviceService` and `/api/devices/events`.
- **Rationale**: Polling alone has latency (up to 15 seconds) before detecting a dropped KNX router. SSE delivers instant visual feedback when the physical bus drops with zero additional network requests.
- **Alternatives considered**:
  - High-frequency 1-second HTTP polling: Rejected due to unnecessary local network load.

### 3. Settings persistence in `user_settings.settings_json`
- **Decision**: Add `devOverlayEnabled: boolean` to `GlobalSettings` in `useSettings()`.
- **Rationale**: `user_settings` already stores settings as a JSON blob in SQLite. Storing this flag requires no database schema changes or migrations.

### 4. Component architecture and global mounting
- **Decision**: Create `DevStatusOverlay.vue` containing both `.dev-overlay--top-left` and `.dev-overlay--top-right` sub-panels, mounted globally in `app.vue` guarded by `v-if="devOverlayEnabled && $route.path !== '/login'"`.
- **Rationale**: Ensures uninterrupted diagnostics across dashboard and settings views.

### 5. Collision avoidance and responsive layout
- **Decision**: Use scoped CSS targeting `.settings-page` or route checks to position the top-right overlay at `right: 84px;` when on `/settings`, clearing the `top: 24px; right: 24px;` `<ProfileButton>`. On other routes, position at `right: 16px;`.
- **Decision**: Include a collapse toggle button (`[-]`) on each panel that toggles a compact 1-line neon badge (`[KNX: OK]` and `[APIs: 5/5]`).

### 6. High-contrast color palette
- **Decision**:
  - Background: `rgba(8, 10, 16, 0.94)` with `backdrop-filter: blur(8px);`
  - Borders: `1px solid rgba(255, 255, 255, 0.2)`
  - Connected / OK: `#00FF66`
  - Disconnected / Error: `#FF0055`
  - Mock / Degraded: `#FFD600`
  - SSE Streaming: `#00E5FF`
  - Monospace font (`monospace, ui-monospace`).

## Risks / Trade-offs

- **[Risk] Background tab continues polling** → Mitigation: Register `document.addEventListener('visibilitychange')` in overlay composable/component to clear the 15s timer when hidden and resume immediately when visible.
- **[Risk] Existing SSE stream drops** → Mitigation: Frontend already handles SSE reconnection; overlay surfaces SSE connection state explicitly (`SSE: RECONNECTING`).
- **[Risk] Screen clutter on small displays** → Mitigation: Collapsible pill mode allows users to minimize overlay into compact tags with one click.
