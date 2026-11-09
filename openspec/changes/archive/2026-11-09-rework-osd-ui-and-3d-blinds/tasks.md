# Tasks

## 1. Backend KNX Weather Station Telemetry & Solar Fallback

- [x] 1.1 Register KNX weather station group addresses (`0/5/6` Precipitation, `0/5/7` Outdoor Temp, `0/5/8` Sun Elevation, `0/5/12` Sun Azimuth, `0/5/13` & `0/5/16` South Lux, `0/5/14` & `0/5/17` West Lux, `0/5/19` Max Lux, `0/5/26` Solar Radiation) and `KnxEnvironmentDTO` state with Linz solar geometry fallback in `_backend/src/repo/knx-repo.ts`, and verify TypeScript compilation succeeds.
- [x] 1.2 Decode incoming weather station telegrams in `_backend/src/services/knx-service.ts`, include weather station GAs in startup reads, and emit `knx-environment` updates, verifying telegram decoding for 1-bit, 1-byte, 2-byte float, and 4-byte float payloads.
- [x] 1.3 Expose `environment: KnxEnvironmentDTO` in `_backend/src/repo/device-repo.ts`, `_backend/src/services/device-service.ts`, and `_backend/src/routers/devices.ts` (`GET /api/devices` response and `environment-state` SSE events on `GET /api/devices/events`), and verify `GET /api/devices` returns both `devices` and `environment`.

## 2. Frontend Dependencies & OSD State Machine Rework

- [x] 2.1 Add `three` and `@types/three` to `_frontend/smarthub/package.json` and verify package installation succeeds.
- [x] 2.2 Update `_frontend/smarthub/app/composables/use-smarthub-api.ts` with `KnxEnvironmentDTO` types and `fetchDevices` response typing, and verify type checking passes.
- [x] 2.3 Rework `_frontend/smarthub/app/composables/use-device-osd.ts` to remove double-press timers (`0ms` instant actions for Buttons 1–6), implement Button 6 Smart Light Scene Memory snapshot/restore, add `knob_press` cycling through the 4 reorderable slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`) with 5th-press close, persist slot order and saved light scene in `localStorage`, and subscribe to `environment-state` SSE events, verifying all 9 hardware actions and slot transitions work as specified.

## 3. Three.js 3D Blind & KNX Daylight Simulation Component

- [x] 3.1 Create `_frontend/smarthub/app/components/blind-3d-viewport.vue` using Three.js to render a 3D recessed window frame, 9 extruded tilting Venetian blind slats (`0°–90°`), directional sunlight positioned from `environment.sunElevation` and `environment.sunAzimuth`, shadow-mapped light shafts across the interior floor/walls, and dynamic indoor lux/brightness feedback, and verify 60fps slat rotation and proper WebGL resource disposal on unmount.

## 4. Center-Screen OSD HUD & Settings UI

- [x] 4.1 Rework `_frontend/smarthub/app/components/device-osd-overlay.vue` into a large center-screen HUD (`min(92vw, 680px)`) with scaled-up typography, a 4-segment vertical side progress rail indicating slot position (`1`–`4`), Smart Light Scene Memory status badges, an auto-hide countdown bar, and the embedded `blind-3d-viewport.vue`, verifying Light and Dark theme styling.
- [x] 4.2 Update `_frontend/smarthub/app/pages/settings.vue` to support learning/testing the new 6-button + `knob_press` / `knob_cw` / `knob_ccw` bindings and reordering the 4 rotary knob configuration slots (`Blind Slat Angle`, `Desk Light Brightness`, `LED Strip RGB Color`, `LED Strip Brightness`), and verify Frontend build (`npm run build`) completes with zero errors.
