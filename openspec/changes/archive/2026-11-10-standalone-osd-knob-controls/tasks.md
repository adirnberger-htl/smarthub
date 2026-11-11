# Tasks

## 1. Composable State & State Transitions

- [x] 1.1 Add `isStandalone` and `standaloneStep` to `OsdState` in `_frontend/smarthub/app/composables/use-device-osd.ts`, initializing them to `false` and `0`. Verify type definitions compile without errors.
- [x] 1.2 Update knob rotation logic in `use-device-osd.ts` to enter standalone mode when turning the knob during `blinds-all`, `desk-light` (when ON), or `room-leds` (when ON) toasts, and ignore knob turn during `ceiling-light` toasts. Verify the transition sets `isStandalone = true`.
- [x] 1.3 Update `knob_press` handler in `use-device-osd.ts` so that standalone single-attribute controls (`blind_angle`, `desk_brightness`) immediately flush and hide the HUD, and standalone `room-leds` toggles between `led_rgb` and `led_brightness` on the first click and closes on the second. Verify click state transitions.

## 2. HUD Visual Template & Eyebrow Updates

- [x] 2.1 Update `_frontend/smarthub/app/components/device-osd-overlay.vue` to hide `.osd-side-rail` whenever `state.isStandalone` is true, allowing the main control to take full width. Verify rail visibility logic.
- [x] 2.2 Update `headerEyebrow` computed property in `device-osd-overlay.vue` to omit `SLOT X OF 4` in standalone mode and present a clean uppercase control label. Verify eyebrow output in both standalone and global cycle modes.

## 3. Build & End-to-End Verification

- [x] 3.1 Run frontend typecheck and production build (`npm run build` in `_frontend/smarthub`) to verify zero build errors or TypeScript regressions.
- [x] 3.2 Test interactive flows (Blinds Up/Down toast -> knob turn enters standalone 3D tilt without rail -> knob click closes immediately; Desk light toast -> knob turn enters standalone brightness -> knob click closes; Room LEDs toast -> knob turn enters standalone LED slot -> knob click toggles slot -> 2nd click closes; idle knob click retains full 4-slot cycle).
