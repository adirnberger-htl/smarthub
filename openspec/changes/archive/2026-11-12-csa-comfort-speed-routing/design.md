# Design

## Context

`CSARouter` (`_backend/src/repo/csa-router.ts`) implements an in-memory Connection Scan Algorithm. While `findRoute` searches forward for the earliest arrival, `findReverseRoute` searches backward for the latest departure arriving by a target time.

Because reverse CSA only optimizes $\max(\text{departure\_time})$, it terminates scanning as soon as connections arrive earlier than the best known origin departure (`arrTime < bestTotalTime`). As a consequence, it selects slow multi-bus routes if they depart even a few minutes later, ignoring significantly faster rail and tram connections that arrive slightly earlier within the arrival window.

## Goals / Non-Goals

**Goals:**
- Enable `findReverseRoute` to evaluate alternative connections arriving within an arrival window (up to 45 minutes before target arrival time).
- Rank candidate routes using a multi-criteria utility score reflecting duration, transit mode comfort (rail/tram bonus), and transfer count.
- Deliver the optimal route at index 0 of the returned array, with distinct viable alternatives in subsequent positions.
- Maintain query execution latencies under 5 milliseconds on the full 900k-connection GTFS graph.

**Non-Goals:**
- Full multi-label Pareto profile array rewrite (which would sacrifice the current zero-allocation TypedArray cache performance).
- Altering the public response JSON structure of `/api/bus/route` or frontend widget contracts.

## Decisions

### 1. Iterative Window Probing vs Multi-Label Pareto
- **Decision**: Execute up to 4 iterative reverse scans bounded by a 45-minute arrival lookback window ($T - 45\text{m}$). Each subsequent probe targets 1 minute prior to the previous candidate's arrival time.
- **Rationale**: A single reverse scan executes in ~0.8 ms. Running 3–4 probes takes ~3.5 ms, retaining high throughput (270+ ops/sec) while reusing the existing ultra-compact TypedArray buffers without increasing memory footprint.
- **Alternatives considered**: True multi-label CSA (keeping Pareto lists per stop). This would discard compact TypedArray memory layouts, increase memory usage 5–10x, and introduce garbage collection pauses.

### 2. Multi-Criteria Utility Scoring Function
- **Decision**: Rank candidates by composite cost:
  $$\text{Score} = \text{Duration}_{\text{min}} + (\text{Transfers} \times 8) - (\text{Rail/Tram Bonus}: 12) + (\text{Early Arrival Gap}_{\text{min}} \times 0.3)$$
- **Rationale**:
  - Duration is the primary metric: faster trips are preferred.
  - Rail bonus (-12m equivalent) reflects commuter preference for trains (S-Bahn, Regionalbahn) and trams over city/regional buses (smoother ride, workspaces, punctuality).
  - Transfer penalty (+8m equivalent) discourages fragmented connections.
  - Minor early arrival penalty (+0.3m per min) prevents choosing an inconveniently early connection unless it provides substantial travel time savings.

### 3. Alternative Candidates in API Response
- **Decision**: Return the ranked routes sorted from best to worst, deduplicating itineraries with identical departure and arrival times.
- **Rationale**: Consumers like `BusWidget` use `routes[0]` for primary display, while future UI expansions can display the 2nd/3rd alternatives.

## Risks / Trade-offs

- **[Risk] Extra scans on unreachable queries** → *Mitigation*: If probe 1 returns no route, abort further probes immediately.
- **[Risk] Benchmark performance degradation** → *Mitigation*: Cap probes at 4 iterations max; maintain benchmark assertions in `route-perf.bench.ts`.
