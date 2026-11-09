# Proposal

## Why

The current hardware On-Screen Display (OSD) overlay is a small bottom-center pill/card (`max 480px`) with tiny text tutorials, awkward `280ms` double-press timing requirements, a redundant "All Lights Mode" button, and a flat 2D CSS blind slat preview that lacks real depth. Reworking the OSD into a large center-screen HUD with an instant-action 6-button + clickable-knob workflow, subtle vertical progress rail affordances, a Smart Light Scene Memory button, and a real-time Three.js 3D blind simulation driven by KNX weather station sun angle and outdoor lux makes physical room control faster, clearer across the room, and visually grounded in real daylight physics.

## What Changes

- **Instant 6-Button + Clickable Rotary Knob Architecture**:
  - Remove the `280ms` double-press delay on device buttons so every physical button press executes with `0ms` latency.
  - Map the 6 buttons by room priority:
    - **Button 1**: Main Light (`ceiling-light` instant ON/OFF toggle)
    - **Button 2**: Blinds UP (`blinds-all` move UP)
    - **Button 3**: Blinds DOWN (`blinds-all` move DOWN)
    - **Button 4**: Desk Light (`desk-light` instant ON/OFF toggle)
    - **Button 5**: LED Strips (`room-leds` instant ON/OFF toggle, unified single-color control)
    - **Button 6**: Smart Light Scene Memory (when any room light is ON, snapshots `on`, `brightness`, and `rgb` states of all room lights and switches them all OFF; when all room lights are OFF, restores the saved snapshot).
  - Add a **Rotary Knob Click (`knob_press`)** binding alongside `knob_cw` and `knob_ccw`.
- **Configurable 4-Slot Knob Cycle & Subtle Side Progress Rail**:
  - Pressing the rotary knob from an idle screen (or while the HUD is open) cycles through 4 knob configuration slots shown on a vertical side progress rail (`Slot 1 -> Slot 2 -> Slot 3 -> Slot 4 -> Close` on 5th press):
    1. `blind_angle`: Blind Slat Angle (3D Three.js viewport)
    2. `desk_brightness`: Desk Light Brightness (`0–100%`)
    3. `led_rgb`: LED Strip RGB Color (`0–360°` Hue)
    4. `led_brightness`: LED Strip Brightness (`0–100%`)
  - Turning the knob while a device's toast notification is visible (e.g., right after turning on Desk Light or moving Blinds) jumps directly to that device's corresponding slot on the rail.
  - Allow the user to reorder the 4 knob configuration slots in Settings (`settings.vue`) and persist the custom order in `localStorage`.
- **Large Center-Screen HUD Overlay**:
  - Reposition and scale up `device-osd-overlay.vue` to a prominent center-screen HUD (`min(92vw, 680px)`) with high-contrast typography, an auto-hide progress bar, and a vertical side step rail that visually communicates multi-step progression without verbose text tutorials.
- **KNX Weather Station Sun/Lux Integration & Three.js 3D Blind Viewport**:
  - Extend the KNX backend (`knx-repo.ts`, `knx-service.ts`, `devices.ts`) to monitor and read KNX weather station group addresses from `docs/home-knx.esf` (`0/5/8` Sun Elevation, `0/5/12` Sun Azimuth, `0/5/13`–`0/5/19` South/West/Max Lux, `0/5/6` Precipitation, `0/5/7` Outdoor Temperature, `0/5/26` Solar Radiation) and stream normalized `environment` state (`sunElevation`, `sunAzimuth`, `luxWest`, `luxSouth`, `luxMax`, `outdoorTemp`, `raining`, `solarRadiation`) via `GET /api/devices` and `GET /api/devices/events` SSE (with astronomical/time-of-day fallback when KNX is in dry-run/mock mode or before telegrams arrive).
  - Add a Three.js 3D Venetian blind component (`blind-3d-viewport.vue`) rendered in `BLIND_ANGLE` mode that visualizes a 3D window frame, extruded tilting slats (`0°–90°`), directional sunlight positioned from real KNX `sunElevation` and `sunAzimuth`, shadow-mapped light shafts falling into the room, and real-time interior brightness responding to outdoor lux and slat tilt angle at 60fps.

## Capabilities

### New Capabilities
<!-- None - extends existing capabilities -->

### Modified Capabilities
- `hardware-osd-ui`: Update keypad/knob input handling (instant 6-button mapping, Button 6 Smart Light Scene Memory snapshot/restore, clickable knob `knob_press` cycling through 4 reorderable config slots with 5th-click close), replace the bottom-center compact pill with a large center-screen HUD featuring a vertical side progress rail, and replace the 2D CSS blind preview with a Three.js 3D window/blind simulation driven by real-time KNX sun angle and lux data.
- `knx-control`: Add KNX weather station telemetry ingestion (`0/5/8` Elevation, `0/5/12` Azimuth, `0/5/13`–`0/5/19` Lux, `0/5/6` Rain, `0/5/7` Outdoor Temp, `0/5/26` Global Radiation) with startup reads, live telegram decoding, solar/weather fallback in mock mode, and SSE/REST delivery on `/api/devices` and `/api/devices/events`.

## Impact

- **Backend (`_backend/`)**:
  - `_backend/src/repo/knx-repo.ts` & `_backend/src/services/knx-service.ts`: Register and decode KNX weather station GAs (`0/5/6`, `0/5/7`, `0/5/8`, `0/5/12`, `0/5/13`, `0/5/14`, `0/5/16`, `0/5/17`, `0/5/19`, `0/5/26`) and expose `KnxEnvironmentState` with time-of-day solar geometry fallback.
  - `_backend/src/repo/device-repo.ts`, `_backend/src/services/device-service.ts`, `_backend/src/routers/devices.ts`: Include `environment` telemetry in `GET /api/devices` and emit `environment-state` SSE events on `GET /api/devices/events`.
- **Frontend (`_frontend/smarthub/`)**:
  - `_frontend/smarthub/package.json`: Add `three` and `@types/three` dependencies for the WebGL 3D blind simulation.
  - `_frontend/smarthub/app/composables/use-device-osd.ts`: Implement instant 6-button handlers, Button 6 light scene memory snapshot/restore, `knob_press` 4-slot cycling (`1 -> 2 -> 3 -> 4 -> Close`), reorderable slot configuration persistence, and live `environment` SSE state sync.
  - `_frontend/smarthub/app/components/blind-3d-viewport.vue` (new): Three.js WebGL 3D window, tilting Venetian slats, directional sun light from KNX azimuth/elevation, shadow mapping, and indoor brightness visualization.
  - `_frontend/smarthub/app/components/device-osd-overlay.vue`: Rework into a large center-screen HUD with the vertical side progress rail, scene memory status chips, and embedded 3D blind viewport.
  - `_frontend/smarthub/app/pages/settings.vue`: Add key binding support for `knob_press` (Knob Click), updated button descriptions, and reorder controls for the 4 knob config slots.
