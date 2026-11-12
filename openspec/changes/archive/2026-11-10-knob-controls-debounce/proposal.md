# Proposal

## Why

The current hardware rotary knob control uses a 150ms leading-edge and periodic throttle that dispatches HTTP commands on the first detent, every 150ms during rotation, and on every micro-pause. For window blind slat angle adjustments, this floods the backend with HTTP requests and triggers repeated physical KNX relay step pulses (`0/1/36`), causing excessive relay chatter and actuator wear. Introducing a 700ms trailing-edge debounce allows the user to freely turn the knob and view instant 60fps visual feedback, while sending only a single consolidated command once the user stops turning.

## What Changes

- Replace the 150ms leading-edge/periodic knob throttle with a 700ms trailing-edge debounce across all 4 rotary knob configuration slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`).
- Maintain immediate local UI feedback (0ms latency for Three.js 3D blind tilt, desk brightness bar, and LED color/brightness displays) on every knob detent.
- Implement immediate command flushing (`0ms`) when the user presses the rotary knob (`knob_press`), cycles slots, or dismisses the HUD, ensuring pending adjustments are never delayed or dropped.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `hardware-osd-ui`: Update rotary knob input handling scenarios to require 700ms trailing-edge debounced network dispatches after rotation ceases, with immediate local visual updates and immediate flush on knob click or HUD exit.

## Impact

- Frontend: `_frontend/smarthub/app/composables/use-device-osd.ts` (knob command dispatching and timer management).
- Backend & Hardware: Substantially reduces inbound `POST /api/devices/:id` requests during rotary adjustments and prevents rapid sequential KNX step pulse telegrams.
