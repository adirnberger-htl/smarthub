# Tasks

## 1. Backend Driving Route Service & Endpoint

- [x] 1.1 Implement `_backend/src/repo/car-router.ts` with Google Directions API integration (traffic duration, road summary, maneuver steps), automated OSRM fallback, in-memory 5-minute TTL caching, and `getCarRoutingStatus()` health reporting. Verify by running a test script querying sample Austrian coordinates.
- [x] 1.2 Implement Express router `_backend/src/routers/car-route.ts` with parameter validation (`lat_a`, `lon_a`, `lat_b`, `lon_b`, `arrival_time`, `departure_time`), error handling, and register it in `_backend/src/app.ts`. Verify by querying `GET /api/car/route` with valid and invalid parameters via HTTP request.
- [x] 1.3 Update `_backend/src/routers/dev.ts` to include `apis.carRouting` in the `/api/dev/status` diagnostic payload. Verify `GET /api/dev/status` returns driving provider status, key configuration, and cache count.

## 2. Frontend API & Settings Auto-Configuration

- [x] 2.1 Extend `_frontend/smarthub/app/composables/use-smarthub-api.ts` with `fetchCarRoute()`, `CarRouteResponse`, and `CarRouteStep` interfaces. Verify frontend TypeScript builds cleanly via `npx nuxi typecheck` or equivalent.
- [x] 2.2 Update `_frontend/smarthub/app/pages/settings.vue` to enable the "Auto-Configure" button for `transportMode === 'car'`, resolving missing coordinates, querying `/api/car/route`, and calculating departure time, routine visibility window (`startTime`/`endTime`), and linked pre-commute alarms. Verify by creating a car routine and triggering Auto-Configure in Settings.
- [x] 2.3 Support car driving route preview in `_frontend/smarthub/app/pages/settings.vue` so users can inspect travel time, traffic delay, and road summary before saving. Verify preview modal renders car route details correctly.

## 3. CarWidget Overhaul & Dev Status HUD

- [x] 3.1 Overhaul `_frontend/smarthub/app/components/car-widget.vue` layout using `theme.css` variables, integrating coordinate reuse (`startCoords`, `destCoords`) and rendering hero commute metrics: travel time, live traffic condition badge (`normal`, `moderate`, `heavy`), departure callout ("Leave by HH:MM"), distance in kilometers, and road summary badge (`via A7`). Verify visual rendering in both Light and Dark themes.
- [x] 3.2 Add skeleton loading states matching `BusWidget`, clear address configuration alerts when `startAddress` or `destination` is unset, and background 5-minute periodic auto-refresh while active on the dashboard. Verify skeleton renders on loading and empty state prompts render when addresses are blank.
- [x] 3.3 Update `_frontend/smarthub/app/components/dev-status-overlay.vue` to include a status indicator row for the car routing service in the top-right API diagnostic HUD. Verify the HUD reflects driving route provider health and updates on dev status refresh.

## 4. End-to-End Verification

- [x] 4.1 Perform end-to-end validation of the car commute workflow: configure a car routine in Settings with start/destination addresses, verify Auto-Configure sets departure and alarm times, verify the dashboard displays `CarWidget` with live travel times during the routine window, and verify both Google Directions and OSRM fallback paths operate without errors.
