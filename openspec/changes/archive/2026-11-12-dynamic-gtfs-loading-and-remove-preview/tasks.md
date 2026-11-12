# Tasks

## 1. Remove Route Preview Feature

- [x] 1.1 Remove `<button class="preview-route-btn">`, `previewRoute(item)` handler, and associated CSS from `_frontend/smarthub/app/pages/settings.vue`. Verify in template that routine cards only display Auto-Configure and timing controls.
- [x] 1.2 Remove `preview`, `setPreview`, and `clearPreview` state and exports from `_frontend/smarthub/app/composables/use-settings.ts`. Verify TypeScript compilation succeeds without missing export errors.
- [x] 1.3 Remove the `<div v-if="preview" class="route-preview">` markup and `.route-preview` CSS rules from `_frontend/smarthub/app/pages/dashboard.vue`. Verify the Dashboard page renders without any preview overlay card.

## 2. Dynamic GTFS Ingestion & Caching in CSA Router

- [x] 2.1 Refactor dataset resolution in `_backend/src/repo/csa-router.ts` to dynamically scan `dataDir` for all `.zip` archives and dataset folders, automatically extract missing or updated archives, and resolve inner container directories (such as `GTFS_Fahrplan_2026/` inside `OEBB-gtfs.zip`). Verify logging lists all discovered feeds (`LINZ_AG_GTFS_2026`, `OOEVV_GTFS_2026`, `OEBB_GTFS_2026`).
- [x] 2.2 Implement dynamic agency prefix derivation (e.g., `OEBB_`, `LINZ_`, `OOEVV_`) so stop, trip, and route IDs from all feeds remain unique without hardcoded arrays. Verify stop and trip counters in graph initialization reflect all loaded datasets.
- [x] 2.3 Implement composite cache validation in `_backend/src/repo/csa-router.ts` using dataset list fingerprints and composite modification times (`sourceMtimeMs`). Verify that adding or changing archives invalidates the cache, rebuilds the binary graph, and subsequent boots reload from `csa-graph-cache.bin` in under 500ms.

## 3. Verification & Benchmark Proof

- [x] 3.1 Execute `npm test` in `_backend` to run `tests/route-perf.bench.ts`, `tests/car-router.test.ts`, and `tests/dev-status.test.ts`. Verify all 17+ tests pass and all latency budgets (P50, P95, throughput) are satisfied.
- [x] 3.2 Query route calculation for the Perg to HTL Leonding commute (arrival 08:00) against the running or test router. Verify it selects direct rail connections (S3 / REX) to Linz Hbf rather than the 05:30 AM shift bus with 65-minute layovers.
