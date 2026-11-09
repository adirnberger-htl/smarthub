# Spec Delta

## Purpose

Provides a non-touch, hardware-driven On-Screen Display (OSD) HUD in the frontend that reacts to a physical USB keypad (7 buttons) and rotary encoder knob, allowing the user to toggle room lights and window blinds and interactively configure RGB light color, brightness, and blind slat angle with real-time visual feedback.

## ADDED Requirements

### Requirement: Physical USB Keypad and Rotary Knob Input Handling
The frontend SHALL listen for global USB HID keyboard/rotary-encoder `keydown` events (when not typing in a text input) and map them to 7 room actions and rotary knob clockwise/counter-clockwise increments.

#### Scenario: Direct light and blind action buttons
- **WHEN** the user presses Button 1 (Main Light), Button 3 (Room LEDs), Button 4 (Desk Lamp), Button 5 (Blinds Up), or Button 6 (Blinds Down)
- **THEN** the frontend dispatches the corresponding `POST /api/devices/:id` command (`ceiling-light` toggle, `room-leds` toggle, `desk-light` toggle, `blinds-all` up, `blinds-all` down) and displays the OSD popup for 4 seconds

#### Scenario: Cycle Light Configuration Mode with Button 2 and Rotary Knob
- **WHEN** the user presses Button 2 once
- **THEN** the OSD enters `LED_COLOR` mode where turning the knob adjusts the RGB hue of `room-leds` with a live color preview swatch
- **WHEN** the user presses Button 2 a second time while in `LED_COLOR` mode
- **THEN** the OSD transitions to `LED_BRIGHTNESS` mode where turning the knob adjusts the `0–100%` brightness of `room-leds`
- **WHEN** the user presses Button 2 a third time while in `LED_BRIGHTNESS` mode
- **THEN** the OSD transitions to `DESK_BRIGHTNESS` mode where turning the knob adjusts the `0–100%` brightness of `desk-light`
- **WHEN** the user presses Button 2 a fourth time (or 4 seconds elapse without input)
- **THEN** the OSD exits configuration mode and hides the popup

#### Scenario: Blind Slat Angle Configuration Mode with Button 7 and Rotary Knob
- **WHEN** the user presses Button 7
- **THEN** the OSD enters `BLIND_ANGLE` mode showing a graphical representation of the blind slats, and turning the rotary knob adjusts the desired slat angle (`0–100%` / `0–90°`), updates the slat tilt visualization at 60fps, and sends throttled angle/step updates to `POST /api/devices/blinds-all`

### Requirement: On-Screen Display (OSD) Visual Feedback and Auto-Hide
The frontend SHALL display a floating OSD overlay whenever a physical button is pressed or the rotary knob is turned, and SHALL automatically hide the overlay after 4 seconds of inactivity.

#### Scenario: Visual preview for RGB color, brightness, and blind slat angle
- **WHEN** the OSD is active in `LED_COLOR`, `LED_BRIGHTNESS`, `DESK_BRIGHTNESS`, or `BLIND_ANGLE` mode
- **THEN** the overlay renders the active parameter's live visual indicator (hue spectrum + glowing color swatch for RGB, percentage progress bar for brightness, or dynamically rotated slat blades for blind angle) and resets the 4-second auto-hide timer on every button or knob event

### Requirement: Configurable USB Key Bindings
The frontend SHALL provide default key bindings for the 7 buttons and rotary knob (`CW` / `CCW`) and allow the user to rebind each action by pressing the physical USB button/knob in Settings.

#### Scenario: Learn custom USB keycode in Settings
- **WHEN** the user selects an OSD hardware action in Settings and presses a physical button or turns the knob on the USB keypad
- **THEN** the frontend captures `KeyboardEvent.code`, persists the updated keymap, and uses it for subsequent hardware OSD triggers
