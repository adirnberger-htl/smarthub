# Design

## Context

See `proposal.md` for motivation. In `_frontend/smarthub/app/pages/settings.vue`, routine cards in the accordion layout toggle expansion via `expandedRoutineId`. The parent card receives `.routine-card--expanded` when active. The expansion arrow previously used an `<i>` tag styled with FontAwesome classes (`fa-solid fa-chevron-right`). Because Nuxt loads the FontAwesome Kit in JS mode (`method: "js"`), FontAwesome replaces the `<i>` with an `<svg>` at runtime, detaching the element from Vue 3's reactive VDOM node reference and breaking reactive class updates.

## Goals / Non-Goals

**Goals:**
- Replace the fragile FontAwesome `<i>` accordion chevron with a native inline SVG.
- Ensure the arrow rotates smoothly by 90 degrees clockwise when the routine card is expanded, pointing down.
- Maintain identical visual appearance, sizing, and theme compliance (`currentColor` / `var(--text-muted)`).
- Provide optimal rendering performance with zero third-party DOM mutation overhead.

**Non-Goals:**
- Removing or reconfiguring global FontAwesome script loaders across other widgets.
- Changing routine card body layout, field bindings, or API persistence logic.

## Decisions

### Decision: Inline SVG with polyline over FontAwesome wrapper
- **Chosen**: Inline `<svg>` element with `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, and a clean `<polyline points="9 18 15 12 9 6"></polyline>`.
- **Rationale**:
  - Eliminates DOM interception and mutation observer cycles from FontAwesome JS.
  - Vue VDOM maintains full, uninterrupted ownership of the DOM node.
  - Exactly 1 lightweight DOM element instead of wrapper + detached icon.
- **Alternatives considered**:
  - *Wrap FontAwesome in `<span>`*: Prevents detachment of the wrapper, but retains FA JS mutation overhead and extra DOM depth.
  - *Iconify or Nuxt Icon*: Adds unnecessary build dependency for a single standard chevron.

### Decision: Parent-driven CSS rotation
- **Chosen**: `.routine-card--expanded .accordion-chevron { transform: rotate(90deg); }`.
- **Rationale**:
  - The parent element `<div class="routine-card" :class="{ 'routine-card--expanded': ... }">` already tracks expansion state.
  - Cascading the rotation rule from `.routine-card--expanded` is declarative and avoids redundant dynamic class bindings in the template.
- **Alternatives considered**:
  - *Dynamic `:class` on SVG*: Functionally equivalent, but adds template noise.

## Risks / Trade-offs

- **Icon alignment**: Inline SVGs default to `vertical-align: baseline` or `middle` unless specified.
  - *Mitigation*: Set `display: block` and `flex-shrink: 0` on `.accordion-chevron` within the existing flex container (`.accordion-header__title-group`) to ensure exact centering and crisp rendering.
