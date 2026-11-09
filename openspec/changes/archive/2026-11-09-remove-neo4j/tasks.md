# Tasks

## 1. Remove Neo4j Backend Code, Dependencies & Scripts

- [x] 1.1 Delete `_backend/src/repo/neo4j-driver.ts` and `_backend/src/repo/bus-repo-neo4j.ts`, and remove `neo4j-driver` from `_backend/package.json` and `_backend/package-lock.json`, verifying the files are absent and `npm ls neo4j-driver` in `_backend` reports empty
- [x] 1.2 Remove the `Driver` import and Neo4j fallback graph loader from `_backend/src/repo/csa-router.ts` (`CSARouter.loadGraph()`) and remove `getNeo4jDriver` / `closeNeo4j` calls from `_backend/src/app.ts`, verifying `CSARouter.loadGraph()` takes no arguments and logs an error leaving `ready = false` when `/data` is absent
- [x] 1.3 Delete the standalone `scripts/` Neo4j GTFS loader directory (`scripts/load-gtfs-neo4j.js`, `scripts/package.json`, `scripts/package-lock.json`, `scripts/node_modules`) and update `README.md` project structure / architecture sections to reflect the removal of Neo4j repos and `scripts/`, verifying `scripts/` no longer exists

## 2. Update Bus Routing Endpoints & Frontend API Types

- [x] 2.1 Update `_backend/src/routers/bus-route.ts` and `_backend/test.http` so `GET /api/bus/test` returns `{ status: globalCSARouter.ready ? 'ok' : 'loading', backend: 'csa-in-memory', timestamp }` without `neo4j` fields and `GET /api/bus/route` returns HTTP `503` (`{ error: 'Transit routing graph not ready' }`) when `globalCSARouter.ready` is `false`, verifying TypeScript compiles cleanly (`npx tsc --noEmit` in `_backend`)
- [x] 2.2 Update `ServiceStatusResponse` in `_frontend/smarthub/app/composables/use-smarthub-api.ts` to remove `neo4j: 'up' | 'down'` and accept `status: 'ok' | 'loading' | 'error'`, verifying no `neo4j` references remain in `_frontend/`

## 3. Clean Up Docker, Environment Config & Documentation

- [x] 3.1 Remove `neo4j` and `neo4j-loader` services, `neo4j_data` and `neo4j_logs` volumes, and `NEO4J_*` environment variables from `docker-compose.yaml`, `.env.example`, and `.env` (if present), and update `docs/topics/docker.md` and `README.md` Docker/config sections, verifying `docker compose config` validates cleanly and no active `neo4j` references remain outside `openspec/`
