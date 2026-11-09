# Tasks

## 1. OSD HUD Toast & Knob Interaction Polish

- [x] 1.1 Update `_frontend/smarthub/app/components/device-osd-overlay.vue` so `.osd-side-rail` only renders when `state.mode !== 'TOAST'` and remove obsolete ghost rail styling; verify toasts render as a clean notification without any side rail.
- [x] 1.2 Update `_frontend/smarthub/app/composables/use-device-osd.ts` so `knob_press` while in `TOAST` mode dismisses the OSD immediately to idle; verify knob press clears active toast and next knob press opens Slot 0.

## 2. 3D Window Viewport Glare & Geometry Polish

- [x] 2.1 Remove additive blending sunbeam planes (`sunBeamMeshes`) and configure slat material to matte PBR (`roughness: 0.65`, `metalness: 0.08`) in `_frontend/smarthub/app/components/blind-3d-viewport.vue`; verify glare sheets are eliminated.
- [x] 2.2 Rebalance directional sunlight and bounce light intensity in `updateLighting()`; verify realistic light levels without overexposed highlights across sun elevations.
- [x] 2.3 Construct front room wall casing and align left room wall at 90° corner to encase window reveal and sill in `_frontend/smarthub/app/components/blind-3d-viewport.vue`; verify geometry connects seamlessly without visible voids or light leaks.

## 3. Verification & Build Proof

- [x] 3.1 Run frontend typecheck and build verification; verify zero TypeScript or compilation errors.
