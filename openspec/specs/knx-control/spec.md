# knx-control Specification

## Purpose

Provides backend integration with the home KNX bus over KNXnet/IP Multicast (`224.0.23.12:3671`, physical address `1.2.6`), enabling authenticated clients to query, control, and receive real-time state updates for lights, switched outlets, and window blinds in `KZ West` (`KZ rechts` / `KZ Arthur`).

## Requirements

### Requirement: KNX Multicast Bus Connection and Lifecycle
The system SHALL connect to the KNX bus via KNXnet/IP Routing (UDP Multicast `224.0.23.12:3671`) using individual physical address `1.2.6` when `KNX_ENABLED=true`, and SHALL cleanly disconnect on process shutdown. When `KNX_ENABLED=false`, the system SHALL run in mock/dry-run mode without failing startup.

#### Scenario: Startup connection and initial status read
- **WHEN** the backend server starts with `KNX_ENABLED=true`
- **THEN** it joins the configured KNX multicast group as `1.2.6` and issues throttled status read requests for configured `KZ West` status group addresses

#### Scenario: Dry-run mode when KNX is disabled
- **WHEN** the backend server starts with `KNX_ENABLED=false`
- **THEN** the server starts normally and updates in-memory device state on API commands without sending UDP multicast packets

### Requirement: KZ West Device Inventory and State Query
The system SHALL expose an authenticated `GET /api/knx/devices` endpoint returning all configured `KZ West` lights, outlets, and window blinds along with their group addresses and latest cached state.

#### Scenario: Fetch KZ West devices while authenticated
- **WHEN** an authenticated client sends `GET /api/knx/devices`
- **THEN** the system returns HTTP 200 with the list of `KZ West` devices (`ceiling-light`, `desk-light`, `outlet`, `blind-west`, `blind-south`, `blinds-all`) and their current cached state values

#### Scenario: Reject unauthenticated device query
- **WHEN** an unauthenticated client sends `GET /api/knx/devices`
- **THEN** the system returns HTTP 401

### Requirement: Light and Outlet Control (`KZ West`)
The system SHALL allow authenticated clients to switch lights/outlets on or off (DPT `1.001`) and set absolute brightness (DPT `5.001`, `0` to `100`%) for dimmable lights via `POST /api/knx/lights/:id`.

#### Scenario: Switch ceiling light or outlet on/off
- **WHEN** an authenticated client sends `POST /api/knx/lights/ceiling-light` with `{ "on": true }`
- **THEN** the system sends a 1-bit `GroupValue_Write` (`1`) to the device's switch group address (`0/0/29` / `0/0/203`) and returns HTTP 200 with updated device state

#### Scenario: Dim desk light
- **WHEN** an authenticated client sends `POST /api/knx/lights/desk-light` with `{ "brightness": 75 }`
- **THEN** the system sends a 1-byte `GroupValue_Write` (`75`%, DPT `5.001`) to `0/0/96` (and switches `0/0/95` on if needed) and returns HTTP 200

#### Scenario: Invalid light ID or payload
- **WHEN** an authenticated client sends `POST /api/knx/lights/unknown` or `{ "brightness": 150 }`
- **THEN** the system returns HTTP 404 for unknown device ID or HTTP 400 for out-of-range brightness

### Requirement: Window Blind Control (`KZ West`)
The system SHALL allow authenticated clients to control individual (`blind-west`, `blind-south`) and combined (`blinds-all`) window blinds in `KZ West` via `POST /api/knx/blinds/:id` supporting actions `up`, `down`, `stop`, `stepUp`, and `stepDown`.

#### Scenario: Move blind up or down
- **WHEN** an authenticated client sends `POST /api/knx/blinds/blind-west` with `{ "action": "up" }` or `{ "action": "down" }`
- **THEN** the system sends a 1-bit `GroupValue_Write` (`0` for `up`, `1` for `down`, DPT `1.008`) to `0/1/14` and returns HTTP 200

#### Scenario: Stop or step blind slats
- **WHEN** an authenticated client sends `POST /api/knx/blinds/blind-west` with `{ "action": "stop" }`, `{ "action": "stepUp" }`, or `{ "action": "stepDown" }`
- **THEN** the system sends a 1-bit `GroupValue_Write` (`0` for `stepUp`/`stop`, `1` for `stepDown`, DPT `1.007`) to `0/1/15` and returns HTTP 200

### Requirement: Real-Time Bus State Synchronization via SSE
The system SHALL listen for incoming KNX `GroupValue_Write` and `GroupValue_Response` telegrams for all `KZ West` group addresses, update the in-memory state cache, and broadcast state updates to authenticated clients connected to `GET /api/knx/events`.

#### Scenario: Physical wall switch updates connected UI
- **WHEN** a physical wall switch or actuator transmits a `GroupValue_Write` on `0/0/55` (`KZ recht Decke Status`) or `0/1/70` (`Jal KZ rechts,west Höhenpos. Status`)
- **THEN** the backend updates the cached device state and pushes an SSE `knx-state` event with the updated device payload to all connected `GET /api/knx/events` clients
