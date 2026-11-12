# Proposal

## Why

The commute mode speed comparison indicator in Routine Settings is currently trapped in an infinite reactivity feedback loop: resolving coordinates unconditionally triggers a routine update, which causes state mutations, re-triggers the deep routines watcher, cancels pending debounce timers for sibling routines, and fires endless backend requests (`PUT /api/routines/:id`, `GET /api/car/route`, `GET /api/bus/route`). As a result, the comparison indicator constantly flickers on the first routine while all subsequent routines are starved and never display their comparisons. In addition, the routine settings UI renders routines as an endless vertical scroll of full ~450px forms without titles or compact summaries, making routine navigation cluttered and cumbersome.

## What Changes

- **Fix Commute Comparison Reactivity Loop**:
  - Restructure `useRoutineComparison` to only fire `onRoutineUpdated` when coordinates were newly geocoded and differ from previously stored coordinates.
  - Replace the deep reactive watcher with a granular watcher targeting only routing-critical fields (`id`, `startAddress`, `destination`, `arrivalTime`), ignoring non-routing mutations (`name`, `alarms`, `activeDays`, `startTime`, `endTime`, `transportMode`).
  - Isolate per-routine debounce timers so a mutation or execution on one routine never clears or cancels comparison requests for sibling routines.
  - Implement duration result caching by route coordinate and arrival time key to prevent redundant network fetches.
- **Structured Accordion Layout for Routines**:
  - Replace the flat vertical stack of full routine cards with an accordion layout.
  - Render a compact card header for each routine displaying its name, transport mode icon/badge, active days summary, target arrival time, the commute mode comparison badge, an expand/collapse toggle, and a delete button.
  - Collapse non-active routines into compact ~52px summary bars, expanding a single routine's full configuration form when selected.
  - Allow editing the routine name in the header/body.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `routine-route-fetching`: Update the commute mode speed comparison indicator requirements to mandate loop-safe coordinate persistence, per-routine timer isolation, and non-starving multi-routine execution. Add requirements for structured accordion presentation and header comparison visibility in Routine Settings.

## Impact
- **Frontend**:
  - `_frontend/smarthub/app/composables/use-routine-comparison.ts`: Granular watcher, coordinate delta guard, isolated per-routine timers, comparison result caching.
  - `_frontend/smarthub/app/pages/settings.vue`: Accordion layout structure, collapsed header badges, `expandedRoutineId` state management, routine name editing.
  - `_frontend/smarthub/tests/routine-comparison.test.ts`: Added tests verifying multi-routine concurrent debounce handling and absence of reactivity re-trigger loops.
- **Backend**:
  - Eliminates redundant `/api/car/route`, `/api/bus/route`, and `PUT /api/routines/:id` request flooding.
- **APIs**:
  - No breaking schema or endpoint changes.
