# Design

## Context

See `proposal.md` for motivation. Currently, `_backend/src/app.ts` imports `getNeo4jDriver` and `closeNeo4j` from `_backend/src/repo/neo4j-driver.ts` and passes the driver instance into `globalCSARouter.loadGraph(getNeo4jDriver())`. Although `CSARouter` loads directly from `/data` GTFS archives or `/data/csa-graph-cache.bin`, calling `getNeo4jDriver()` at startup still initializes a `neo4j-driver` instance and retains fallback Cypher queries in `_backend/src/repo/csa-router.ts` and `_backend/src/repo/bus-repo-neo4j.ts`. Additionally, `docker-compose.yaml`, `.env.example`, `scripts/`, `README.md`, and `docs/topics/docker.md` still carry Neo4j containers, loader scripts, environment variables, and documentation.

## Goals / Non-Goals

**Goals:**
- Remove all Neo4j code, dependencies (`neo4j-driver`), scripts (`scripts/`), Docker services/volumes, environment variables, and documentation references.
- Ensure `GET /api/bus/route` returns a deterministic `503 Service Unavailable` (`{ error: "Transit routing graph not ready" }`) when `globalCSARouter.ready` is `false`.
- Simplify `GET /api/bus/test` and frontend `ServiceStatusResponse` to report CSA router readiness without `neo4j` fields.

**Non-Goals:**
- Changing the CSA routing algorithm, binary cache format (`csa-graph-cache.bin`), or GTFS CSV parsing logic.
- Modifying historical archived OpenSpec change records under `openspec/changes/archive/`.

## Decisions

1. **Return HTTP 503 on `/api/bus/route` when `globalCSARouter.ready` is `false`**:
   - **Choice**: If `!globalCSARouter.ready`, immediately return `res.status(503).json({ error: 'Transit routing graph not ready' })` in `_backend/src/routers/bus-route.ts`.
   - **Rationale**: Previously, `!globalCSARouter.ready` triggered `findRoutes()` against Neo4j, which threw an unhandled connection error when Neo4j was not running (resulting in a generic `500 Internal server error`). Returning `503 Service Unavailable` with a clear message distinguishes temporary cold-start initialization or missing `/data` from an unexpected runtime crash or an empty `200 []` route result.
   - **Alternatives considered**: Returning `200 []` (rejected because clients interpret an empty array as "no transit connections found for this query").

2. **Simplify `/api/bus/test` and `ServiceStatusResponse`**:
   - **Choice**: Return `{ status: globalCSARouter.ready ? 'ok' : 'loading', backend: 'csa-in-memory', timestamp: new Date().toISOString() }` from `GET /api/bus/test`, and update `ServiceStatusResponse` in `_frontend/smarthub/app/composables/use-smarthub-api.ts` to `{ status: 'ok' | 'loading' | 'error'; backend: string; timestamp: string }`.
   - **Rationale**: Keeps the health endpoint functional and accurate without attempting any external database ping.

3. **Delete `scripts/` directory**:
   - **Choice**: Delete `scripts/load-gtfs-neo4j.js`, `scripts/package.json`, `scripts/package-lock.json`, and any local `scripts/node_modules`.
   - **Rationale**: `scripts/` only contained the one-shot GTFS-to-Neo4j importer used by the `neo4j-loader` container; GTFS zip extraction and parsing are now handled automatically inside `CSARouter.loadFromGTFSFiles()`.

## Risks / Trade-offs

- **[Risk] Missing `/data` directory in a fresh environment causes routing to stay unavailable** → **Mitigation**: `CSARouter.loadGraph()` logs a clear error when no local GTFS data is found, and `GET /api/bus/route` returns `503` with `"Transit routing graph not ready"`.
- **[Risk] Existing local `.env` files may still contain `NEO4J_*` variables** → **Mitigation**: Extra environment variables in `.env` are harmlessly ignored by Node.js and Docker Compose; `.env.example` and `.env` (if present locally) will be cleaned up.
