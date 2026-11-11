# Proposal

## Why

The current `CarWidget` displays a plain text list of up to four maneuver directions (e.g., "turn left on B125") alongside a "+ N more maneuvers" label. On a wall-mounted kiosk and desktop dashboard, reading a small textual turn list is cumbersome and provides poor spatial awareness compared to a visual route path.

By replacing the textual step list with a clean, static, auto-fitted route map that responds to the SmartHub theme (Carto Dark/Voyager tiles) and suppresses pointer interactions, users can instantly assess their commute path, direction, and traffic context at a glance without unwanted viewport drift or accidental touch events.

## What Changes

- **Backend Route Geometry**:
  - Update `GET /api/car/route` and `calculateCarRoute` in `_backend/src/repo/car-router.ts`.
  - In OSRM queries, request full geometry (`overview=full&geometries=geojson`) and map coordinates to `[latitude, longitude]` coordinate tuples.
  - In Google Directions queries, extract `overview_polyline.points` and decode into `[latitude, longitude]` tuples.
  - Expose `geometry: [number, number][]` on `CarRouteResult` and the HTTP API response.
- **Frontend Map Visualization in `CarWidget`**:
  - Add `leaflet` and `@types/leaflet` dependencies to `_frontend/smarthub`.
  - Replace the text maneuver list (`.car-widget__path-card`) with a dedicated static route map component container (`<ClientOnly>`).
  - Render an auto-fitting polyline of the commute geometry styled with `var(--color-primary)`.
  - Display sleek start `[A]` and destination `[B]` location markers.
  - Bind map tile layer to active theme (`resolvedTheme`): Carto Dark Matter in dark mode, Carto Voyager/Positron in light mode.
  - **Interaction Lockout**: Completely disable pointer/touch gestures (`dragging: false`, `touchZoom: false`, `scrollWheelZoom: false`, `doubleClickZoom: false`, `zoomControl: false`, `keyboard: false`, CSS `pointer-events: none`). Viewport always remains perfectly fitted to the route bounds.

## Capabilities

### Modified Capabilities

- `driving-routing`: Update `GET /api/car/route` requirements to include full route polyline `geometry` as an array of `[lat, lon]` coordinate pairs.
- `routine-route-fetching`: Update `CarWidget` requirements to replace the textual step directions list with a static, non-interactive auto-fitting route map matching the active theme.

## Impact

- **Backend**: `_backend/src/repo/car-router.ts`, `_backend/src/routers/car-route.ts`, and test suites `dev-status.test.ts`, `car-router.test.ts`, `car-route.test.ts`.
- **Frontend**: `_frontend/smarthub/package.json` (`leaflet`), `_frontend/smarthub/app/components/car-widget.vue`, `_frontend/smarthub/app/composables/use-smarthub-api.ts`.
- **API Contracts**: `CarRouteResult` includes optional/required `geometry: [number, number][]`.
