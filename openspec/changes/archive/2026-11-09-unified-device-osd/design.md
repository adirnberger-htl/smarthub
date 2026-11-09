# Design

## Context

See `proposal.md` for motivation. Currently, `_backend/src/routers/knx.ts` exposes KNX-specific endpoints (`/api/knx/devices`, `/api/knx/lights/:id`, `/api/knx/blinds/:id`, `/api/knx/events`) and leaks raw KNX group addresses (`switchGA`, `dimGA`, `posSlatGA`). The frontend is displayed on a non-touch wall monitor and will be operated exclusively via a plug-and-play USB macro keypad (6 buttons) and a rotary encoder knob.

## Goals / Non-Goals

**Goals:**
- Unify all smart home devices behind `/api/devices` using a single `SmartDeviceDTO` and `DeviceCommandDTO`.
- Keep `_backend/src/services/knx-service.ts` focused on KNXnet/IP UDP multicast communication while `DeviceService` handles capability validation and protocol routing (`knx` vs `led`).
- Build the entire frontend smart-home interface with just one composable (`use-device-osd.ts`) and one global overlay component (`device-osd-overlay.vue`) plus a compact keymap learner in `settings.vue`.
- Match the SmartHub UI design language across both Light (`:root`) and Dark (`[data-theme="dark"]`) modes using `theme.css` tokens, with a compact single-row pill for `TOAST` feedback and an expanded widget card for interactive rotary knob modes.
- Guarantee immediate 60fps visual feedback on rotary knob turns while throttling HTTP command dispatches (~150ms) to protect the KNX bus queue.

**Non-Goals:**
- Touch-centric dashboard cards or per-device Vue components.
- Hardware firmware programming (the USB keypad acts as a standard USB HID keyboard/media controller).

## Decisions

### 1. Capability-Driven Single DTO (`SmartDeviceDTO` & `DeviceCommandDTO`)
- **Decision**: Expose `capabilities: Array<'switch' | 'brightness' | 'rgb' | 'blind_move' | 'blind_angle'>` and a unified `state` object on every device returned by `GET /api/devices` and `GET /api/devices/events`. Accept a single `DeviceCommandDTO` on `POST /api/devices/:id`.
- **Rationale**: Eliminates protocol-specific endpoints and lets the frontend render any device (or future device category) strictly by inspecting `capabilities` and `state`.
- **Alternatives considered**: Keeping `/api/knx/*` and normalizing in the frontend composable. Rejected because adding non-KNX devices (like `room-leds`) would force the frontend to know which backend endpoint owns each device.

### 2. Protocol Dispatcher in `device-service.ts`
- **Decision**: Create `DeviceService` wrapping `globalKnxService` and an in-memory/extensible `LedService` adapter for `room-leds`.
  - For KNX blinds receiving `{ slatAngle: number }`, `DeviceService` compares the target `slatAngle` (`0..100`) against the current `state.slatAngle`, triggers `globalKnxService.controlBlind(id, delta >= 0 ? 'stepDown' : 'stepUp')`, and updates `state.slatAngle` while listening for `posSlatGA` status telegrams from the bus.
- **Rationale**: KNX blind actuators in `KZ West` (`0/1/15`, `0/1/20`, `0/1/36`) use DPT `1.007` step pulses to tilt slats and report status on `posSlatGA` (`0/1/71`, `0/1/65`). Translating `slatAngle` inside `DeviceService` keeps the frontend contract clean (`0..100%` angle).

### 3. Global 6-Button + Rotary Knob State Machine (`use-device-osd.ts`)
- **Decision**: Listen to `window.addEventListener('keydown')` (ignoring events when `INPUT`/`TEXTAREA` is focused or when learning a key in Settings). Maintain reactive OSD state:
  - `mode`: `'IDLE' | 'TOAST' | 'ALL_RGB' | 'ALL_BRIGHTNESS' | 'DEVICE_RGB' | 'DEVICE_BRIGHTNESS' | 'BLIND_ANGLE'`
  - **6 Hardware Buttons + Knob (`CW` / `CCW`)**:
    - `btn1_main_light`: Single press toggles `ceiling-light` on/off (`TOAST`).
    - `btn2_light_mode`: Group config for all room lights. Cycles `ALL_RGB` (all devices with `'rgb'` capability) -> `ALL_BRIGHTNESS` (all devices with `'brightness'` capability) -> `IDLE`.
    - `btn3_room_leds` & `btn4_desk_light`:
      - Single press (resolved after a ~280ms double-press detection window, or when not in that device's config mode): toggles the light on/off and displays `TOAST`. If the light was switched **ON**, turning the knob while `TOAST` is active enters `DEVICE_RGB` (if the device supports `'rgb'`) or `DEVICE_BRIGHTNESS` (if it only supports `'brightness'`).
      - Double press (two presses within ~280ms): skips the on/off toggle and enters `DEVICE_RGB` (if `'rgb'` supported) or `DEVICE_BRIGHTNESS` directly.
      - Subsequent single press while already in `DEVICE_RGB` for that device advances to `DEVICE_BRIGHTNESS`; pressing again in `DEVICE_BRIGHTNESS` exits (`IDLE`).
    - `btn5_blinds_up` & `btn6_blinds_down`:
      - Single press (after ~280ms double-press window): dispatches `up` or `down` on `blinds-all` and displays `TOAST`. Turning the knob while a blind `TOAST` is active transitions into `BLIND_ANGLE`.
      - Double press (two presses within ~280ms): skips moving the blinds up/down and enters `BLIND_ANGLE` directly.
      - Pressing `btn5` or `btn6` while in `BLIND_ANGLE` exits (`IDLE`).
  - Auto-reset timer (`4000ms`) restarted on every valid keypress/knob turn.
  - Optimistic local state updates on every knob tick (`±5%` brightness/angle or `±10°` hue) for 60fps UI responsiveness, paired with a `150ms` throttled `POST /api/devices/:id` sender (fanning out across matching capability devices in `ALL_RGB` / `ALL_BRIGHTNESS` modes).

### 4. Theme-Aware Option B Overlay Styling (`device-osd-overlay.vue` & `theme.css`)
- **Decision**: Style the OSD overlay and Settings toast using `theme.css` custom properties (`--bg-surface`, `--bg-surface-hover`, `--text-primary`, `--text-primary-strong`, `--text-secondary`, `--text-muted`, `--border-base`, `--border-light`, `--color-primary`, `--bg-primary-light`, `--weather-dest-color`, `--weather-dest-bg`, `--shadow-widget`).
  - When `state.mode === 'TOAST'`, render a compact single-row pill (`border-radius: 999px`) showing the icon badge, device name, and status indicator dot/badge.
  - When `state.mode` is an interactive knob mode (`ALL_RGB`, `ALL_BRIGHTNESS`, `DEVICE_RGB`, `DEVICE_BRIGHTNESS`, `BLIND_ANGLE`), render the full widget-styled card (`border-radius: 16px`, `background: var(--bg-surface)`, `border: 1px solid var(--border-base)`).

## Risks / Trade-offs

- **[Risk] Double-press detection adds a small delay (~280ms) to single-press actions on Buttons 3–6** → **Mitigation**: Keep the double-press window snappy (`260–280ms`), and keep Button 1 (`ceiling-light`, which has no knob config mode) and Button 2 (`ALL_RGB` / `ALL_BRIGHTNESS` cycle) immediate with zero delay.
- **[Risk] Unknown default keycodes from plug-and-play USB keypad** → **Mitigation**: Ship sensible defaults (`Digit1`–`Digit6` / `F13`–`F18` and `ArrowRight`/`ArrowLeft` + `AudioVolumeUp`/`AudioVolumeDown`) and include a 1-click "Press key to bind" mapper in `settings.vue` stored in `localStorage`.
- **[Risk] Rapid rotary knob spinning floods KNX bus** → **Mitigation**: Frontend throttles `POST /api/devices/:id` requests to at most 1 request per 150ms per device, and `KnxService` serializes telegrams through its 50ms command queue.
