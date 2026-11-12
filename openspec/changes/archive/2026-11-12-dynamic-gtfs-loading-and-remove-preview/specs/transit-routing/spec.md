# Spec Delta

## MODIFIED Requirements

### Requirement: Direct GTFS and disk-cache graph loading
The transit routing engine SHALL dynamically discover all GTFS dataset directories and `.zip` archives directly from the local GTFS data directory (`/data` or configured `GTFS_DATA_DIR`). If a discovered `.zip` archive has not been extracted or has a newer modification time than its corresponding extracted folder, the engine SHALL automatically extract it, automatically resolve any single nested container subdirectory containing GTFS files (such as `GTFS_Fahrplan_2026/`), assign a deterministic agency prefix, and build the unified in-memory routing graph from all discovered GTFS feeds without any external database dependency. The engine SHALL persist and load a serialized binary/JSON disk cache (`csa-graph-cache.bin` and `csa-graph-cache.meta.json`) validated against the composite modification timestamps and composition of all discovered datasets.

#### Scenario: Startup loads from local GTFS data and writes/reads cache
- **WHEN** the backend starts and GTFS dataset directories or zip archives (including dynamically discovered feeds like `LINZ_AG_GTFS_2026`, `OOEVV_GTFS_2026`, and `OEBB-gtfs.zip`) exist under `/data`
- **THEN** `CSARouter` initializes its in-memory routing graph from all discovered GTFS files (or prebuilt binary cache file validated against composite dataset modification timestamps), marks `ready = true`, and reloads in under 500 milliseconds on warm start

#### Scenario: Startup fails gracefully when local GTFS data is absent
- **WHEN** the backend starts and no GTFS dataset directories, zip archives, or cache files exist under `/data`
- **THEN** `CSARouter` logs an error and leaves `ready = false` without attempting any external database connection
