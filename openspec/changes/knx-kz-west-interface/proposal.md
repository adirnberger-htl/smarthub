# Proposal

## Why

SmartHub currently integrates morning routines, transit schedules, weather, and calendar data, but lacks a connection to the existing home KNX installation (`docs/home-knx.esf`). Adding a KNXnet/IP Multicast backend interface allows controlling lights, outlets, and window blinds in Arthur's room (`KZ West` / `KZ rechts`) directly from the SmartHub nightstand panel and keeping UI state synchronized with physical wall switches.

## What Changes

- Add a KNXnet/IP Routing (UDP Multicast `224.0.23.12:3671`) client service (`_backend/src/services/knx-service.ts`) using physical address `1.2.6`.
- Add a logical device registry (`_backend/src/repo/knx-repo.ts`) mapping `KZ West` (`KZ rechts` / `KZ Arthur`) group addresses from `docs/home-knx.esf` for ceiling lights, dimmable desk light, switched outlet, and window blinds (West, South, and combined), along with an in-memory live state cache.
- Add authenticated REST and Server-Sent Events (SSE) endpoints (`_backend/src/routers/knx.ts`) to list devices, toggle/dim lights, move/step/stop blinds, and stream real-time KNX bus state changes to clients.
- Update backend Docker networking and environment configuration (`docker-compose.yaml`, `.env.example`) so the backend server can join the LAN UDP multicast group (`224.0.23.12:3671`).

## Capabilities

### New Capabilities
- `knx-control`: Backend KNXnet/IP Multicast integration, `KZ West` device registry and state caching, REST control endpoints for lights and blinds, and real-time SSE state streaming.

### Modified Capabilities

## Impact

- **Dependencies**: Adds `knxultimate` to `_backend/package.json`.
- **Backend Code**: New `_backend/src/services/knx-service.ts`, `_backend/src/repo/knx-repo.ts`, `_backend/src/routers/knx.ts`, and lifecycle wiring in `_backend/src/app.ts`.
- **Infrastructure**: Updates `docker-compose.yaml` (`backend` service host networking on the backend server for IGMP/UDP multicast) and `.env.example` (`KNX_*` environment variables).
