# Design

## Context

See `proposal.md` for background. The frontend OSD HUD is managed by `use-device-osd.ts` and rendered by `device-osd-overlay.vue`, while the 3D blind simulation is housed in `blind-3d-viewport.vue`.

## Goals / Non-Goals

**Goals:**
- Hide the 4-step vertical progress rail when the OSD is in `TOAST` mode, giving simple button presses a clean single-card layout.
- Dismiss active toasts immediately to idle upon `knob_press`, requiring an idle state before starting the knob slot sequence.
- Eliminate blinding whiteout glare in `blind-3d-viewport.vue` by removing additive blending sheets, lowering direct/bounce intensity ceilings, and setting slats to a matte PBR material.
- Connect interior room walls, window reveal, and window sill seamlessly into an enclosed architectural corner with no floating meshes or light leaks.

**Non-Goals:**
- Changing the 4-slot configuration order or keybindings logic in `settings.vue`.
- Modifying backend KNX weather ingestion or device command endpoints.

## Decisions

### 1. Side Rail Conditional Rendering
- **Decision**: In `device-osd-overlay.vue`, add `v-if="state.mode !== 'TOAST'"` to `.osd-side-rail`. In `TOAST` mode, the HUD shell switches to a single-column layout without placeholder ghost bars.
- **Alternatives considered**: Keeping the ghost rail with reduced opacity (rejected: user explicitly requested no grey rail on the right during toasts).

### 2. Knob Press Handling on Active Toast
- **Decision**: In `use-device-osd.ts` inside `handleKeyDown`, check if `state.value.visible && state.value.mode === 'TOAST'`. If true, call `hideOsdImmediately()` and return early. The user can then immediately press the knob again to start cycling from Slot 0.
- **Alternatives considered**:
  - Ignoring knob press while toast is active (sluggish feel, ignores hardware input).
  - Transitioning immediately into Slot 0 on knob press (what was previously happening, which surprised the user when they wanted to clear the toast).

### 3. Glare Shading Fix
- **Decision**: Remove the 4 additive blending plane meshes (`sunBeamMeshes`) completely. Update slat material to `MeshStandardMaterial` with `roughness: 0.65` and `metalness: 0.08`. Cap `sunLight.intensity` to `~1.6` max and `roomBounceLight.intensity` to `~0.55` max. Set tone mapping exposure to `1.0`.
- **Alternatives considered**:
  - Keeping additive blending with tiny opacity (still creates unnatural white haze across slats when viewed at angles).

### 4. Seamless Room & Window Geometry
- **Decision**:
  - Align the left interior wall at `x = -1.28` (spanning `z = 0.1` to `z = 3.5`), matching the outer edge of the left window jamb and reveal.
  - Construct a front interior room wall mesh enclosing the window reveal (`x > 1.2`, `y > 0.95`, `y < -0.92`), creating a 90° corner with the left wall.
  - Extend the window sill (`sillMesh`) between the jambs and forward into the room (`z` from `-0.15` to `+0.35`) so it sits flush on top of the front wall's lower apron.
- **Alternatives considered**:
  - Using a single sky dome and no room walls (loses sense of interior light transmission and shadow bounce).

## Risks / Trade-offs

- *HUD layout shift when transitioning from toast to knob cycle*: Handled cleanly by Vue transition animations on `.osd-side-rail` and flex layout in `.osd-hud__shell`.
- *Shadow acne on matte slats*: Ensured by keeping `bias: -0.0005` on `sunLight.shadow`.
