# Tasks

## 1. Commute Comparison Engine Fixes

- [x] 1.1 Update `resolveRoutineCoordinates` and `executeComparison` in `_frontend/smarthub/app/composables/use-routine-comparison.ts` to detect coordinate differences and gate `onRoutineUpdated` so it only executes when coordinates were newly geocoded and actually changed.
- [x] 1.2 Refactor the watcher in `_frontend/smarthub/app/composables/use-routine-comparison.ts` to watch only routing parameter signatures (`id`, `startAddress`, `destination`, `arrivalTime`), isolate per-routine debounce timers so sibling routines are not cancelled, and introduce in-memory duration caching by route coordinates and arrival time.
- [x] 1.3 Add automated unit tests to `_frontend/smarthub/tests/routine-comparison.test.ts` covering multi-routine parallel debounce execution, prevention of redundant `onRoutineUpdated` callback emissions, and non-routing mutation immunity. Verify with `npm test --prefix _frontend/smarthub`.

## 2. Structured Accordion Layout & Routine Styling

- [x] 2.1 Implement `expandedRoutineId` reactive state in `_frontend/smarthub/app/pages/settings.vue` with toggle logic, initial expansion of the first routine, auto-expansion on new routine creation, and safe fallback on routine deletion.
- [x] 2.2 Restructure routine rendering in `_frontend/smarthub/app/pages/settings.vue` into an accordion with a compact summary header (chevron toggle, routine name, transport badge, active days badges, target arrival time, commute speed comparison pill, delete button) and a collapsible configuration body.
- [x] 2.3 Add a routine name input field within the routine editing form in `_frontend/smarthub/app/pages/settings.vue` to allow naming and renaming routines, and update CSS styles for accordion headers, active states, and theme compatibility (dark/light).
- [x] 2.4 Verify all unit tests and component interactions using `npm test --prefix _frontend/smarthub`.
