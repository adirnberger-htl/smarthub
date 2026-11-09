# Proposal

## Why

The smart home display is a non-touch wall screen controlled exclusively via a physical USB keypad (7 tactile buttons) and rotary encoder knob, while devices in the room span multiple protocols and capabilities (KNX on/off lights, KNX dimmable lights, RGB LED lights, and KNX window blinds with slat angles). We need a unified, protocol-agnostic backend device API (`SmartDeviceDTO` / `DeviceCommandDTO`) and a minimal-code On-Screen Display (OSD) frontend HUD that pops up on physical button/knob input without requiring per-device UI components.

## What Changes

- **BREAKING**: Replace protocol-specific `/api/knx/devices`, `/api/knx/lights/:id`, `/api/knx/blinds/:id`, and `/api/knx/events` routes with a unified `/api/devices` API (`GET /api/devices`, `POST /api/devices/:id`, `GET /api/devices/events`).
- Introduce a single normalized `SmartDeviceDTO` (exposing `id`, `name`, `room`, `category`, `capabilities`, and `state` without leaking KNX group addresses) and `DeviceCommandDTO` (`on`, `brightness`, `rgb`, `blindAction`, `slatAngle`).
- Add a backend `DeviceService` dispatcher that validates commands against device capabilities and routes execution to protocol adapters (`KnxService` for KNX devices and `LedService` for RGB LED strips).
- Add a frontend USB HID keyboard/rotary-knob state machine composable (`use-device-osd.ts`) supporting direct device toggles (main light, room LEDs, desk lamp, blinds up/down) and multi-step rotary knob configuration modes (LED color, LED brightness, desk brightness, blind slat angle) with configurable key bindings.
- Add a single reactive `<DeviceOsdOverlay>` HUD component mounted globally that pops up on physical input, renders live 60fps visual feedback (including RGB color swatch/spectrum, brightness bars, and dynamically tilted blind slats), and auto-hides after inactivity.

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
