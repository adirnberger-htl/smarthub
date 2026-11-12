# Design

## Context

See `proposal.md` for problem motivation and background.
Currently, `_frontend/smarthub/app/composables/use-device-osd.ts` uses `dispatchCommandThrottled` with `throttleMs = 150` for rotary knob interactions. This triggers an immediate HTTP `POST /api/devices/:id` command on the first detent, periodic requests every 150ms while turning, and another trailing request upon micro-stops. On KNX blind devices, every request generates a step pulse (`stepStopGA` on `0/1/36`), resulting in loud relay clicking and rapid motor stepping during smooth continuous knob turns.

## Goals / Non-Goals

**Goals:**
- Provide a responsive 700ms trailing-edge debounce for all 4 rotary knob slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`).
- Maintain 0ms visual latency for the 3D blind tilt, brightness sliders, and RGB color display while the knob is turning.
- Guarantee that pending debounced commands are flushed immediately (`0ms`) without data loss when the user clicks the knob, advances slot, or closes the HUD.
- Keep direct button presses (Buttons 1–6) instant and unthrottled (`0ms`).

**Non-Goals:**
- Modifying backend KNX service step logic or group addresses.
- Modifying physical HID button press latencies (buttons remain 0ms instant).

## Decisions

### 1. Dedicated Trailing Debounce Manager with Explicit Flush
- **Decision**: Introduce `dispatchKnobCommandDebounced(id, cmd, debounceMs = 700)` alongside a synchronous `flushPendingKnobCommands()` helper in `use-device-osd.ts`.
- **Rationale**: Trailing debounce ensures zero network traffic and zero KNX relay clicks while the user is actively dialing in a setting. Merging consecutive commands (`{ ...entry.pendingCmd, ...cmd }`) preserves the latest accumulated parameter value.
- **Alternatives Considered**:
  - *Keep throttling but increase interval to 1000ms*: Still triggers an immediate network call on the very first detent before the user has dialed in their target angle.
  - *Debounce only blinds, keep lights throttled*: Inconsistent architecture. Lights do not suffer mechanical wear, but sending intermediate brightness/RGB updates while turning a knob is unnecessary and floods the server. Applying 700ms debounce across all 4 slots unifies knob behavior.

### 2. Settle Timeout Duration (700ms)
- **Decision**: Use a fixed 700ms debounce timeout.
- **Rationale**: 700ms aligns with the OSD HUD idle settle timer (`idleWaitMs = 650ms`) before the visual countdown bar begins. It gives the user ample time between rotary detent clicks without feeling sluggish once they let go of the knob.
- **Alternatives Considered**:
  - *300ms*: Too short; users frequently pause for 300–400ms between detents, causing multiple split requests.
  - *1500ms*: Excessively long; feels unresponsive after intentionally stopping at the target angle.

### 3. Immediate Flush Triggers
- **Decision**: Trigger `flushPendingKnobCommands()` synchronously in:
  - `knob_press` event handler (before cycling to the next slot or dismissing toast/HUD).
  - `enterSlotByIndex` (when jumping slots).
  - `hideOsdImmediately` and auto-hide timer expiry.
- **Rationale**: If the user dials in an angle and immediately clicks the knob to advance to the next slot or close the HUD, waiting 700ms could cause race conditions with subsequent slot actions. Flushing immediately guarantees the hardware state matches the UI state.

## Risks / Trade-offs

- **[Risk] User closes browser tab immediately after turning knob**:
  - *Mitigation*: 700ms is brief. Normal exit via knob click or HUD timeout explicitly flushes pending commands.
- **[Risk] Out-of-order SSE responses overwriting optimistic UI**:
  - *Mitigation*: Local state is updated optimistically at 0ms. When the single debounced command completes, `applySingleDeviceState` syncs the confirmed backend state.
