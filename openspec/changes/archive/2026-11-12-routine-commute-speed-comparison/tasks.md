# Tasks

## 1. Comparison Logic Composable & Unit Tests

- [x] 1.1 Implement `_frontend/smarthub/app/composables/use-routine-comparison.ts` to manage commute comparison state, debounced watcher, coordinate reuse, parallel requests to `/api/car/route` and `/api/bus/route`, and duration delta calculations. Verify file exists and exports composable function.
- [x] 1.2 Add unit tests in `_frontend/smarthub/tests/routine-comparison.test.ts` validating scenarios: car faster, transit faster, similar durations (≤ 1 min), missing coordinates, and partial route error tolerance. Verify tests pass via test runner.

## 2. UI Indicator in Routine Settings

- [x] 2.1 Integrate the commute comparison indicator component/markup directly beneath `.transport-segment` in `_frontend/smarthub/app/pages/settings.vue` for each routine card, binding to comparison state. Verify the indicator renders with appropriate icons and labels.
- [x] 2.2 Add CSS styles for `.commute-comparison-indicator` and status states (faster pill, time breakdown, loading spinner, theme variables) in `settings.vue`. Verify styles adapt across light and dark theme classes.

## 3. Integration & Verification

- [x] 3.1 Run frontend lint/typechecks and verify that editing routine addresses or arrival time dynamically updates the indicator without errors or unnecessary geocoding calls.
