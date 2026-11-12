# Design

## Context

In `_frontend/smarthub/app/pages/settings.vue`, each routine displays a `.transport-segment` toggle allowing users to select between "Public Transport" (`bus`) and "Car" (`car`). Currently, users receive no feedback on commute times until Auto-Configure is run or the dashboard widget renders.

The backend provides:
- `GET /api/car/route`: Returns `durationInTrafficSeconds`, `durationSeconds`, and `departureTime` given `lat_a`, `lon_a`, `lat_b`, `lon_b`, and `arrival_time`.
- `GET /api/bus/route`: Returns transit routes with `total_duration_minutes` and `departure_time` given the same coordinates and `arrival_time`.

Routines store `startAddress`, `destination`, `arrivalTime`, and optional cached coordinate objects `startCoords` and `destCoords`.

## Goals / Non-Goals

**Goals:**
- Provide a clean, reactive visual indicator directly below the transport mode segmented button in each routine card.
- Compute and display relative travel times between car and public transit (e.g. "🚗 Car is 15 min faster (20m vs 35m)").
- Reuse cached routine coordinates (`startCoords`, `destCoords`) and debounce route queries when addresses or arrival times change.
- Handle edge cases gracefully: missing addresses, route calculation failures, and nearly identical travel times (≤ 1 min).

**Non-Goals:**
- Do not render route maps or turn-by-turn maneuvers in Settings (conforming to `routine-route-fetching` spec requirement 7).
- Do not force or automatically switch the user's selected `transportMode`; the indicator is strictly informative.
- Do not re-geocode addresses if valid `startCoords` and `destCoords` matching the current address strings already exist.

## Decisions

### 1. Dedicated composable `useRoutineComparison`
- **Decision**: Encapsulate coordinate resolution, parallel route fetching, debouncing, and comparison state in a composable (`_frontend/smarthub/app/composables/use-routine-comparison.ts`) rather than inlining large state machines inside `settings.vue`.
- **Rationale**: Keeps `settings.vue` maintainable and allows direct unit testing of comparison calculations, edge-case handling, and difference formatting.
- **Alternatives considered**: Inlining into `settings.vue` (leads to bloated template logic and difficult testability).

### 2. Parallel route querying with error tolerance
- **Decision**: Use `Promise.allSettled` to query `/api/car/route` and `/api/bus/route` simultaneously.
- **Rationale**: If one mode fails (e.g., no transit route available for a remote rural coordinate), the indicator can still display the available mode's travel duration or a helpful notice rather than failing completely.
- **Alternatives considered**: Sequential requests (doubles latency) or strict `Promise.all` (fails completely if bus route has no connection).

### 3. Comparison threshold & formatting
- **Decision**:
  - Difference $\le 1$ minute: "Similar travel time (~X min)"
  - Car faster by $> 1$ minute: "🚗 Car is X min faster (Ym vs Zm)"
  - Transit faster by $> 1$ minute: "🚌 Public Transport is X min faster (Ym vs Zm)"
- **Rationale**: Avoids claiming one mode is "faster" over negligible 30–60 second rounding differences.

### 4. Debounced reactive trigger
- **Decision**: Watch `[routine.startAddress, routine.destination, routine.arrivalTime]` with a 500ms debounce. If coordinates are missing, resolve them via `geocodePlace`, persist them back onto the routine item (so other features benefit), and then run the comparison query.
- **Rationale**: Avoids API churn while users are configuring or tweaking times.

## Risks / Trade-offs

- **[Risk] Multiple network requests per routine edit** → *Mitigation*: Debounce watcher at 500ms, use stored coordinates whenever addresses match, and abort or ignore superseded requests with request sequence tokens.
- **[Risk] In-memory CSA transit router cold start** → *Mitigation*: Gracefully handle 503 or empty responses; show subtle fallback state ("Transit route unavailable") without breaking settings UI.
- **[Risk] Visual clutter in routine card** → *Mitigation*: Render a compact, subtle badge with muted secondary styling, placed neatly below `.transport-segment`.
