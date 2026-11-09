# Tasks

## 1. Dependencies & Infrastructure Configuration

- [x] 1.1 Add `knxultimate` dependency to `_backend/package.json` and verify `npm install` succeeds in `_backend`
- [x] 1.2 Add `KNX_ENABLED`, `KNX_MULTICAST_IP`, `KNX_PORT`, `KNX_PHYS_ADDR`, and `KNX_INTERFACE` to `.env.example` and update `docker-compose.yaml` (`network_mode: host` and `NEO4J_HOST: localhost` on `backend`), verifying `docker compose config` validates cleanly

## 2. `KZ West` Device Registry & State Store

- [x] 2.1 Create `_backend/src/repo/knx-repo.ts` defining the 6 `KZ West` logical devices (`ceiling-light`, `desk-light`, `outlet`, `blind-west`, `blind-south`, `blinds-all`), group address lookup map, and in-memory state store, and verify with a unit/smoke check that all `KZ West` group addresses (`0/0/29`, `0/0/30`, `0/0/55`, `0/0/56`, `0/0/95`, `0/0/96`, `0/0/203`, `0/0/206`, `0/1/14`, `0/1/15`, `0/1/20`, `0/1/21`, `0/1/28`, `0/1/36`, `0/1/64`, `0/1/65`, `0/1/70`, `0/1/71`) resolve to their logical devices

## 3. KNX Multicast Bus Service

- [x] 3.1 Create `_backend/src/services/knx-service.ts` implementing the `KNXUltimate` Multicast client (`224.0.23.12:3671`, `physAddr: 1.2.6`), rate-limited command queue, startup status reader, incoming telegram handler, SSE `EventEmitter`, and `KNX_ENABLED=false` mock mode, and verify startup and mock writes work without errors

## 4. Express REST & SSE Endpoints

- [x] 4.1 Create `_backend/src/routers/knx.ts` with `requireAuth`-protected `GET /api/knx/devices`, `POST /api/knx/lights/:id`, `POST /api/knx/blinds/:id`, and `GET /api/knx/events` (SSE), mount it in `_backend/src/app.ts` with `SIGINT` cleanup, and verify endpoint responses and SSE event delivery in `_backend/test.http`
