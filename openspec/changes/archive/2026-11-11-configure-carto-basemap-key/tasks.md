# Tasks: Configure CARTO Basemap Key for Car Route Map

## 1. Environment & Runtime Configuration

- [x] 1.1 Add `CARTO_KEY` documentation and defaults to `.env.example` with URL reference to carto.com/basemaps/apikey and verify file formatting
- [x] 1.2 Pass `NUXT_PUBLIC_CARTO_KEY: ${CARTO_KEY:-}` to the frontend service environment in `docker-compose.yaml` and `docker-compose.dev.yaml` and verify docker compose config validity
- [x] 1.3 Add `cartoKey: ''` to `runtimeConfig.public` in `_frontend/smarthub/nuxt.config.ts` and verify Nuxt type definitions update

## 2. CarWidget Map Tile Integration

- [x] 2.1 Update `getThemeTileUrl` in `_frontend/smarthub/app/components/car-widget.vue` to read `useRuntimeConfig().public.cartoKey` and append `?key=${cartoKey}` to tile URLs when present
- [x] 2.2 Add graceful handling and console diagnostic warning when `cartoKey` is omitted so unkeyed tiles continue to load without runtime errors

## 3. Verification & Build Checks

- [x] 3.1 Run frontend type-check and build test (`npm run build` in `_frontend/smarthub`) to verify no compile or runtime config regressions
- [x] 3.2 Verify rendered tile URLs with and without key in browser/component tests
