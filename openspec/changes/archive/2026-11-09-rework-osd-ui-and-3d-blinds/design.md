# Design

## Context

SmartHub currently renders a compact bottom-center On-Screen Display (`device-osd-overlay.vue`, `max-width: 480px`) driven by `use-device-osd.ts`. The existing implementation relies on a `280ms` double-press delay (`DOUBLE_PRESS_WINDOW_MS`) on Buttons 3–6, reserves Button 2 for a redundant "All Room Lights Mode" (`ALL_RGB` / `ALL_BRIGHTNESS`), does not bind the rotary encoder's push-button (`knob_press`), and renders blind slat angle using six flat 2D CSS bars (`perspective(220px) rotateX(...)`). Meanwhile, the home KNX bus (`docs/home-knx.esf`) already provides a weather station under `Hauptgruppe.Allgemein.0/5/*` broadcasting sun elevation (`0/5/8`), sun azimuth (`0/5/12`), facade brightness in Lux (`0/5/13`–`0/5/19`), outdoor temperature (`0/5/7`), rain (`0/5/6`), and solar radiation (`0/5/26`).

See `proposal.md` for motivation and `specs/` for full behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Eliminate all `280ms` double-press delays on physical buttons so every button press triggers its room action in `0ms`.
- Map the 6 buttons + clickable rotary knob (`knob_press`, `knob_cw`, `knob_ccw`) to the prioritized workflow:
  1. `btn1_main_light`: Main Light (`ceiling-light` toggle)
  2. `btn2_blinds_up`: Blinds Up (`blinds-all` up)
  3. `btn3_blinds_down`: Blinds Down (`blinds-all` down)
  4. `btn4_desk_light`: Desk Light (`desk-light` toggle)
  5. `btn5_led_strips`: LED Strips (`room-leds` toggle)
  6. `btn6_light_memory`: Smart Light Scene Memory (snapshot & turn all lights OFF when any light is ON; restore saved snapshot when all lights are OFF)
  7. `knob_press`: Cycle through the 4 reorderable knob config slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`) and close on the 5th press.
- Rework `device-osd-overlay.vue` into a large center-screen HUD with a vertical 4-step progress rail on the right edge that communicates progression visually without text tutorials.
- Ingest KNX weather station telegrams (`0/5/*`) on the backend with astronomical solar fallback and stream them to the frontend to drive a real-time Three.js 3D Venetian blind and room daylight simulation.

**Non-Goals:**
- Animating full vertical blind travel in 3D (the 3D viewport is dedicated strictly to the `blind_angle` slat tilt and interior sunlight simulation).
- Controlling rooms outside `KZ West`.

## Decisions

### 1. Instant 6-Button + Clickable Knob State Machine (`use-device-osd.ts`)
- **Decision**: Remove `singlePressTimers` and `DOUBLE_PRESS_WINDOW_MS`. Every button press (`btn1`–`btn6`) executes immediately. Add `knob_press` (default keycode `'Enter'`, alternate `'Space'` / `'F19'`) to `OsdHardwareAction`.
- **Slot Cycling & Reordering**:
  - Define `OsdKnobSlot = 'blind_angle' | 'desk_brightness' | 'led_rgb' | 'led_brightness'`.
  - Default slot order: `['blind_angle', 'desk_brightness', 'led_rgb', 'led_brightness']`, persisted in `localStorage` under `smarthub_osd_slot_order`.
  - Pressing `knob_press` when `mode === 'IDLE'` or `mode === 'TOAST'` enters `slotOrder[0]` (`activeSlotIndex = 0`).
  - Pressing `knob_press` while in a knob slot increments `activeSlotIndex`. When `activeSlotIndex` reaches `4` (after the 4th slot), the OSD calls `hideOsdImmediately()`.
  - Turning `knob_cw` / `knob_ccw` while `mode === 'TOAST'` inspects `activeDeviceId`:
    - `'blinds-all'` → jumps to the index of `'blind_angle'` in `slotOrder`
    - `'desk-light'` (when ON) → jumps to `'desk_brightness'`
    - `'room-leds'` (when ON) → jumps to whichever of `'led_rgb'` or `'led_brightness'` appears first in `slotOrder`
  - Turning `knob_cw` / `knob_ccw` from `'IDLE'` opens `slotOrder[0]` and applies the first step delta.
- **Rationale**: Separates instant binary/movement actions (buttons) from continuous parameter tuning (knob click + turn), allowing eyes-free operation from an idle screen (`1–4` knob clicks then turn) while preserving quick turn-after-toggle convenience.

### 2. Button 6: Smart Light Scene Memory Snapshot & Restore
- **Decision**: Maintain a `savedLightScene` object in `use-device-osd.ts` (and persisted in `localStorage` under `smarthub_osd_light_scene`) storing:
  ```ts
  interface SavedLightScene {
    'ceiling-light': { on: boolean }
    'desk-light': { on: boolean; brightness: number }
    'room-leds': { on: boolean; brightness: number; rgb: string }
    savedAt: string
  }
  ```
  - When `btn6_light_memory` is pressed:
    - Check if any of `ceiling-light`, `desk-light`, or `room-leds` has `state.on === true`.
    - **If at least one light is ON**: Save each light's current `on`, `brightness`, and `rgb` into `savedLightScene`, set all active lights to `on: false`, dispatch `POST /api/devices/:id` `{ on: false }` for each active light, and show the center-screen HUD toast with a scene summary (`Saved & Switched OFF`).
    - **If all three lights are OFF**: Read `savedLightScene` (defaulting to a sensible fallback if no snapshot was ever recorded or if the saved snapshot had all lights off) and dispatch `POST /api/devices/:id` for each light that was `on: true` in the snapshot with its saved `brightness` and `rgb`, displaying `Scene Restored`.

### 3. KNX Weather Station Telemetry & Astronomical Fallback (`knx-repo.ts`, `knx-service.ts`)
- **Decision**: Register the weather station group addresses from `docs/home-knx.esf` in `knx-repo.ts`:
  - `0/5/6` (`Niederschlag`, 1-bit `1.001` boolean) → `raining`
  - `0/5/7` (`Außentemperatur`, 2-byte float `9.001`) → `outdoorTemp` (°C)
  - `0/5/8` (`Elevation`, 1-byte) → `sunElevation` (°). Decode 1-byte signed/scaled value (`-90..90` or `0..90°`).
  - `0/5/12` (`Azimuth`, 1-byte) → `sunAzimuth` (°). Decode 1-byte angle (`0..255` mapped to `0..360°`, or raw degrees if `<= 180` / standard KNX scaling).
  - `0/5/13` (`HelligkeitSued_Lux`, 4-byte float `14.027` / uint32) & `0/5/16` (`Lux Süd`, 2-byte float `9.004`) → `luxSouth`
  - `0/5/14` (`HelligkeitWest_Lux`, 4-byte float `14.027` / uint32) & `0/5/17` (`Lux West`, 2-byte float `9.004`) → `luxWest`
  - `0/5/19` (`HelligkeitMax_Lux`, 4-byte) → `luxMax`
  - `0/5/26` (`Globalstrahlung`, 2-byte float `9.024`) → `solarRadiation` (W/m²)
- **Astronomical Fallback**: When `KNX_ENABLED=false` or before the weather station sends telegrams, compute solar `elevation` and `azimuth` from the current timestamp and Linz coordinates (`48.3069° N, 14.2858° E`) using standard solar position formulas, and estimate clear/partly-cloudy `luxWest`, `luxSouth`, and `luxMax` from `sin(elevation)` so the 3D scene always shows realistic time-of-day sun rays even in local development.

### 4. Three.js 3D Blind & Daylight Simulation (`blind-3d-viewport.vue`)
- **Decision**: Build a dedicated client-side Vue component `blind-3d-viewport.vue` using `three`:
  - **Scene Geometry**:
    - Recessed architectural window frame (West/South wall cutout) looking into a stylized 3D room corner (wall, window sill, floor plane with subtle wood/matte surface to catch shadow stripes).
    - 9 extruded 3D Venetian blind slats (`BoxGeometry` with rounded/beveled appearance and metallic roughness material) suspended between vertical ladder cords.
  - **Lighting & Shadows**:
    - `WebGLRenderer` with `shadowMap.enabled = true` (`PCFSoftShadowMap`).
    - `DirectionalLight` representing the sun: its 3D direction vector `(x, y, z)` is computed directly from `environment.sunElevation` and `environment.sunAzimuth` relative to the `KZ West` window normal (`270°` West / `225°` SW), and its color temperature shifts smoothly from warm golden hour (`#ff9e44` at low elevation) to crisp daylight (`#fff8e7` at high elevation) or cool moonlight (`#60a5fa` when `elevation <= 0`).
    - `HemisphereLight` + interior `PointLight` bounce that scales with `transmittedLux = outdoorLux * slatTransmissionFactor(slatAngle, sunElevation)` so the user can visually see both **how the sunbeams stripe across the room** and **how bright the room interior becomes** as they twist the knob from `0°` to `90°`.
  - **Lifecycle**: Initialize the WebGL context when `blind-3d-viewport.vue` mounts, animate slat rotation with critically damped lerp (`requestAnimationFrame` at 60fps), and cleanly dispose geometries, materials, and `WebGLRenderer` on unmount.

### 5. Large Center-Screen HUD with Vertical Side Progress Rail (`device-osd-overlay.vue`)
- **Decision**:
  - Anchor `.osd-overlay` at `top: 50%; left: 50%; transform: translate(-50%, -50%)` with `width: min(92vw, 680px)` and a subtle backdrop blur.
  - Replace text-heavy instruction footers with a **Vertical 4-Segment Side Rail** along the right edge of the card:
    - Each segment represents one of the 4 ordered knob slots (`1` to `4`) with a compact icon and active pill glow.
    - In `TOAST` mode for a configurable device, the rail renders in a subtle ghost/preview state to hint that turning or clicking the knob enters configuration.
    - In any of the 4 knob slot modes, the rail highlights the current slot (`1`–`4`), visually showing how many knob presses remain before the HUD closes.
    - A slim bottom progress bar animates the 4-second auto-hide countdown so the user can see when the HUD will dismiss.

## Risks / Trade-offs

- **[Three.js WebGL context creation overhead when opening `blind_angle`]** → Keep the mesh count low (~15 meshes total: window frame, floor/wall planes, 9 slats, 2 cords) with procedural materials (zero external textures or `.gltf` network fetches) so initialization completes in `< 8ms` on first open.
- **[KNX weather station DPT variations across 1-byte/2-byte/4-byte Lux & Angle GAs]** → Implement defensive buffer decoding in `knx-service.ts` (`dptlib` `9.001` / `9.004` / `14.027` with byte-length fallbacks) and fall back to calculated solar elevation/azimuth whenever a field has not yet been received from the bus.
- **[Existing `localStorage` keymaps missing `knob_press` or using old action names]** → Migrate/merge stored keymaps in `loadKeymapFromStorage()` by falling back to `DEFAULT_OSD_KEYMAP` for any newly introduced `OsdHardwareAction` keys.
