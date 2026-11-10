# Spec Delta

## MODIFIED Requirements

### Requirement: Physical USB Keypad and Rotary Knob Input Handling
The frontend SHALL listen for global USB HID keyboard/rotary-encoder `keydown` events (when not typing in a text input) and map them to 6 instant-action physical buttons, a rotary knob click (`knob_press`), and rotary knob clockwise/counter-clockwise increments (`knob_cw`, `knob_ccw`) without double-press latency.

#### Scenario: Direct light and blind action buttons (single press)
- **WHEN** the user single-presses Button 1 (Main Light), Button 2 (Blinds Up), Button 3 (Blinds Down), Button 4 (Desk Lamp), or Button 5 (Room LEDs)
- **THEN** the frontend immediately (`0ms` delay) dispatches the corresponding `POST /api/devices/:id` command (`ceiling-light` toggle, `blinds-all` up, `blinds-all` down, `desk-light` toggle, `room-leds` toggle) and displays the center-screen OSD notification for 4 seconds

#### Scenario: Group Light Configuration Mode with Button 2 and Rotary Knob
- **WHEN** the user presses Button 6 (Smart Light Scene Memory) while at least one room light (`ceiling-light`, `desk-light`, or `room-leds`) is currently ON
- **THEN** the frontend snapshots and persists the current `on`, `brightness`, and `rgb` state of all three room lights, dispatches commands to switch all active room lights OFF, and displays the center-screen OSD notification indicating the scene was saved and all lights were switched OFF
- **WHEN** the user presses Button 6 while all room lights (`ceiling-light`, `desk-light`, and `room-leds`) are currently OFF and a saved light scene snapshot exists
- **THEN** the frontend dispatches commands to restore each room light to its saved `on`, `brightness`, and `rgb` state and displays the center-screen OSD notification indicating the saved light scene was restored

#### Scenario: Individual Light Configuration via Switch-On + Knob or Double Press
- **WHEN** the user presses the rotary knob (`knob_press`) while a `TOAST` notification is active on screen
- **THEN** the OSD flushes any pending debounced rotary command immediately, dismisses the active toast, and returns to idle state without entering slot configuration mode
- **WHEN** the user presses the rotary knob (`knob_press`) while the OSD is idle
- **THEN** the OSD opens the first slot in the user's configured 4-slot knob order (default: `1. blind_angle`, `2. desk_brightness`, `3. led_rgb`, `4. led_brightness`) and highlights Slot 1 on the vertical side progress rail
- **WHEN** the user presses the rotary knob (`knob_press`) again while in Slot 1, Slot 2, or Slot 3
- **THEN** the OSD flushes any pending debounced rotary command immediately, advances to the next slot in the configured 4-slot order, updates the active indicator on the vertical side progress rail, and resets the 4-second auto-hide timer
- **WHEN** the user presses the rotary knob (`knob_press`) while in Slot 4 (the final slot on the rail)
- **THEN** the OSD flushes any pending debounced rotary command immediately, exits configuration mode, and hides the overlay immediately

#### Scenario: Blind Slat Angle Configuration via Blind Move + Knob or Double Press
- **WHEN** the user turns the rotary knob (`knob_cw` or `knob_ccw`) while in one of the 4 configuration slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`)
- **THEN** the OSD increments or decrements that slot's parameter (`blinds-all` slat angle `0–100%` / `0–90°`, `desk-light` brightness `0–100%`, `room-leds` RGB hue `0–360°`, or `room-leds` brightness `0–100%`), updates the local visual HUD immediately (`0ms` latency), buffers network dispatch behind a 700ms trailing-edge debounce timer, and resets the 4-second auto-hide timer
- **WHEN** the 700ms rotary debounce timer elapses without further knob rotation
- **THEN** the frontend dispatches a single consolidated `POST /api/devices/:id` command with the final settled parameter value
- **WHEN** the user presses the rotary knob (`knob_press`), cycles slots, or the OSD is hidden while a debounced rotary command is pending
- **THEN** the frontend immediately flushes and dispatches the pending command (`0ms` delay) before transitioning state
- **WHEN** the user turns the rotary knob while a device `TOAST` notification is visible for `blinds-all`, `desk-light` (when ON), or `room-leds` (when ON)
- **THEN** the OSD immediately transitions into the corresponding configuration slot (`blind_angle` for blinds, `desk_brightness` for desk light, or the first configured LED slot for `room-leds`) and applies the knob adjustment
- **WHEN** the user turns the rotary knob while the OSD is hidden/idle
- **THEN** the OSD opens Slot 1 of the configured 4-slot order and applies the knob adjustment
