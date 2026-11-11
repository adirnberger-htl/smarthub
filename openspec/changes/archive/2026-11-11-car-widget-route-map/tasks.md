# Tasks

## 1. Backend Route Geometry Support

- [x] 1.1 Implement polyline decoding and OSRM/Google geometry extraction in `_backend/src/repo/car-router.ts` to output normalized `[lat, lon][]` coordinates.
- [x] 1.2 Update `CarRouteResult` interface and `/api/car/route` response payload with `geometry: [number, number][]`.
- [x] 1.3 Update backend tests in `_backend/tests/car-router.test.ts` and `_backend/tests/car-route.test.ts` to verify `geometry` array is populated and accurate.

## 2. Frontend Dependency and API Types

- [x] 2.1 Add `leaflet` and `@types/leaflet` dependencies to `_frontend/smarthub/package.json` and verify package installation.
- [x] 2.2 Update `CarRouteResponse` in `_frontend/smarthub/app/composables/use-smarthub-api.ts` to include `geometry?: [number, number][]`.

## 3. CarWidget Static Map Integration

- [x] 3.1 Replace `.car-widget__path-card` text steps in `_frontend/smarthub/app/components/car-widget.vue` with a static map container inside `<ClientOnly>`, styling it with `pointer-events: none`.
- [x] 3.2 Mount Leaflet map with all interactions disabled (`dragging: false`, `touchZoom: false`, `scrollWheelZoom: false`, `doubleClickZoom: false`, `zoomControl: false`, `keyboard: false`), render route polyline and start/destination markers, and call `fitBounds()` with padding.
- [x] 3.3 Add reactive tile layer switching bound to `resolvedTheme`, using Carto Dark Matter in dark mode and Carto Voyager in light mode.

## 4. Verification and Build

- [x] 4.1 Run backend test suite (`npm --prefix _backend test`) and verify all route tests pass with geometry checks.
- [x] 4.2 Run frontend production build (`npm --prefix _frontend/smarthub run build`) to ensure SSR compatibility and zero bundle or type errors.
