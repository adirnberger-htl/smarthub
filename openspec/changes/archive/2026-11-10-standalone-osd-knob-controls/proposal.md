# Proposal

## Why

When adjusting a device right after a toast notification (such as moving the blinds UP/DOWN or toggling a light), turning the rotary knob currently drops the user into the full 4-slot configuration cycle (`Slot 1 of 4`) complete with the vertical side progress rail showing unrelated devices (Desk Light, LED RGB, LED Brightness). This clutters the interface and misaligns with user intent: the user wanted to fine-tune the specific device they just operated, not cycle through unrelated room hardware.

## What Changes

- **Standalone Knob Control from Device Toasts**:
  - Turning the rotary knob during a `blinds-all` toast opens a focused, standalone Blind Slat Angle control (3D tilt viewport) with the 4-slot side rail completely hidden and header eyebrow showing only the active control title without "SLOT X OF 4".
  - Turning the rotary knob during a `desk-light` toast opens a focused, standalone Desk Light Brightness control with the side rail hidden.
  - Turning the rotary knob during a `room-leds` toast opens a focused, standalone LED control starting at the primary configured LED slot (`led_rgb` or `led_brightness`) with the side rail hidden.
  - Turning the rotary knob during a `ceiling-light` toast maintains existing behavior (no dimming available).
- **Standalone Knob Click Behavior (`knob_press`)**:
  - In single-slot standalone modes (`blind_angle`, `desk_brightness`), pressing `knob_press` flushes pending debounced commands and immediately closes the HUD instead of cycling to the next global slot.
  - In standalone `room-leds` mode, pressing `knob_press` toggles between `led_rgb` and `led_brightness`, and the next press flushes pending commands and closes the HUD.
- **Preserved Global 4-Slot Cycle Mode**:
  - Entering configuration mode from an idle state via knob click (`knob_press`) or idle knob turn continues to display the full 4-slot vertical progress rail and step through all 4 configured slots in order.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `hardware-osd-ui`: Update rotary knob input handling and OSD visual feedback requirements to support standalone device control modes when initiated from device toast notifications, with hidden side rail, clean eyebrow styling, and dedicated knob click dismissal/toggling.

## Impact

- Frontend:
  - `_frontend/smarthub/app/composables/use-device-osd.ts`: Track standalone/focused session state, adjust toast-to-knob transition logic, and handle standalone knob click dismissals and LED slot toggling.
  - `_frontend/smarthub/app/components/device-osd-overlay.vue`: Conditionally hide side progress rail and adapt header eyebrow in standalone mode.
