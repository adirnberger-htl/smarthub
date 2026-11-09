# Proposal

## Why

The transit routing engine (`CSARouter`) now loads GTFS schedules directly from local `/data` files and caches a compiled binary graph snapshot (`csa-graph-cache.bin`) in memory, making the legacy Neo4j graph database, its loader script, and the `neo4j-driver` dependency redundant dead weight across the codebase, Docker stack, and documentation. Removing Neo4j completely eliminates unnecessary startup driver initialization, container/volume definitions, dependencies, and configuration complexity.

## What Changes

- **BREAKING**: Remove the Neo4j fallback graph loader from `CSARouter.loadGraph()` and the legacy Cypher route finder (`_backend/src/repo/bus-repo-neo4j.ts`) and driver (`_backend/src/repo/neo4j-driver.ts`).
- **BREAKING**: Update `GET /api/bus/route` to return `503 Service Unavailable` (`{ error: "Transit routing graph not ready" }`) when `globalCSARouter.ready` is `false`, rather than falling back to Neo4j Cypher queries.
- **BREAKING**: Update `GET /api/bus/test` and the frontend `ServiceStatusResponse` type to report CSA in-memory router readiness without a `neo4j` status field.
- Remove the `neo4j-driver` dependency from `_backend/package.json` and delete the standalone `scripts/` GTFS-to-Neo4j import directory (`scripts/load-gtfs-neo4j.js`, `scripts/package.json`, `scripts/package-lock.json`).
- Remove `neo4j` and `neo4j-loader` services, `neo4j_data` and `neo4j_logs` volumes, and `NEO4J_*` environment variables from `docker-compose.yaml` and `.env.example`.
- Update `README.md`, `docs/topics/docker.md`, and `_backend/test.http` to remove all Neo4j badges, architecture nodes, environment variables, and setup instructions.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `transit-routing`: Remove the Neo4j fallback requirement from graph loading and require `GET /api/bus/route` to return HTTP `503 Service Unavailable` when the in-memory CSA routing graph is not ready.

## Impact

- **Backend Code**: `_backend/src/app.ts`, `_backend/src/routers/bus-route.ts`, `_backend/src/repo/csa-router.ts`, deleted `_backend/src/repo/bus-repo-neo4j.ts`, deleted `_backend/src/repo/neo4j-driver.ts`, `_backend/package.json`, `_backend/test.http`.
- **Frontend Code**: `_frontend/smarthub/app/composables/use-smarthub-api.ts` (`ServiceStatusResponse`).
- **Scripts & Infrastructure**: Deleted `scripts/` directory, `docker-compose.yaml`, `.env.example`.
- **Documentation**: `README.md`, `docs/topics/docker.md`.
