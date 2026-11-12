# Tasks

## 1. Debounced Rotary Command Dispatching

- [x] 1.1 Implement `dispatchKnobCommandDebounced` (700ms trailing-edge debounce) and `flushPendingKnobCommands` in `_frontend/smarthub/app/composables/use-device-osd.ts`, and wire into `applySlotKnobTurn` across all 4 slots (`blind_angle`, `desk_brightness`, `led_rgb`, `led_brightness`) while preserving 0ms local visual state updates.
- [x] 1.2 Hook `flushPendingKnobCommands` into `knob_press`, `enterSlotByIndex`, and OSD hide handlers in `use-device-osd.ts` so in-flight adjustments dispatch immediately upon slot transitions or overlay dismissal.

## 2. Verification and Build Validation

- [x] 2.1 Run frontend type checking (`npx nuxi typecheck` or build script in `_frontend/smarthub`) to verify clean compilation with no type errors or broken imports.
- [x] 2.2 Verify rotary input dispatch semantics by validating that consecutive detents reset the 700ms timer and emit exactly one HTTP command upon settle or flush.
