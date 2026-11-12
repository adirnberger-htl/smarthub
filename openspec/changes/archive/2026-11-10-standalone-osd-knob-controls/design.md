# Design

## Context

See `proposal.md` for motivation and `specs/hardware-osd-ui/spec.md` for modified requirements.
Currently, the OSD transitions to knob configuration via `enterSlotByIndex(slotIdx)`. This always sets `activeSlotIndex` within the 4-slot `slotOrder` array, displaying the 4-segment vertical progress rail (`osd-side-rail`) and numbered eyebrow (`SLOT X OF 4`), with `knob_press` unconditionally cycling sequentially through the global slot list.

## Goals / Non-Goals

**Goals:**
- Provide a clean, isolated OSD experience when turning the knob during a device toast notification.
- Completely hide the 4-segment vertical progress rail in standalone mode and allow the active component (e.g., 3D blind viewport, brightness slider) to occupy the full card width.
- Tailor `knob_press` actions to the context: immediate exit for single-attribute devices (`blinds-all`, `desk-light`), two-step toggle (`RGB` <-> `Brightness` -> `Close`) for `room-leds`.
- Preserve the existing global 4-slot cycle when entering configuration from idle via knob click or idle knob turn.

**Non-Goals:**
- Modifying the Settings page slot reordering UI (reordering still defines the global 4-slot cycle sequence).
- Adding dimming controls for `ceiling-light` (KNX actuator hardware is binary on/off switch only).

## Decisions

### Decision 1: Explicit `isStandalone` Session Flag in OSD State
- **Rationale**: Adding `isStandalone: boolean` and `standaloneStep: number` to `OsdState` cleanly distinguishes between global cycling and toast-initiated contextual adjustments.
- **Alternatives considered**:
  - *Inferring standalone state from activeDeviceId*: Fragile when cycling through slots that happen to match the last operated device.
  - *Separate mode enum values (e.g., `STANDALONE_BLIND_ANGLE`)*: Causes unnecessary duplication of template rendering blocks in `device-osd-overlay.vue`.

### Decision 2: Standalone Transition and Knob Press State Machine
- **Rationale**:
  - `blinds-all` -> sets `mode = 'blind_angle'`, `isStandalone = true`. `knob_press` calls `hideOsdImmediately()`.
  - `desk-light` -> sets `mode = 'desk_brightness'`, `isStandalone = true`. `knob_press` calls `hideOsdImmediately()`.
  - `room-leds` -> sets `mode = firstLedSlot` (based on `slotOrder`), `isStandalone = true`, `standaloneStep = 0`. First `knob_press` switches to the counterpart LED slot (`led_rgb` <-> `led_brightness`) and sets `standaloneStep = 1`. Next `knob_press` calls `hideOsdImmediately()`.
  - `ceiling-light` -> turns knob while toast is visible: ignored (toast auto-hide timer continues untouched).
- **Alternatives considered**:
  - *Closing on first click for LEDs*: Deprives users of adjusting both color and brightness without having to enter the global cycle.

### Decision 3: Reactive Header Eyebrow & Full-Width Card Styling
- **Rationale**:
  - When `isStandalone === true`, header eyebrow renders `${KNOB_SLOT_METADATA[state.mode].label.toUpperCase()}` without `SLOT X OF 4`.
  - In `device-osd-overlay.vue`, the `.osd-side-rail` is rendered only when `!state.isStandalone && state.mode !== 'TOAST'`. When hidden, the flex container allows the main content to take the natural full card width seamlessly without extra CSS overrides.

## Risks / Trade-offs

- [Risk] User accidentally enters standalone mode when they intended to enter global cycle mode while a toast was still lingering.
  - → Mitigation: The auto-hide timer will naturally close the standalone HUD, or a single knob click (`knob_press`) immediately dismisses it, allowing the user to click again from idle to enter global cycle mode.
