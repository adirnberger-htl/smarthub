# Tasks

## 1. Unified Backend Device Repository & Service Dispatcher

- [x] 1.1 Create `_backend/src/repo/device-repo.ts` defining `SmartDeviceDTO`, `DeviceCommandDTO`, `DeviceCapability`, and normalized device inventory (`ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, `blinds-all`), and verify TypeScript compilation succeeds
- [x] 1.2 Create `_backend/src/services/device-service.ts` implementing `DeviceService` to validate `DeviceCommandDTO` against `capabilities`, route KNX commands to `globalKnxService` (including `slatAngle` -> `stepDown`/`stepUp` translation), handle `room-leds` RGB/brightness state, and emit normalized `device-state` events; verify with unit/dry-run command tests
- [x] 1.3 Replace `_backend/src/routers/knx.ts` with `_backend/src/routers/devices.ts` exposing `GET /api/devices`, `POST /api/devices/:id`, and `GET /api/devices/events` (`device-snapshot` and `device-state` SSE events), mount it in `_backend/src/app.ts`, and update `_backend/test.http`; verify endpoints respond with normalized `SmartDeviceDTO` objects

## 2. Frontend API Client & Hardware OSD State Machine

- [x] 2.1 Add `SmartDeviceDTO` / `DeviceCommandDTO` types and `fetchDevices()`, `sendDeviceCommand(id, cmd)`, and `getDevicesEventsUrl()` methods to `_frontend/smarthub/app/composables/use-smarthub-api.ts`; verify types check cleanly
- [x] 2.2 Create `_frontend/smarthub/app/composables/use-device-osd.ts` implementing SSE state synchronization, global `keydown` listener for the 7 buttons + rotary knob (`CW`/`CCW`), mode cycling (`LED_COLOR` -> `LED_BRIGHTNESS` -> `DESK_BRIGHTNESS`, `BLIND_ANGLE`), 150ms throttled command dispatch, 4s auto-hide timer, and configurable keybindings in `localStorage`; verify state transitions for each button and knob event

## 3. Global OSD Overlay Component & Keymap Settings UI

- [x] 3.1 Create `_frontend/smarthub/app/components/device-osd-overlay.vue` rendering the auto-hiding glassmorphic HUD for quick toggles, RGB hue spectrum + glowing color swatch, brightness progress bar, and dynamically tilted blind slats (`transform: rotate(...)`), and mount it in `_frontend/smarthub/app/app.vue`; verify the overlay appears and auto-hides on simulated key presses
- [x] 3.2 Add a "Hardware Keypad & Knob Mapping" section to `_frontend/smarthub/app/pages/settings.vue` allowing the user to click an action and press a physical USB key/knob to rebind it; verify rebinding persists and triggers the mapped OSD action
