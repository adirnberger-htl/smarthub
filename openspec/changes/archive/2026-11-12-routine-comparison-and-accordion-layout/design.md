# Design

## Context

See [proposal.md](proposal.md) for problem context.
Currently, `useRoutineComparison` observes the entire routines array with `{ deep: true }`. When `executeComparison` finishes resolving coordinates, it calls `options.onRoutineUpdated(routine)` unconditionally. In `settings.vue`, this invokes `updateRoutineItem(routine)` which assigns `state.value.routines[idx] = { ...updated }` and invokes `debouncedSaveRoutine`. This triggers the deep watcher again, cancelling pending timers of other routines and firing repeated network requests (`PUT /api/routines/:id`, `GET /api/car/route`, `GET /api/bus/route`).
Simultaneously, `settings.vue` renders all routines in an unbounded vertical scroll of ~450px forms without titles or header summaries.

## Goals / Non-Goals

**Goals:**
- Eliminate the infinite reactivity loop and network flooding by strictly gating routine persistence to actual coordinate modifications.
- Watch only routing-critical attributes (`id`, `startAddress`, `destination`, `arrivalTime`), ignoring non-routing mutations (`name`, `alarms`, `activeDays`, `startTime`, `endTime`, `transportMode`).
- Isolate per-routine comparison debounce timers so multiple routines evaluate concurrently without mutual cancellation or starvation.
- Cache comparison route results by coordinate pair and arrival time to avoid repeated queries.
- Structure routine settings into an accordion layout with compact, informative headers (name, mode, active days, arrival time, comparison indicator, chevron) and single-expanded editing body.

**Non-Goals:**
- Modifying backend routing algorithms (CSA or OSRM) or changing backend API contracts.
- Altering the dashboard widget presentation (`CarWidget`, `BusWidget`).

## Decisions

### Decision 1: Granular Watcher & Coordinate Delta Guard
- **Choice**:
  1. In `resolveRoutineCoordinates`, track whether `geocoder` was called and produced new coordinates differing from previous coordinates. Return `{ start, dest, updated: boolean }`.
  2. In `executeComparison`, only invoke `options?.onRoutineUpdated` when `updated === true`.
  3. In `useRoutineComparison`, replace `{ deep: true }` watching with a computed key projection:
     ```ts
     const routingSignature = computed(() =>
       (routines.value || []).map(r => `${r.id}:${r.startAddress || ''}:${r.destination || ''}:${r.arrivalTime || ''}`).join('|')
     )
     ```
  4. Compare individual routine signatures on trigger to only schedule routines whose routing fields actually changed.
- **Alternatives Considered**:
  - *Deep watch with lodash/deep-equal comparison*: Inefficient, still triggers on array reference reassignment.
  - *Remove onRoutineUpdated completely*: Would fail to persist geocoded coordinates to the routine's config in the backend database.

### Decision 2: Per-Routine Timer Isolation & Route Duration Cache
- **Choice**:
  - Keep `debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()`.
  - When scheduling, only clear and replace the timer for the *specific routine ID* being updated. Never touch sibling routine timers.
  - Introduce an in-memory cache keyed by `${start.lat},${start.lon}->${dest.lat},${dest.lon}@${arrivalTime}` storing `{ carMinutes, transitMinutes }`. If cached and not expired, apply calculation immediately without network fetch.
- **Alternatives Considered**:
  - *Global sequential queue*: Slower and adds complexity; independent parallel debounce is natural and responsive for small routine counts (typically 1-5).

### Decision 3: Accordion Layout with Rich Header
- **Choice**:
  - Manage `expandedRoutineId = ref<string | null>(null)`. Initialize to first routine's ID once routines are loaded.
  - When header is clicked, toggle expansion: `expandedRoutineId.value = expandedRoutineId.value === item.id ? null : item.id`.
  - Header is styled as a compact interactive bar (~52px height) containing:
    - Expand/collapse chevron icon.
    - Routine name (with fallback "Routine 1", "Routine 2").
    - Mode badge (`<i class="fa-solid fa-bus"></i>` or `<i class="fa-solid fa-car"></i>`).
    - Active days badge summary (`Mo-Fr`, `Weekend`, or pill badges).
    - Arrival time badge (`Arr: 08:00`).
    - Commute speed comparison pill (`Car is 15 min faster` / `Public Transport is 8 min faster` / etc.).
    - Delete button (`@click.stop` to prevent accordion toggle).
  - Body contains full inputs plus a Routine Name input field at the top.
- **Alternatives Considered**:
  - *Tabs / Segmented control*: Fits fewer items and requires horizontal overflow handling; accordion scales gracefully to any number of routines and preserves whole-week overview in collapsed headers.

## Risks / Trade-offs

- **[Risk] Accordion state lost on routine add/delete** → Mitigation: When adding a new routine, automatically set `expandedRoutineId` to the newly created routine ID. When deleting the currently expanded routine, default `expandedRoutineId` to the first remaining routine.
- **[Risk] Cache returning stale traffic durations** → Mitigation: In routine settings, commute comparison is a static planning estimate. A TTL of 5 minutes or clearing cache on manual auto-configure avoids stale data while eliminating keystroke flooding.
