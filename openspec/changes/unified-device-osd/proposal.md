# Proposal

## Why

The smart home display is a non-touch wall screen controlled exclusively via a physical USB keypad (6 tactile buttons) and rotary encoder knob, while devices in the room span multiple protocols and capabilities (KNX on/off lights, KNX dimmable lights, RGB LED lights, and KNX window blinds with slat angles). We need a unified, protocol-agnostic backend device API (`SmartDeviceDTO` / `DeviceCommandDTO`) and a theme-aware On-Screen Display (OSD) frontend HUD that blends naturally into SmartHub's Light and Dark mode design system (`theme.css`) and supports intuitive single-press, double-press, and rotary knob interactions without per-device UI cards.

## What Changes

- **BREAKING**: Replace protocol-specific `/api/knx/devices`, `/api/knx/lights/:id`, `/api/knx/blinds/:id`, and `/api/knx/events` routes with a unified `/api/devices` API (`GET /api/devices`, `POST /api/devices/:id`, `GET /api/devices/events`).
- Introduce a single normalized `SmartDeviceDTO` (exposing `id`, `name`, `room`, `category`, `capabilities`, and `state` without leaking KNX group addresses) and `DeviceCommandDTO` (`on`, `brightness`, `rgb`, `blindAction`, `slatAngle`).
- Add a backend `DeviceService` dispatcher that validates commands against device capabilities and routes execution to protocol adapters (`KnxService` for KNX devices and `LedService` for RGB LED strips).
- Add a frontend USB HID keyboard/rotary-knob state machine composable (`use-device-osd.ts`) for 6 buttons + rotary knob (`CW`/`CCW`):
  - **Button 1 (`ceiling-light`)**: Single press toggles main ceiling light on/off with a compact toast pill.
  - **Button 2 (All Room Lights Group Config)**: Cycles `ALL_RGB` (adjusts RGB hue for all `rgb`-capable room lights) -> `ALL_BRIGHTNESS` (adjusts brightness for all `brightness`-capable room lights) -> Hides OSD.
  - **Button 3 (`room-leds`) & Button 4 (`desk-light`)**: Single press toggles the light on/off and shows a compact toast pill; turning the knob while the switched-on toast is visible enters individual `DEVICE_RGB` (if supported) or `DEVICE_BRIGHTNESS`, and pressing the same button again steps from `DEVICE_RGB` -> `DEVICE_BRIGHTNESS` -> Hides OSD. Double-pressing the button skips the on/off toggle and jumps straight into `DEVICE_RGB` (or `DEVICE_BRIGHTNESS` if RGB is not supported).
  - **Button 5 (`blinds-all` Up) & Button 6 (`blinds-all` Down)**: Single press moves blinds up/down and shows a compact toast pill; turning the knob while the toast is visible enters `BLIND_ANGLE` mode. Double-pressing Button 5 or 6 skips moving the blinds and jumps straight into `BLIND_ANGLE` mode.
- Restyle `<DeviceOsdOverlay>` (`device-osd-overlay.vue`) and settings notifications (`settings.vue`) to use `theme.css` variables (`--bg-surface`, `--text-primary`, `--border-base`, `--color-primary`, `--bg-primary-light`, `--weather-dest-*`, `--shadow-widget`) so they match the rest of the SmartHub UI across Light and Dark modes, rendering `TOAST` as a compact single-row pill and expanding into a widget-styled card for rotary knob modes.

## Capabilities

### New Capabilities
- `hardware-osd-ui`: Frontend USB keypad and rotary encoder input state machine, configurable keymap, and auto-hiding On-Screen Display (OSD) HUD for lights (on/off, brightness, RGB color) and window blinds (up/down, live slat angle visualization).

### Modified Capabilities
- `knx-control`: Replace `/api/knx/*` HTTP/SSE endpoints with the unified `/api/devices` contract (`SmartDeviceDTO` and `DeviceCommandDTO`), routing KNX light, outlet, and blind commands (including knob-driven `slatAngle` step adjustments) alongside RGB LED devices through a protocol-agnostic dispatcher.

## Impact

- **Backend (`_backend`)**:
  - Replaces `_backend/src/routers/knx.ts` with `_backend/src/routers/devices.ts`.
  - Adds `_backend/src/repo/device-repo.ts` and `_backend/src/services/device-service.ts` wrapping `_backend/src/repo/knx-repo.ts` and `_backend/src/services/knx-service.ts`.
  - Updates `_backend/src/app.ts` to mount the unified devices router.
- **Frontend (`_frontend/smarthub`)**:
  - Extends `_frontend/smarthub/app/composables/use-smarthub-api.ts` with `/api/devices` methods.
  - Adds `_frontend/smarthub/app/composables/use-device-osd.ts` and `_frontend/smarthub/app/components/device-osd-overlay.vue`.
  - Mounts `<DeviceOsdOverlay />` in `_frontend/smarthub/app/app.vue` and adds optional key-binding learning UI in `_frontend/smarthub/app/pages/settings.vue`.
