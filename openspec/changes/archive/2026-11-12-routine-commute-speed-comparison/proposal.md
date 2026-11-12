# Proposal

## Why

When configuring routines in Settings, users choose between Public Transport and Car without knowing which option is faster for their specific route and target arrival time. Presenting an immediate commute duration comparison directly beneath the transport mode toggle allows users to choose the fastest mode without guesswork or manual trial and error.

## What Changes

- Add a commute duration comparison indicator directly below the Public Transport / Car segment selector in each routine card in Settings.
- Calculate and compare driving duration (via `/api/car/route`) and transit duration (via `/api/bus/route`) based on routine start/destination coordinates and arrival time.
- Display a clear relative speed callout (e.g. "🚗 Car is 15 min faster (20m vs 35m)", "🚌 Public Transport is 8 min faster (22m vs 30m)", or "Both take about the same time (~25m)").
- Debounce and cache comparison calculations, reusing stored routine coordinates (`startCoords`, `destCoords`) when available.
- Gracefully handle loading, missing address inputs, and scenarios where transit routes are unavailable.

## Capabilities

### New Capabilities
*(None)*

### Modified Capabilities
- `routine-route-fetching`: Add requirement for commute mode speed comparison indicator in routine configuration settings, specifying automatic comparison calculation, coordinate reuse, and UI display states.

## Impact

- Frontend: `_frontend/smarthub/app/pages/settings.vue` (UI indicator, comparison state management, and route fetching logic).
- APIs: Reuses existing `/api/car/route` and `/api/bus/route` endpoints without changes.
- Performance: Requests are debounced and use cached coordinates to prevent redundant geocoding and network overhead.
