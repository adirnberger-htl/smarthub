# Proposal

## Why

When commuters request transit connections arriving by a target time, standard reverse CSA routing strictly optimizes for the latest departure time. This causes the router to pick slow, uncomfortable multi-bus itineraries that depart minutes later rather than much faster and more comfortable rail/tram options (e.g., choosing an 80-minute 3-bus itinerary over a 55-minute S-Bahn + bus itinerary simply because it leaves 7 minutes later).

## What Changes

- Add arrival-window probing in reverse transit routing: probe candidate connections arriving within an arrival window (up to 45 minutes prior to target arrival time).
- Introduce comfort and speed utility scoring to rank candidate connections:
  - Shorter total travel duration is rewarded.
  - Higher-comfort rail transit (S-Bahn, Regionalbahn, Tram) receives a comfort bonus over local buses.
  - Additional transfers are penalized.
  - Mild penalty for arriving significantly earlier than target time.
- Return the highest-utility (fastest and most comfortable) route as the primary connection while preserving sub-5ms in-memory query performance.

## Capabilities

### New Capabilities
*(None)*

### Modified Capabilities
- `transit-routing`: Add requirement for comfort and speed optimized reverse transit routing over candidate arrival windows.

## Impact

- Backend: `_backend/src/repo/csa-router.ts` and `_backend/src/routers/bus-route.ts`.
- Performance: Retains in-memory query latencies under 5 ms (benchmark: ~3.5 ms vs 0.8 ms baseline).
- API: Response schema remains identical; clients (`BusWidget.vue`, `settings.vue`) automatically receive faster and more comfortable itineraries.
