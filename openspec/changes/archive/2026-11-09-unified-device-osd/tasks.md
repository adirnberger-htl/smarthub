# Tasks

## 1. Unified Backend Device Repository & Service Dispatcher

- [x] 1.1 Create `_backend/src/repo/device-repo.ts` defining `SmartDeviceDTO`, `DeviceCommandDTO`, `DeviceCapability`, and normalized device inventory (`ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, `blinds-all`), and verify TypeScript compilation succeeds
- [x] 1.2 Create `_backend/src/services/device-service.ts` implementing `DeviceService` to validate `DeviceCommandDTO` against `capabilities`, route KNX commands to `globalKnxService` (including `slatAngle` -> `stepDown`/`stepUp` translation), handle `room-leds` RGB/brightness state, and emit normalized `device-state` events; verify with unit/dry-run command tests
- [x] 1.3 Replace `_backend/src/routers/knx.ts` with `_backend/src/routers/devices.ts` exposing `GET /api/devices`, `POST /api/devices/:id`, and `GET /api/devices/events` (`device-snapshot` and `device-state` SSE events), mount it in `_backend/src/app.ts`, and update `_backend/test.http`; verify endpoints respond with normalized `SmartDeviceDTO` objects

## 2. Frontend API Client & Hardware OSD State Machine

- [x] 2.1 Add `SmartDeviceDTO` / `DeviceCommandDTO` types and `fetchDevices()`, `sendDeviceCommand(id, cmd)`, and `getDevicesEventsUrl()` methods to `_frontend/smarthub/app/composables/use-smarthub-api.ts`; verify types check cleanly
- [x] 2.2 Update `_frontend/smarthub/app/composables/use-device-osd.ts` to use the 6-button + rotary knob model (removing `btn7_blind_angle`), implementing:
  - Button 2 group mode cycling (`ALL_RGB` for all `rgb` lights -> `ALL_BRIGHTNESS` for all `brightness` lights -> hide)
  - Single-press toggle + knob turn to enter individual `DEVICE_RGB` / `DEVICE_BRIGHTNESS` on Buttons 3 & 4, and button re-press to step `DEVICE_RGB` -> `DEVICE_BRIGHTNESS` -> hide
  - Single-press blind move + knob turn to enter `BLIND_ANGLE` on Buttons 5 & 6
  - Double-press (~280ms window) on Buttons 3, 4, 5, 6 to skip on/off or blind movement and jump straight into `DEVICE_RGB`, `DEVICE_BRIGHTNESS`, or `BLIND_ANGLE`

## 3. Global OSD Overlay Component & Keymap Settings UI

- [x] 3.1 Restyle `_frontend/smarthub/app/components/device-osd-overlay.vue` and `_frontend/smarthub/app/assets/css/theme.css` (plus `.ios-toast` in `settings.vue`) to match SmartHub's Light and Dark mode UI (`--bg-surface`, `--text-primary`, `--border-base`, `--color-primary`, `--bg-primary-light`, `--weather-dest-*`, `--shadow-widget`), rendering `TOAST` as a compact single-row pill (Option B) and knob modes (`ALL_RGB`, `ALL_BRIGHTNESS`, `DEVICE_RGB`, `DEVICE_BRIGHTNESS`, `BLIND_ANGLE`) as a theme-aware widget card
- [x] 3.2 Verify `_frontend/smarthub/app/pages/settings.vue` hardware keymap learner reflects the 6-button + knob action metadata and supports testing/rebinding each action cleanly
