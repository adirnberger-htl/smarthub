# Proposal

## Why

SmartHub's transit router currently hardcodes loading only two specific GTFS datasets (`LINZ_AG_GTFS_2026` and `OOEVV_GTFS_2026`), completely ignoring rail datasets such as `OEBB-gtfs.zip` residing in `/data`. This causes regional commutes (such as Perg to Linz or Enns to Linz) to yield impractical multi-hour routes with excessive transfer layovers because national rail connections (ÖBB S-Bahn, REX) are missing from the routing graph. Furthermore, an experimental "Preview" button added to routine cards injects an unstyled, redundant route preview box onto the dashboard rather than relying on the dashboard's native `BusWidget` and `CarWidget`.

## What Changes

- **Automatic GTFS Zip Ingestion**: In `csa-router.ts`, dynamically scan the GTFS data directory for all `.zip` archives and dataset directories (including `OEBB-gtfs.zip`), automatically extract unextracted or updated archives, handle nested archive folders (e.g., `GTFS_Fahrplan_2026/`), assign deterministic agency prefixes, and include all valid feeds in the in-memory graph.
- **Composite Cache Invalidation**: Update the binary/JSON disk cache mechanism (`csa-graph-cache.bin` and `.meta.json`) to track composite mtimes across all discovered datasets, rebuilding the combined routing graph whenever any dataset changes or a new zip archive is introduced, while preserving warm startup load times (< 500ms) and query benchmark budgets.
- **Remove Route Preview Feature**: Remove the "Preview" button from routine cards in `settings.vue`, remove the `preview` / `setPreview` / `clearPreview` state in `use-settings.ts`, and remove the `<div v-if="preview" class="route-preview">` overlay from `dashboard.vue`.

## Capabilities

### New Capabilities
*(None)*

### Modified Capabilities
- `transit-routing`: Extend GTFS graph loading requirements to mandate automatic discovery and extraction of all GTFS `.zip` archives in `/data` (including nested subdirectories), composite cache validation, and inclusion of all discovered feeds in connection scanning without exceeding performance budgets.
- `routine-route-fetching`: Update routine configuration and dashboard specifications to eliminate the manual route preview button and dashboard preview overlay, ensuring route display is exclusively driven by active dashboard commute widgets.

## Impact

- `_backend/src/repo/csa-router.ts`: Graph discovery, zip extraction, dataset resolution, and binary disk cache invalidation.
- `_backend/tests/route-perf.bench.ts`: Verified against the expanded multi-agency graph (Linz AG + OÖVV + ÖBB) to ensure latency budgets continue passing.
- `_frontend/smarthub/app/pages/settings.vue`: Removed `<button class="preview-route-btn">` and `previewRoute()` handler.
- `_frontend/smarthub/app/pages/dashboard.vue`: Removed route-preview template markup and styling.
- `_frontend/smarthub/app/composables/use-settings.ts`: Removed preview state management.
