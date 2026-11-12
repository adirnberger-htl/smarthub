# Design: Driving Route Service and Car Widget

## Context

SmartHub runs as a morning dashboard on a Raspberry Pi / nightstand LCD screen. Commuters rely on real-time transit and driving information to time their departure. Currently, public transit commutes are powered by an in-memory CSA engine (`csa-router.ts`) and displayed via `BusWidget.vue`. When users configure a routine with `transportMode === 'car'`, `CarWidget.vue` displays a static mock, `autoConfigure` in `settings.vue` is disabled, and no driving route backend exists.

The backend already integrates Google Maps APIs for geocoding and autocomplete via `process.env.GOOGLE_KEY` in `places-repo.ts`. We leverage this existing API setup for automotive directions while ensuring zero-downtime resiliency via open fallback routing.

## Goals / Non-Goals

**Goals:**
- Implement backend driving route calculation service (`car-router.ts`) and REST endpoint (`/api/car/route`) supporting forward (departure) and reverse (arrival) time scheduling.
- Provide real-time traffic duration, traffic delay classification (`normal`, `moderate`, `heavy`), distance, and route summaries via Google Directions API.
- Provide automatic fallback to OSRM (Open Source Routing Machine) when `GOOGLE_KEY` is absent, invalid, or quota-limited.
- Implement an in-memory/TTL cache (5 minutes, ~100m coordinate quantization) to protect API quotas.
- Redesign `CarWidget.vue` into a complete, theme-aware dashboard widget with hero commute metrics, live traffic badge, departure callouts, route summary, and skeleton loader.
- Enable and implement `autoConfigure` for car-mode routines in `settings.vue`.
- Report car routing provider health in `/api/dev/status` and the developer diagnostic overlay.

**Non-Goals:**
- In-car turn-by-turn navigation with audio prompts or GPS device tracking.
- Vehicle telemetry integration (OBD-II, EV battery SoC, tire pressure).
- Replacing or modifying the public transit CSA engine.

## Decisions

### 1. Hybrid Routing Engine (Google Directions Primary, OSRM Fallback)
- **Decision**: Query Google Directions API (`https://maps.googleapis.com/maps/api/directions/json`) using `process.env.GOOGLE_KEY` when configured. If `GOOGLE_KEY` is unset or returns `OVER_QUERY_LIMIT` / `REQUEST_DENIED`, fallback automatically to public OSRM (`https://router.project-osrm.org/route/v1/driving/...`).
- **Rationale**: Google Directions provides real-time `duration_in_traffic`, road summaries (e.g. `via A7`), and maneuver steps for Austrian and European roads. OSRM provides free, keyless driving distance and base duration, ensuring SmartHub functions cleanly out of the box in development or when unconfigured.
- **Alternatives Considered**:
  - *OSRM only*: Free, but lacks live traffic conditions and congestion delays crucial for morning commutes.
  - *Google only*: Fails completely if the user hasn't added a credit-card-backed Google API key.

### 2. Quantized In-Memory Commute Route Cache
- **Decision**: Cache driving calculations in an in-memory LRU/map keyed by `[latA.toFixed(3), lonA.toFixed(3), latB.toFixed(3), lonB.toFixed(3), roundedTimeWindow]` with a 5-minute TTL.
- **Rationale**: Three decimal places of latitude/longitude equals roughly 110 meters. Quantizing coordinates ensures that slight UI variations or minor pin drags reuse cached routes, and a 5-minute TTL allows the dashboard to run continuously all morning without burning through Google API quotas.

### 3. Unified Car Route DTO Contract
- **Decision**: Standardize backend and frontend on a clean TypeScript interface:
  ```ts
  export interface CarRouteStep {
    instruction: string;
    distanceMeters: number;
    durationSeconds: number;
  }

  export interface CarRouteResponse {
    departureTime: string; // HH:MM:SS
    arrivalTime: string;   // HH:MM:SS
    durationSeconds: number;
    durationInTrafficSeconds: number;
    distanceMeters: number;
    trafficCondition: 'normal' | 'moderate' | 'heavy';
    trafficDelayMinutes: number;
    summary: string;       // e.g. "A7 and B139"
    steps: CarRouteStep[];
    provider: 'google' | 'osrm';
    timestamp: string;
  }
  ```

### 4. Car-Mode Routine Auto-Configuration
- **Decision**: Update `autoConfigure(item)` in `settings.vue`:
  - When `item.transportMode === 'car'`:
    1. Geocode `item.startAddress` and `item.destination` if coordinates are not already cached.
    2. Query `/api/car/route` with `arrival_time: item.arrivalTime`.
    3. Compute required departure time: `arrivalTime - durationInTraffic`.
    4. Set `item.startTime` to `departureTime` minus a 15-minute preparation buffer so the dashboard surfaces the car commute widget before departure.
    5. Set `item.endTime` to `arrivalTime`.
    6. Automatically create or update linked routine alarms (e.g. 30 minutes before departure for wake-up, 10 minutes before departure for leaving).

### 5. `CarWidget.vue` UI Architecture
- **Decision**: Restyle `CarWidget.vue` using SmartHub's theme tokens (`theme.css`):
  - **Header**: Title with car icon + start address to destination address subheader.
  - **Hero Commute Section**:
    - Large departure time callout: `Leave by 08:06` (or countdown `Leave in 14 min`).
    - Travel time pill with live traffic badge: `24 min` with a badge styled `--color-primary` (normal), amber (moderate delay), or `--color-error` (heavy congestion).
    - Total driving distance (e.g. `18.2 km`).
  - **Route Summary Section**:
    - Primary road summary badge (e.g. `via A7 Mühlkreis Autobahn`).
    - Expandable/scrollable list of major driving segments or highway steps.
  - **Summary Bar**: Three-column metrics matching `BusWidget` styling (`Travel Time`, `Distance`, `Arrival Time`).
  - **Loading & Error States**: Theme-aware pulse skeleton loader matching `BusWidget`'s skeleton structure; clear error messaging for missing start or destination address.
  - **Reactivity & Polling**: Watch `[routine.startAddress, routine.destination, routine.arrivalTime]` for immediate refetch, plus a 5-minute background timer while the routine is active.

### 6. Dev Status Integration
- **Decision**: Export `getCarRoutingStatus()` from `_backend/src/repo/car-router.ts` and include it in `/api/dev/status` under `apis.carRouting`:
  ```ts
  {
    provider: 'Google Directions' | 'OSRM',
    keyConfigured: boolean,
    cachedEntries: number,
    lastSuccess: string | null,
    lastError: string | null,
    status: 'ok' | 'degraded' | 'error'
  }
  ```
  Render a corresponding row in the top-right HUD of `dev-status-overlay.vue`.

## Risks / Trade-offs

- **[Google API rate limiting or quota exceeded]** → Mitigated by 5-minute memory cache and automatic graceful fallback to public OSRM.
- **[Traffic delay variations during morning commute]** → Mitigated by 5-minute periodic background polling in `CarWidget.vue` while visible on the dashboard, alongside a "last updated" indicator.
- **[Missing start or destination address]** → Display clear actionable empty states: if start address is missing, prompt "Please configure start address in settings"; if destination is missing, prompt "Please configure destination address in settings".
