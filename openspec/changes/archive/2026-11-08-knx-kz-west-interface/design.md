# Design

## Context

SmartHub runs a split LAN deployment:
- **Backend + DB Server (`<SERVER_IP>`)**: Hosts the entire Docker Compose stack (`smarthub_frontend` on `:3001`, `smarthub_backend` on `:3000`, `gtfs_neo4j` on `:7687`, and SQLite at `/data/smarthub.sqlite`). Connected to the home LAN where the KNX IP Router broadcasts KNXnet/IP Routing over UDP Multicast (`224.0.23.12:3671`).
- **Raspberry Pi (`<PI_IP>`)**: Lightweight nightstand LCD kiosk running Chromium pointed at `http://<SERVER_IP>:3001` (with `NUXT_PUBLIC_API_BASE_URL=http://<SERVER_IP>:3000` for REST and SSE). No Docker or Node.js processes run on the Raspberry Pi.
- **KNX Installation (`docs/home-knx.esf`)**: Uses 3-level group addresses. Arthur's room is `KZ West` (labeled `KZ rechts`, `Kinderzimmer west`, and `KZ Arthur` in `docs/home-knx.esf`), and SmartHub is assigned individual physical address `1.2.6`.

See `proposal.md` for motivation and high-level scope.

## Goals / Non-Goals

**Goals:**
- Reliable KNXnet/IP Multicast (`224.0.23.12:3671`) communication from the backend server using physical address `1.2.6`.
- Clean logical device abstraction over raw KNX group addresses for `KZ West` lights, outlet, and blinds.
- Sub-100ms local state queries via an in-memory state cache synchronized with live KNX bus telegrams.
- Real-time push updates to the nightstand UI via SSE (`GET /api/knx/events`).
- Safe offline/development execution via `KNX_ENABLED=false` mock mode.

**Non-Goals:**
- Full house-wide KNX visualization (other rooms can be added to the device registry later without architectural changes).
- KNX bus programming (ETS remains the tool for device commissioning).
- USB/TPUART physical bus wiring to the Raspberry Pi.

## Decisions

### 1. Library: `knxultimate` over legacy `knx` or `knxd`
- **Choice**: Use `knxultimate` in Node.js (`_backend/package.json`).
- **Rationale**: Actively maintained TypeScript/JavaScript implementation with native KNXnet/IP Routing (`hostProtocol: "Multicast"`), built-in DPT encoders/decoders (`1.001`, `1.007`, `1.008`, `5.001`, `9.001`), automatic reconnection, and zero native C++ build dependencies on Alpine Linux.
- **Alternatives Considered**:
  - `knx` (npm): Unmaintained for 6+ years, suffers from buffer deprecation warnings and state machine hangs.
  - `knxd` C++ daemon: Unnecessary overhead when the network already uses KNXnet/IP Multicast Routing.

### 2. Docker Networking on Backend Server: `network_mode: host`
- **Choice**: Configure `backend` in `docker-compose.yaml` with `network_mode: host` (and `NEO4J_HOST: localhost`) plus optional `KNX_INTERFACE` binding.
- **Rationale**: Docker bridge networks do not forward IGMP multicast joins or incoming UDP multicast (`224.0.23.12:3671`) from the physical LAN NIC to isolated bridge containers. Host networking gives the Node.js process direct access to the backend server's LAN interface while still reaching `neo4j` via `localhost:7687`.

### 3. Logical Device Mapping for `KZ West` (`_backend/src/repo/knx-repo.ts`)
- **Choice**: Map flat ESF group addresses into 6 logical `KZ West` devices:
  1. `ceiling-light` (`Deckenlicht KZ West`): `switchGA: "0/0/29"`, `altSwitchGA: "0/0/203"`, `statusGA: "0/0/55"`, `altStatusGA: "0/0/206"` (DPT `1.001`)
  2. `desk-light` (`Schreibtischlicht Arthur`): `switchGA: "0/0/95"` (DPT `1.001`), `dimGA: "0/0/96"` (DPT `5.001` `0..100%`)
  3. `outlet` (`Steckdose KZ West`): `switchGA: "0/0/30"`, `statusGA: "0/0/56"` (DPT `1.001`)
  4. `blind-west` (`Jalousie West`): `moveGA: "0/1/14"` (DPT `1.008`), `stepStopGA: "0/1/15"` (DPT `1.007`), `posHeightGA: "0/1/70"`, `posSlatGA: "0/1/71"`
  5. `blind-south` (`Jalousie Süd`): `moveGA: "0/1/21"` (DPT `1.008`), `stepStopGA: "0/1/20"` (DPT `1.007`), `posHeightGA: "0/1/64"`, `posSlatGA: "0/1/65"`
  6. `blinds-all` (`Alle Jalousien KZ West`): `moveGA: "0/1/28"` (DPT `1.008`), `stepStopGA: "0/1/36"` (DPT `1.007`)
- **Rationale**: Decouples the frontend API from multi-GA KNX wiring quirks so UI components interact with semantic devices (`lights/:id`, `blinds/:id`).

### 4. Real-Time Push: Server-Sent Events (SSE) over WebSockets
- **Choice**: Use standard HTTP SSE (`GET /api/knx/events`) for server-to-client KNX state notifications, paired with REST `POST` for commands.
- **Rationale**: Commands are infrequent and benefit from standard Express middleware/validation, while state feedback is unidirectional (server -> client). SSE works natively over Express with existing cookie authentication (`requireAuth`) and automatic browser reconnection without adding a WebSocket server library.

## Risks / Trade-offs

- **Multicast binding to wrong NIC on multi-homed backend server** → Allow setting `KNX_INTERFACE` (interface name or LAN IP of the backend server) and pass it to `knxultimate`'s `localIPAddress` / `interface` option.
- **KNX TP bus flooding on startup or rapid slider dragging** → Space startup `read()` requests by 100ms and debounce/queue outgoing `write()` commands at minimum 50ms intervals in `knx-service.ts`.
- **Ambiguous 2-Byte blind status DPT (`0/1/64..71` marked `Uncertain (2 Byte)` in ESF)** → Support raw 2-byte decoding (DPT `7.001` unsigned / `9.001` float fallback) and expose both raw and normalized percentage values.

## Migration Plan

1. Install `knxultimate` in `_backend`.
2. Add `KNX_*` variables to `.env.example` and `.env`.
3. Deploy updated `docker-compose.yaml` on the backend server (`network_mode: host` on `backend`).
4. Rollback: Set `KNX_ENABLED=false` or revert `docker-compose.yaml` to disable KNX multicast without affecting existing bus/weather/routines endpoints.
