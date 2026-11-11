# Proposal: Implement Car Widget and Driving Commute Routing

## Why

SmartHub displays commute transit connections on weekday mornings via `BusWidget`, but users who commute by car are currently left with an empty placeholder widget (`CarWidget.vue`) that renders only a static emoji and "Travel time and traffic will be displayed here shortly." Furthermore, routine Auto-Configure is disabled for car mode in Settings, no backend car routing endpoint exists, and driving routes cannot be previewed or tracked with live traffic.

Implementing car routing and a complete `CarWidget` closes this feature gap, giving drivers the same first-class morning commute dashboard experience as public transit commuters—showing travel duration, live traffic delays, target departure times ("Leave by 08:08"), distance, road summary, and automatic routine alarm/visibility scheduling.

## What Changes

- **Backend Car Routing Service & API**:
  - Add `_backend/src/repo/car-router.ts` providing driving route calculations, live traffic duration, distance, and road step summaries via Google Directions API (leveraging existing `GOOGLE_KEY`) with graceful fallback to OSRM when unconfigured or offline.
  - Implement an in-memory/TTL cache (5–10 minutes) for commute driving queries to minimize external quota consumption.
  - Expose `GET /api/car/route?lat_a=..&lon_a=..&lat_b=..&lon_b=..&arrival_time=..` supporting forward departure and reverse arrival calculations.
  - Track car routing service health and active provider in `/api/dev/status` and `dev-status-overlay`.

- **Settings & Routine Auto-Configure Integration**:
  - Enable Auto-Configure for routines with `transportMode === 'car'` in `settings.vue`.
  - Calculate required departure time from target arrival time minus driving duration (including traffic buffer).
  - Automatically configure routine visibility window (`startTime` / `endTime`) and linked wake-up / departure alarms.
  - Provide a car route preview in settings when configuring a car routine.

- **Frontend `CarWidget.vue` Redesign**:
  - Complete overhaul of `CarWidget.vue` matching SmartHub's design language (`theme.css`).
  - Read both `startAddress` and `destination`, participating in the `routine-route-fetching` coordinate reuse pattern (`startCoords` / `destCoords`).
  - Hero commute metrics: Big travel time (e.g. `24 min`), live traffic tag (e.g. `Normal traffic` / `+6 min delay`), recommended departure countdown ("Leave by 08:08" / "In 12 min"), target arrival time, and total distance in kilometers.
  - Route summary & steps: Primary road badges (e.g. `via A7 Mühlkreis Autobahn and B139`) and key turn/highway overview.
  - Polished skeleton loader, error/offline states, and periodic refresh (every 3–5 minutes during the active routine window).

## Capabilities

### New Capabilities
- `driving-routing`: Backend driving route calculation service, caching layer, and REST endpoint (`/api/car/route`) providing driving durations, real-time traffic delay estimates, distance, and route summaries with fallback provider support.

### Modified Capabilities
- `routine-route-fetching`: Extend stored coordinate reuse, address geocoding, targeted refetching, and routine `autoConfigure` calculation to `CarWidget` and car-mode routines.
- `dev-status-overlay`: Add driving routing provider status (provider name, key/fallback state, cached routes, last error) to `/api/dev/status` diagnostic payload and API HUD.

## Impact

- **Backend**:
  - New route file `_backend/src/routers/car-route.ts`.
  - New repository file `_backend/src/repo/car-router.ts`.
  - Updated `_backend/src/app.ts` to mount car route router.
  - Updated `_backend/src/routers/dev.ts` to include driving route status in diagnostic response.
- **Frontend**:
  - Overhauled `_frontend/smarthub/app/components/car-widget.vue`.
  - Updated `_frontend/smarthub/app/pages/settings.vue` (Auto-Configure for car mode, car route preview).
  - Updated `_frontend/smarthub/app/composables/use-smarthub-api.ts` (car route client and DTOs).
  - Updated `_frontend/smarthub/app/components/dev-status-overlay.vue` (display car routing API health).
- **Dependencies**: No heavy new npm dependencies required (uses existing native `fetchJson` and Google API key / OSRM public API).
