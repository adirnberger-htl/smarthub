# Design: Configure CARTO Basemap Key for Car Route Map

## Context

See [proposal.md](proposal.md) for background. SmartHub frontend is a Nuxt 3 application with SSR disabled (`ssr: false`). `CarWidget` renders a static, theme-aware route map using Leaflet and Carto raster tiles. Currently, `CARTO_DARK_URL` and `CARTO_LIGHT_URL` are defined as static constants with no API key parameter. Since CARTO's policy update, unkeyed tile requests return tiles stamped with an "API KEY REQUIRED" watermark.

## Goals / Non-Goals

**Goals:**
- Provide a clean, unwatermarked route map in `CarWidget` by passing a valid CARTO basemap key.
- Configure the key via standard environment variables (`CARTO_KEY` / `NUXT_PUBLIC_CARTO_KEY`).
- Expose the key to Nuxt client runtime via `runtimeConfig.public.cartoKey`.
- Preserve graceful degradation: if no key is supplied, fall back to unkeyed URLs without crashing or blocking map rendering.

**Non-Goals:**
- Reverse-proxying map raster tiles through `_backend`.
- Replacing Leaflet with Google Maps JavaScript API or MapLibre GL vector tiles.
- Implementing dynamic key generation or rotation.

## Decisions

### 1. Nuxt Public Runtime Config Integration
- **Choice**: Expose `cartoKey` under `runtimeConfig.public` in `_frontend/smarthub/nuxt.config.ts`, sourced from `NUXT_PUBLIC_CARTO_KEY` (mapped from `CARTO_KEY` in `docker-compose.yaml`).
- **Rationale**: In Nuxt 3, client-side code running in browser context cannot access Node.js `process.env`. `runtimeConfig.public` is the idiomatic, type-safe Nuxt mechanism for public environment parameters.
- **Alternatives Considered**:
  - *Proxying tiles through Express backend*: Backend could inject key into upstream Carto requests. Rejected: adds unnecessary network hops, latency, and CPU load on the local device for a high-volume raster CDN.
  - *Hardcoding in component*: Rejected: violates configuration separation and leaks user credentials.

### 2. URL Builder with Graceful Fallback
- **Choice**: In `_frontend/smarthub/app/components/car-widget.vue`, dynamically append `?key=${cartoKey}` when `cartoKey` is truthy and non-empty.
- **Rationale**: Keeps the implementation simple and non-breaking. If an existing deployment does not set `CARTO_KEY`, the widget continues to function without throwing exceptions or failing to mount.
- **Alternatives Considered**: Blocking tile layer creation if key is missing. Rejected: a watermarked map is preferable to a broken, empty widget container.

## Risks / Trade-offs

- **[Risk] Missing CARTO Key in Existing Environments**: Deployments updating without setting `CARTO_KEY` might expect the watermark to disappear automatically.
  - *Mitigation*: Update `.env.example` with clear instructions on generating a free key, and log a diagnostic warning in the browser console when `cartoKey` is not configured.
- **[Risk] Invalid or Expired CARTO Key**: A malformed key will cause tile requests to return HTTP 401/403.
  - *Mitigation*: Leaflet's `tileerror` event can be logged without throwing uncaught exceptions, keeping the rest of `CarWidget` (metrics, departure time, delay badge) fully operational.
