# Design

## Context

See [proposal.md](proposal.md) for motivation. The backend (`_backend/src/repo/car-router.ts`) queries OSRM or Google Directions for automotive routes, extracting text instructions while omitting full route geometry. In the frontend, `CarWidget` renders a text maneuver list that provides limited spatial context for commuters.

SmartHub runs as a dashboard on desktop and wall-mounted kiosk screens, with dark/light theme switching via `resolvedTheme` and strict hardware-first interaction constraints.

## Goals / Non-Goals

**Goals:**
- Provide normalized `geometry: [number, number][]` (array of `[latitude, longitude]`) from `/api/car/route` regardless of provider (Google or OSRM).
- Replace text steps in `CarWidget` with an auto-fitting, theme-aware route map.
- Completely lock out mouse and touch interactions (`pointer-events: none`, no drag, no scroll-wheel zoom, no on-screen zoom buttons) to maintain a static, drift-free overview of the commute.
- Match application theme dynamically (Carto Dark Matter for dark mode, Carto Voyager/Positron for light mode).

**Non-Goals:**
- Live turn-by-turn navigation or real-time GPS vehicle tracking.
- Interactive user panning/zooming on the map.
- Self-hosting raster or vector map tile servers.

## Decisions

### 1. Leaflet with ClientOnly and Theme-Aware Carto Raster Tiles
- **Choice**: Use `leaflet` mounted inside Nuxt `<ClientOnly>` with Carto tiles.
- **Rationale**: Leaflet is lightweight (~42 KB gzip), CPU-efficient (does not require WebGL), and runs smoothly on low-power kiosk hardware. Free Carto basemaps provide dedicated high-contrast light and dark styles matching SmartHub:
  - Dark: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png`
  - Light: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`
- **Alternatives Considered**:
  - *Google Maps JS API*: Requires external script loader and incurs per-load billing.
  - *MapLibre GL*: Requires WebGL 2, which can stutter or crash on embedded kiosk graphics chips.

### 2. Standardized Backend Coordinate Normalization
- **Choice**: Backend normalizes all geometry into a uniform array of `[lat, lon]` pairs before caching and returning to the frontend.
  - OSRM: Requested via `overview=full&geometries=geojson`. The GeoJSON coordinates `[lon, lat]` are inverted to `[lat, lon]`.
  - Google: The `overview_polyline.points` string is decoded on the backend into `[lat, lon]` tuples.
- **Rationale**: Keeps the frontend agnostic of the routing provider. Avoids bundling polyline decoding libraries into the client bundle.
- **Alternatives Considered**: Passing raw encoded polyline string to frontend. Rejected because frontend would need conditional decoders depending on provider.

### 3. Strict Interaction Lockout
- **Choice**: Configure Leaflet with all interaction flags disabled:
  ```ts
  {
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomControl: false,
    attributionControl: false
  }
  ```
  Complement with CSS `pointer-events: none` on the map container.
- **Rationale**: Prevents accidental swiping or scrolling from moving the map off-screen on touch kiosks, keeping the route centered and perfectly framed at all times.
- **Alternatives Considered**: Allowing touch pan/zoom with a reset button. Rejected per product requirement: strictly no touch or mouse interaction.

## Risks / Trade-offs

- **[Risk] SSR Window Reference Error**: Leaflet accesses `window` and `document` at import time.
  - *Mitigation*: Dynamically import `leaflet` on client side inside `onMounted` / `<ClientOnly>`.
- **[Risk] Container Dimensions during Initial Render**: Leaflet requires accurate container pixel dimensions to call `invalidateSize()` and `fitBounds()`.
  - *Mitigation*: Call `map.invalidateSize()` inside `nextTick()` after route data is received and container is rendered.
- **[Risk] Missing Leaflet CSS**: Missing Leaflet CSS causes tiles and markers to misalign.
  - *Mitigation*: Import `leaflet/dist/leaflet.css` directly in `car-widget.vue` or `nuxt.config.ts`.
