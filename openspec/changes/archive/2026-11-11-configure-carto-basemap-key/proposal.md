# Proposal: Configure CARTO Basemap Key for Car Route Map

## Why

The `CarWidget` route map recently started displaying an "API KEY REQUIRED" diagonal watermark across map tiles on both light and dark themes. This occurs because CARTO recently instituted an API key requirement for direct requests to `basemaps.cartocdn.com`, which were previously open anonymously.

Configuring an optional/required CARTO basemap key in the application environment and passing it to tile requests restores a clean, unwatermarked commuter map in `CarWidget` without needing an expensive or complex migration to Google Maps JavaScript SDK.

## What Changes

- **Environment & Runtime Configuration**:
  - Add `CARTO_KEY` documentation and defaults to `.env.example`.
  - Pass `NUXT_PUBLIC_CARTO_KEY: ${CARTO_KEY:-}` in `docker-compose.yaml` and `docker-compose.dev.yaml` to make the key available to the Nuxt frontend runtime.
  - Define `public.cartoKey` in `_frontend/smarthub/nuxt.config.ts` runtime config.
- **Frontend Tile Layer in `CarWidget`**:
  - In `_frontend/smarthub/app/components/car-widget.vue`, read `cartoKey` from `useRuntimeConfig().public`.
  - Append `?key=${cartoKey}` to `CARTO_DARK_URL` and `CARTO_LIGHT_URL` tile URLs when `cartoKey` is provided.
  - Gracefully fall back to the unkeyed tile URL if `cartoKey` is empty or undefined, preserving existing degraded behavior with a console warning.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `routine-route-fetching`: Update the `Static route map visualization in CarWidget` requirement to support passing a configured CARTO basemap API key with tile layer requests to suppress watermarks.

## Impact

- **Frontend**:
  - `_frontend/smarthub/nuxt.config.ts`: Added `runtimeConfig.public.cartoKey`.
  - `_frontend/smarthub/app/components/car-widget.vue`: Tile URL helper appends `?key=...`.
- **Infrastructure / Config**:
  - `.env.example`: Added `CARTO_KEY` setting under Maps / Routing section.
  - `docker-compose.yaml`: Forwarded `NUXT_PUBLIC_CARTO_KEY` to frontend container.
  - `docker-compose.dev.yaml`: Forwarded `NUXT_PUBLIC_CARTO_KEY` to frontend container.
- **Breaking Changes**: None. Backwards compatible when `CARTO_KEY` is not provided.
