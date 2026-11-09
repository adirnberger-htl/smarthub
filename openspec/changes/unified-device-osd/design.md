# Design

## Context

See `proposal.md` for motivation. Currently, `_backend/src/routers/knx.ts` exposes KNX-specific endpoints (`/api/knx/devices`, `/api/knx/lights/:id`, `/api/knx/blinds/:id`, `/api/knx/events`) and leaks raw KNX group addresses (`switchGA`, `dimGA`, `posSlatGA`). The frontend is displayed on a non-touch wall monitor and will be operated exclusively via a plug-and-play USB macro keypad (7 buttons) and a rotary encoder knob.

## Goals / Non-Goals

**Goals:**
- Unify all smart home devices behind `/api/devices` using a single `SmartDeviceDTO` and `DeviceCommandDTO`.
- Keep `_backend/src/services/knx-service.ts` focused on KNXnet/IP UDP multicast communication while `DeviceService` handles capability validation and protocol routing (`knx` vs `led`).
- Build the entire frontend smart-home interface with just one composable (`use-device-osd.ts`) and one global overlay component (`device-osd-overlay.vue`) plus a compact keymap learner in `settings.vue`.
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

### 3. Global USB HID State Machine + Throttled Knob Dispatch (`use-device-osd.ts`)
- **Decision**: Listen to `window.addEventListener('keydown')` (ignoring events when `INPUT`/`TEXTAREA` is focused or when learning a key in Settings). Maintain reactive OSD state:
  - `mode`: `'IDLE' | 'TOAST' | 'LED_COLOR' | 'LED_BRIGHTNESS' | 'DESK_BRIGHTNESS' | 'BLIND_ANGLE'`
  - Auto-reset timer (`4000ms`) restarted on every valid keypress/knob turn.
  - Optimistic local state updates on every knob tick (`±5%` brightness/angle or `±10°` hue) for 60fps UI responsiveness, paired with a `150ms` throttled `POST /api/devices/:id` sender.

## Risks / Trade-offs

- **[Risk] Unknown default keycodes from plug-and-play USB keypad** → **Mitigation**: Ship sensible defaults (`Digit1`–`Digit7` / `F13`–`F19` and `ArrowRight`/`ArrowLeft` + `AudioVolumeUp`/`AudioVolumeDown`) and include a 1-click "Press key to bind" mapper in `settings.vue` stored in user settings / `localStorage`.
- **[Risk] Rapid rotary knob spinning floods KNX bus** → **Mitigation**: Frontend throttles `POST /api/devices/:id` requests to at most 1 request per 150ms, and `KnxService` already serializes telegrams through its 50ms command queue.
