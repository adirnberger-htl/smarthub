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
- **THEN** the OSD immediately dismisses the active toast and returns to idle state without entering slot configuration mode
- **WHEN** the user presses the rotary knob (`knob_press`) while the OSD is idle
- **THEN** the OSD opens the first slot in the user's configured 4-slot knob order (default: `1. blind_angle`, `2. desk_brightness`, `3. led_rgb`, `4. led_brightness`) and highlights Slot 1 on the vertical side progress rail
- **WHEN** the user presses the rotary knob (`knob_press`) again while in Slot 1, Slot 2, or Slot 3
- **THEN** the OSD advances to the next slot in the configured 4-slot order, updates the active indicator on the vertical side progress rail, and resets the 4-second auto-hide timer
- **WHEN** the user presses the rotary knob (`knob_press`) while in Slot 4 (the final slot on the rail)
- **THEN** the OSD exits configuration mode and hides the overlay immediately

#### Scenario: Blind Slat Angle Configuration via Blind Move + Knob or Double Press
- **WHEN** the user turns the rotary knob (`knob_cw` or `knob_ccw`) while in one of the 4 configuration slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`)
- **THEN** the OSD increments or decrements that slot's parameter (`blinds-all` slat angle `0–100%` / `0–90°`, `desk-light` brightness `0–100%`, `room-leds` RGB hue `0–360°`, or `room-leds` brightness `0–100%`), dispatches throttled `POST /api/devices/:id` updates, and resets the 4-second auto-hide timer
- **WHEN** the user turns the rotary knob while a device `TOAST` notification is visible for `blinds-all`, `desk-light` (when ON), or `room-leds` (when ON)
- **THEN** the OSD immediately transitions into the corresponding configuration slot (`blind_angle` for blinds, `desk_brightness` for desk light, or the first configured LED slot for `room-leds`) and applies the knob adjustment
- **WHEN** the user turns the rotary knob while the OSD is hidden/idle
- **THEN** the OSD opens Slot 1 of the configured 4-slot order and applies the knob adjustment

### Requirement: Theme-Aware On-Screen Display (OSD) Visual Feedback and Auto-Hide
The frontend SHALL display a large, center-screen floating OSD HUD styled with SmartHub's Light and Dark mode CSS variables (`theme.css`) whenever a physical button is pressed or the rotary knob is pressed/turned, featuring a subtle vertical side progress rail that indicates multi-step knob slots without verbose text tutorials, and SHALL automatically hide the overlay after 4 seconds of inactivity.

#### Scenario: Compact toast pill vs expanded rotary configuration card in Light and Dark mode
- **WHEN** the OSD is visible in `TOAST` mode
- **THEN** the overlay renders centered on screen (`top: 50%; left: 50%; transform: translate(-50%, -50%)`) as a compact single notification card with the side rail completely hidden, using `--bg-surface`, `--text-primary`, `--border-base`, and `--shadow-overlay` in both `:root` (light) and `[data-theme="dark"]` (dark) themes
- **WHEN** the OSD is active in a knob configuration slot (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`)
- **THEN** the right edge of the HUD displays a 4-segment vertical progress rail highlighting the active slot index (`1` to `4`) so the user can see remaining presses before close without text instructions, accompanied by an auto-hide countdown bar that resets to 4 seconds on every input

### Requirement: Three.js 3D Window Blind Slat and KNX Daylight Simulation
The frontend SHALL render an interactive Three.js WebGL 3D scene in `blind_angle` mode depicting a 3D window frame, horizontal Venetian blind slats that tilt from `0°` (open) to `90°` (closed), and real-time directional sunlight and interior room illumination driven by the KNX weather station's sun angle (`sunElevation`, `sunAzimuth`) and outdoor lux (`luxWest`, `luxSouth`, `luxMax`).

#### Scenario: Real-time 3D slat tilt and interior light transmission on rotary knob turn
- **WHEN** the OSD is in `blind_angle` mode and the user turns the rotary knob
- **THEN** the 3D Venetian blind slats smoothly rotate on their horizontal axes to match the target tilt angle (`0°–90°`) at 60fps, dynamically narrowing or widening the light shafts and updating the simulated interior room brightness

#### Scenario: Sun angle and intensity driven by KNX weather station telemetry
- **WHEN** the OSD renders the 3D blind simulation with current KNX environment telemetry (`sunElevation`, `sunAzimuth`, `luxWest`, `luxSouth`, `outdoorTemp`, `raining`)
- **THEN** the Three.js directional sun light position and color temperature reflect the real sun elevation and azimuth relative to the room window, and the incoming light intensity scales with outdoor lux and slat openness

#### Scenario: Seamless room geometry and glare-free lighting
- **WHEN** the OSD renders the 3D blind simulation
- **THEN** the interior room walls, window reveal, and window sill form an enclosed geometric boundary without open gaps or light leaks, and the slat material and directional lighting use matte shading without additive glare planes to preserve visibility across all sunlight intensities
