# Proposal

## Why

In the Settings page routine accordion list, expanding a routine card does not update the visual rotation state of the chevron arrow in the card header. The chevron indicator remains pointing right due to FontAwesome JS replacing the DOM element outside Vue's reactive VDOM patch and the lack of proper display styling for CSS transforms. Replacing the icon with a native inline SVG and styling it via the parent `.routine-card--expanded` state ensures instantaneous, smooth, and robust rotation without third-party script conflicts.

## What Changes

- Replace the FontAwesome `fa-chevron-right` `<i>` tag in the routine card accordion header with a native, inline SVG chevron.
- Update CSS for `.accordion-chevron` to use `display: block`, flex-shrink prevention, and GPU-accelerated CSS transition.
- Bind the 90-degree clockwise rotation to `.routine-card--expanded .accordion-chevron` so expansion visually toggles the chevron state from pointing right to pointing down.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `routine-route-fetching`: Clarify structured accordion routine list presentation requirement so the accordion expansion toggle chevron visually reflects the open/closed state.

## Impact

- Affected frontend file: `_frontend/smarthub/app/pages/settings.vue`.
- Eliminates FontAwesome JS DOM replacement race conditions and detached VNode issues for accordion chevrons.
- Zero breaking changes to routine data models, API endpoints, or storage.
