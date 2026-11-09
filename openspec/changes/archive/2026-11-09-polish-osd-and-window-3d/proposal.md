# Proposal

## Why

After initial deployment of the hardware-driven OSD HUD and 3D blind simulation, two visual and ergonomic friction points were identified:
1. Normal hardware button presses (light toggles, blind movements, scene memory) display a ghosted grey vertical rail on the right side of the HUD, cluttering what should be a clean, compact toast notification. Additionally, pressing the knob during an active toast jumped unexpectedly into the slot cycle rather than dismissing the active element.
2. The Three.js 3D window viewport suffers from harsh additive glare sheets across the slats and has geometric gaps where the interior walls disconnect from the window frame and sill.

## What Changes

- **OSD Side Rail Visibility**: Completely hide the vertical 4-step progress rail in `TOAST` mode (`v-if="state.mode !== 'TOAST'"`). The rail only renders when actively cycling knob configuration slots.
- **Knob Press Dismissal on Active Toast**: When the user presses the knob (`knob_press`) while a `TOAST` notification is active on screen, dismiss the toast immediately to idle (hide immediately). The knob slot cycle will only open when the knob is pressed from an idle state.
- **3D Window Glare Elimination**: Remove `THREE.AdditiveBlending` glare sheets between slats; tune directional sunlight and room bounce light ceilings; increase slat material roughness (`0.32 -> 0.65`) and lower metalness (`0.38 -> 0.08`) for a natural matte finish.
- **3D Window & Wall Seamless Connection**: Add front room wall geometry encasing the window reveal, join the left side wall seamlessly at a 90° corner, and cleanly integrate the window sill and jambs to prevent floating geometry and light leaks.

## Capabilities

### Modified Capabilities
- `hardware-osd-ui`: Update HUD toast rendering to completely omit the side rail, update `knob_press` behavior while in `TOAST` mode to dismiss immediately to idle, and refine 3D blind viewport geometry and lighting shaders to eliminate glare and geometric gaps.

## Impact

- Frontend components: `_frontend/smarthub/app/components/device-osd-overlay.vue`, `_frontend/smarthub/app/composables/use-device-osd.ts`, and `_frontend/smarthub/app/components/blind-3d-viewport.vue`.
- Backend/APIs: No API or backend changes required.
