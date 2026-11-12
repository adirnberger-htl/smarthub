# Tasks

## 1. Backend Diagnostics API & SSE Broadcasting

- [x] 1.1 Extend `KnxService` in `_backend/src/services/knx-service.ts` to emit connection and disconnection lifecycle events (`connected`, `disconnected`, `error`) containing connection metadata and telegram timestamps, and verify backend TypeScript compilation succeeds (`npm run build` or `npx tsc --noEmit`).
- [x] 1.2 Implement `GET /api/dev/status` endpoint in `_backend/src/routers/dev.ts` (or `devices.ts`), aggregating in-memory statuses for KNX, CSA transit router, cached Open-Meteo weather, Google Places configuration, and user authentication, and register the router in `_backend/src/app.ts`. Verify endpoint returns 200 with JSON structure and 401 when unauthenticated.
- [x] 1.3 Update the SSE stream in `_backend/src/routers/devices.ts` (`/api/devices/events`) to broadcast `knx-status` events on initial handshake and upon KNX connection state changes. Verify with curl or test client that `event: knx-status` is dispatched.

## 2. Settings Composable & Settings Page Toggle

- [x] 2.1 Update `GlobalSettings` in `_frontend/smarthub/app/composables/use-settings.ts` to include `devOverlayEnabled: boolean` (default: `false`), ensuring it is loaded from and saved to the backend via `saveGlobalSettings()`. Verify setting persists through a composable state test.
- [x] 2.2 Add a "Developer & Diagnostics" section to `_frontend/smarthub/app/pages/settings.vue` containing an accessible high-contrast toggle switch for `devOverlayEnabled`. Verify toggling saves the preference and triggers reactivity.

## 3. Frontend Diagnostics Composable & Overlay Component

- [x] 3.1 Create `_frontend/smarthub/app/composables/use-dev-status.ts` to fetch `/api/dev/status` with a 15-second polling interval, pause polling when `document.visibilityState === 'hidden'`, and subscribe to `knx-status` events from the SSE stream. Verify in browser devtools that polling pauses on tab blur.
- [x] 3.2 Create `_frontend/smarthub/app/components/dev-status-overlay.vue` featuring top-left (KNX Router status, IP, physical address, SSE status, telegram timer) and top-right (Backend ping, CSA transit status, Weather cache, Geocoding, Google auth) panels in high-contrast neon palette, with collapse-to-pill mode and safe offset on `/settings` to clear `ProfileButton`. Verify layout and contrast in light and dark modes.
- [x] 3.3 Globally mount `<DevStatusOverlay />` in `_frontend/smarthub/app/app.vue` guarded by `globalSettings.devOverlayEnabled && $route.path !== '/login'`. Verify the overlay appears on dashboard and settings pages when enabled and vanishes when toggled off.

## 4. End-to-End Verification

- [x] 4.1 Perform end-to-end verification of overlay toggle behavior, KNX status display (connected vs mock), API health badges, collapse toggle, and verify in the network panel that no outbound requests to Google Maps or Open-Meteo are generated during status checks.
