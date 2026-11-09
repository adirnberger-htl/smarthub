# knx-control Specification Delta

## MODIFIED Requirements

### Requirement: KZ West Device Inventory and State Query
The system SHALL expose an authenticated `GET /api/devices` endpoint returning all configured `KZ West` smart devices (`ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, `blinds-all`) serialized as protocol-agnostic `SmartDeviceDTO` objects (`id`, `name`, `room`, `category`, `capabilities`, `state`) without exposing internal KNX group addresses.

#### Scenario: Fetch KZ West devices while authenticated
- **WHEN** an authenticated client sends `GET /api/devices`
- **THEN** the system returns HTTP 200 with `{ devices: SmartDeviceDTO[] }` containing `ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, and `blinds-all`, each with its declared `capabilities` array and latest cached `state`

#### Scenario: Reject unauthenticated device query
- **WHEN** an unauthenticated client sends `GET /api/devices`
- **THEN** the system returns HTTP 401

### Requirement: Light and Outlet Control (`KZ West`)
The system SHALL allow authenticated clients to control lights and outlets via `POST /api/devices/:id` accepting a unified `DeviceCommandDTO` (`{ on?: boolean, brightness?: number, rgb?: string }`), validating requested fields against the target device's `capabilities` and routing execution to the underlying protocol service (KNX DPT `1.001` / `5.001` or LED controller).

#### Scenario: Switch ceiling light or outlet on/off
- **WHEN** an authenticated client sends `POST /api/devices/ceiling-light` with `{ "on": true }`
- **THEN** the system sends a 1-bit `GroupValue_Write` (`1`) to the device's KNX switch group address (`0/0/29`) and returns HTTP 200 with the updated `SmartDeviceDTO`

#### Scenario: Dim desk light
- **WHEN** an authenticated client sends `POST /api/devices/desk-light` with `{ "brightness": 75 }`
- **THEN** the system sends a 1-byte `GroupValue_Write` (`75`%, DPT `5.001`) to `0/0/96` (and switches `0/0/95` on if needed) and returns HTTP 200 with the updated `SmartDeviceDTO`

#### Scenario: Configure RGB color and brightness on room LEDs
- **WHEN** an authenticated client sends `POST /api/devices/room-leds` with `{ "rgb": "#00ff66", "brightness": 80 }`
- **THEN** the system updates the LED device state (`on: true`, `rgb: "#00ff66"`, `brightness: 80`), dispatches to the LED adapter, and returns HTTP 200 with the updated `SmartDeviceDTO`

#### Scenario: Invalid light ID or payload
- **WHEN** an authenticated client sends `POST /api/devices/unknown` or sends `{ "rgb": "#ff0000" }` to `ceiling-light` (which lacks `'rgb'` capability) or `{ "brightness": 150 }`
- **THEN** the system returns HTTP 404 for an unknown device ID or HTTP 400 for an unsupported capability or out-of-range value

### Requirement: Window Blind Control (`KZ West`)
The system SHALL allow authenticated clients to control individual (`blind-west`, `blind-south`) and combined (`blinds-all`) window blinds in `KZ West` via `POST /api/devices/:id` accepting `DeviceCommandDTO` with `blindAction` (`up`, `down`, `stop`, `stepUp`, `stepDown`) or `slatAngle` (`0` to `100`).

#### Scenario: Move blind up or down
- **WHEN** an authenticated client sends `POST /api/devices/blinds-all` with `{ "blindAction": "up" }` or `{ "blindAction": "down" }`
- **THEN** the system sends a 1-bit `GroupValue_Write` (`0` for `up`, `1` for `down`, DPT `1.008`) to the device's move group address and returns HTTP 200 with the updated `SmartDeviceDTO`

#### Scenario: Stop or step blind slats
- **WHEN** an authenticated client sends `POST /api/devices/blinds-all` with `{ "blindAction": "stop" }`, `{ "blindAction": "stepUp" }`, `{ "blindAction": "stepDown" }`, or `{ "slatAngle": 60 }`
- **THEN** the system updates `state.slatAngle` (when `slatAngle` is provided), sends the corresponding 1-bit telegram (`0` for `stepUp`/`stop`, `1` for `stepDown`, DPT `1.007`) to the step/stop group address (`0/1/36`), and returns HTTP 200 with the updated `SmartDeviceDTO`

### Requirement: Real-Time Bus State Synchronization via SSE
The system SHALL listen for incoming KNX `GroupValue_Write` and `GroupValue_Response` telegrams as well as internal device updates, update the state cache, and broadcast normalized `SmartDeviceDTO` updates to authenticated clients connected to `GET /api/devices/events`.

#### Scenario: Physical wall switch updates connected UI
- **WHEN** a physical wall switch or actuator transmits a `GroupValue_Write` on `0/0/55` (`KZ recht Decke Status`) or `0/1/71` (`Jal KZ rechts,west Lamellenpos. Status`)
- **THEN** the backend updates the cached device state and pushes an SSE `device-state` event with the updated `SmartDeviceDTO` payload to all connected `GET /api/devices/events` clients
