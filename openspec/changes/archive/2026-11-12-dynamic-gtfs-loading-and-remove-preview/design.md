# Design

## Context

SmartHub's transit router (`_backend/src/repo/csa-router.ts`) currently loads datasets from a hardcoded array (`LINZ_AG_GTFS_2026`, `OOEVV_GTFS_2026`). In `/data`, `OEBB-gtfs.zip` contains national and regional ÖBB train services, but is ignored. Furthermore, the dataset files inside `OEBB-gtfs.zip` are structured within an inner directory (`GTFS_Fahrplan_2026/`) rather than the archive root. 

In the frontend, an experimental routine preview was added across `settings.vue`, `use-settings.ts`, and `dashboard.vue`, which duplicates existing widget behavior and clutters the UI.

See `proposal.md` for detailed motivation and `specs/` for behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Automatically discover every `.zip` archive and GTFS directory in `dataDir`.
- Automatically extract unextracted or modified `.zip` archives, un-nesting inner directory trees (such as `GTFS_Fahrplan_2026/`) to locate `stops.txt`.
- Derive clean agency prefixes (e.g., `OEBB_`, `LINZ_`, `OOEVV_`) dynamically from archive/directory names.
- Update composite disk cache metadata (`csa-graph-cache.meta.json` and `.bin`) to hash all source dataset names, mtimes, and versions, preserving `< 500ms` warm startup time.
- Verify and pass all routing and latency benchmarks in `tests/route-perf.bench.ts` with the expanded multi-agency graph.
- Completely remove the preview button in `settings.vue`, preview box in `dashboard.vue`, and preview state in `use-settings.ts`.

**Non-Goals:**
- Modifying the underlying Connection Scan Algorithm (CSA) core scanning logic.
- Processing or storing heavy spatial geometry files like `shapes.txt` (CSA router streams only routing tables).
- Changing driving/car route endpoints or `CarWidget` logic.

## Decisions

### 1. Dynamic Dataset Discovery vs. Explicit Config List
- **Decision**: Dynamically scan `dataDir` for all `.zip` archives and directories containing or extracting into valid GTFS files (`stops.txt`, `stop_times.txt`, `routes.txt`, `trips.txt`).
- **Rationale**: Operators or users can drop new GTFS feeds (like ÖBB or municipal feeds) directly into `/data` without editing TypeScript source files.
- **Archive Extraction & Un-nesting**: When extracting `*.zip` to a target directory, inspect if `stops.txt` is in the target directory root. If nested inside a single subdirectory (e.g. `targetDir/GTFS_Fahrplan_2026/stops.txt`), set the dataset root to that subdirectory.
- **Prefix Derivation**: Sanitize filename/folder name by stripping `.zip`, non-alphanumeric characters, and appending `_` in uppercase (e.g., `OEBB-gtfs.zip` → `OEBB_`, `LINZ_AG_GTFS_2026` → `LINZ_`).

### 2. Composite Cache Invalidation Strategy
- **Decision**: Store `datasetFingerprint` in `csa-graph-cache.meta.json`, computed as a hash/composite of sorted dataset names and the maximum modification timestamp (`mtimeMs`) of all source `.zip` and extracted `.txt` files.
- **Rationale**: If any zip file is replaced or added, `latestMtime` or the dataset list changes, invalidating the cache and triggering a clean rebuild. Once built, the binary cache (`csa-graph-cache.bin`) loads in ~100ms via direct typed array buffers, easily beating the 500ms warm startup budget.
- **Alternative considered**: Storing individual cache files per dataset. Rejected because CSA requires globally sorted connection arrays across all feeds for multi-agency footpaths and scanning.

### 3. Removal vs. Restriction of Route Preview
- **Decision**: Completely delete the preview button, state, and dashboard overlay instead of hiding it for `bus` mode.
- **Rationale**: Public transport routines already render automatically in `BusWidget`, and driving routines render in `CarWidget`. The dashboard preview card broke layout and had no interactive value.

## Risks / Trade-offs

- **[Risk] Large GTFS feeds slowing down initial cold build** → The ÖBB feed contains ~16MB `stop_times.txt`. The streaming CSV parser (`streamCSV`) processes this in under 5 seconds during cold build. Once built, binary disk cache loads in under 100ms.
- **[Risk] High memory usage in container** → `shapes.txt` is 666MB, but `csa-router.ts` completely skips `shapes.txt`, keeping Node memory footprint well within Docker limits (`NODE_OPTIONS: --max-old-space-size=1024`).
- **[Risk] Latency degradation on benchmark routes** → ÖBB introduces rail connections. Binary search on connections is `O(log N)` (negligible change). Footpath calculation uses bounding-box degree filters (`0.005` deg) and terminates early. Latency tests in `tests/route-perf.bench.ts` will explicitly verify P50 and P95 budgets.
