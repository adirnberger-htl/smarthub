# Spec Delta

## Purpose

Provides a non-touch, hardware-driven On-Screen Display (OSD) HUD in the frontend that reacts to a physical USB keypad (6 buttons) and rotary encoder knob, allowing the user to toggle room lights and window blinds and interactively configure RGB light color, brightness (for all room lights or individual lights), and blind slat angle with real-time visual feedback styled consistently with SmartHub's Light and Dark themes.

## ADDED Requirements

### Requirement: Physical USB Keypad and Rotary Knob Input Handling
The frontend SHALL listen for global USB HID keyboard/rotary-encoder `keydown` events (when not typing in a text input) and map them to 6 room actions and rotary knob clockwise/counter-clockwise increments.

#### Scenario: Direct light and blind action buttons (single press)
- **WHEN** the user single-presses Button 1 (Main Light), Button 3 (Room LEDs), Button 4 (Desk Lamp), Button 5 (Blinds Up), or Button 6 (Blinds Down)
- **THEN** the frontend dispatches the corresponding `POST /api/devices/:id` command (`ceiling-light` toggle, `room-leds` toggle, `desk-light` toggle, `blinds-all` up, `blinds-all` down) and displays the compact OSD toast pill for 4 seconds

#### Scenario: Group Light Configuration Mode with Button 2 and Rotary Knob
- **WHEN** the user presses Button 2 once
- **THEN** the OSD enters `ALL_RGB` mode where turning the knob adjusts the RGB hue of all room lights supporting the `rgb` capability with a live color preview swatch
- **WHEN** the user presses Button 2 a second time while in `ALL_RGB` mode
- **THEN** the OSD transitions to `ALL_BRIGHTNESS` mode where turning the knob adjusts the `0–100%` brightness of all room lights supporting the `brightness` capability (`room-leds` and `desk-light`)
- **WHEN** the user presses Button 2 a third time (or 4 seconds elapse without input)
- **THEN** the OSD exits configuration mode and hides the popup

#### Scenario: Individual Light Configuration via Switch-On + Knob or Double Press
- **WHEN** the user switches a configurable light ON with a single press (Button 3 for `room-leds` or Button 4 for `desk-light`) and turns the rotary knob while the toast is visible, OR double-presses Button 3 / Button 4 to skip toggling on/off
- **THEN** the OSD enters `DEVICE_RGB` mode if the light supports `rgb` (`room-leds`), or `DEVICE_BRIGHTNESS` mode if the light only supports `brightness` (`desk-light`), and adjusts that specific light on knob turns
- **WHEN** the OSD is in `DEVICE_RGB` mode for an individual light and the user presses that light's button again
- **THEN** the OSD transitions to `DEVICE_BRIGHTNESS` mode for that same light, and pressing that light's button once more exits and hides the popup

#### Scenario: Blind Slat Angle Configuration via Blind Move + Knob or Double Press
- **WHEN** the user single-presses Button 5 (Blinds Up) or Button 6 (Blinds Down) and turns the rotary knob while the blind toast is visible, OR double-presses Button 5 or Button 6 to skip moving the blinds
- **THEN** the OSD enters `BLIND_ANGLE` mode showing a graphical representation of the blind slats, and turning the rotary knob adjusts the desired slat angle (`0–100%` / `0–90°`), updates the slat tilt visualization at 60fps, and sends throttled angle/step updates to `POST /api/devices/blinds-all`

### Requirement: Theme-Aware On-Screen Display (OSD) Visual Feedback and Auto-Hide
The frontend SHALL display a floating OSD overlay styled with SmartHub's Light and Dark mode CSS variables (`theme.css`) whenever a physical button is pressed or the rotary knob is turned, rendering a compact single-row pill for `TOAST` notifications and an expanded widget card for rotary knob configuration modes, and SHALL automatically hide the overlay after 4 seconds of inactivity.

#### Scenario: Compact toast pill vs expanded rotary configuration card in Light and Dark mode
- **WHEN** the OSD is in `TOAST` mode
- **THEN** the overlay renders as a compact pill matching `--bg-surface`, `--text-primary`, `--border-base`, and `--shadow-widget` in both `:root` (light) and `[data-theme="dark"]` (dark) themes
- **WHEN** the OSD is active in `ALL_RGB`, `ALL_BRIGHTNESS`, `DEVICE_RGB`, `DEVICE_BRIGHTNESS`, or `BLIND_ANGLE` mode
- **THEN** the overlay expands into a widget-styled card rendering the active parameter's live visual indicator (hue spectrum + color swatch for RGB, percentage progress bar for brightness, or dynamically rotated slat blades for blind angle) using theme-aware surface, text, border, and accent tokens, and resets the 4-second auto-hide timer on every button or knob event

### Requirement: Configurable USB Key Bindings
The frontend SHALL provide default key bindings for the 6 buttons and rotary knob (`CW` / `CCW`) and allow the user to rebind each action by pressing the physical USB button/knob in Settings.

#### Scenario: Learn custom USB keycode in Settings
- **WHEN** the user selects an OSD hardware action in Settings and presses a physical button or turns the knob on the USB keypad
- **THEN** the frontend captures `KeyboardEvent.code`, persists the updated keymap, and uses it for subsequent hardware OSD triggers
