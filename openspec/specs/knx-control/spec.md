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
The system SHALL expose an authenticated `GET /api/devices` endpoint returning all configured `KZ West` smart devices (`ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, `blinds-all`) serialized as protocol-agnostic `SmartDeviceDTO` objects (`id`, `name`, `room`, `category`, `capabilities`, `state`) alongside the current normalized KNX weather station `environment` telemetry (`sunElevation`, `sunAzimuth`, `luxWest`, `luxSouth`, `luxMax`, `outdoorTemp`, `raining`, `solarRadiation`, `updatedAt`) without exposing internal KNX group addresses.

#### Scenario: Fetch KZ West devices while authenticated
- **WHEN** an authenticated client sends `GET /api/devices`
- **THEN** the system returns HTTP 200 with `{ devices: SmartDeviceDTO[], environment: KnxEnvironmentDTO }` containing `ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, and `blinds-all`, plus the latest cached or solar-fallback `environment` telemetry

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
The system SHALL listen for incoming KNX `GroupValue_Write` and `GroupValue_Response` telegrams as well as internal device updates, update the state cache, and broadcast normalized `SmartDeviceDTO` (`device-state`) and `KnxEnvironmentDTO` (`environment-state`) updates to authenticated clients connected to `GET /api/devices/events`.

#### Scenario: Physical wall switch updates connected UI
- **WHEN** a physical wall switch or actuator transmits a `GroupValue_Write` on `0/0/55` (`KZ recht Decke Status`) or `0/1/71` (`Jal KZ rechts,west Lamellenpos. Status`)
- **THEN** the backend updates the cached device state and pushes an SSE `device-state` event with the updated `SmartDeviceDTO` payload to all connected `GET /api/devices/events` clients

#### Scenario: KNX weather station telegram updates connected 3D blind simulation
- **WHEN** the KNX weather station transmits a telegram on `0/5/8` (`Elevation`), `0/5/12` (`Azimuth`), `0/5/13` (`HelligkeitSued_Lux`), `0/5/14` (`HelligkeitWest_Lux`), `0/5/16` (`Lux Süd`), `0/5/17` (`Lux West`), `0/5/19` (`HelligkeitMax_Lux`), `0/5/6` (`Niederschlag`), `0/5/7` (`Außentemperatur`), or `0/5/26` (`Globalstrahlung`)
- **THEN** the backend decodes and updates the cached `environment` telemetry and pushes an SSE `environment-state` event to all connected `GET /api/devices/events` clients

### Requirement: KNX Weather Station Sun and Lux Telemetry (`0/5/*`)
The system SHALL read and decode KNX weather station group addresses (`0/5/6` Precipitation, `0/5/7` Outdoor Temperature, `0/5/8` Sun Elevation, `0/5/12` Sun Azimuth, `0/5/13` & `0/5/16` South Lux, `0/5/14` & `0/5/17` West Lux, `0/5/19` Max Lux, and `0/5/26` Solar Radiation) on startup and on live bus indications, and SHALL provide a deterministic astronomical solar angle and lux fallback when running with `KNX_ENABLED=false` or before weather station telegrams are received.

#### Scenario: Decode live weather station sun angle and lux telegrams
- **WHEN** the backend receives KNX telegrams for sun elevation (`0/5/8`), sun azimuth (`0/5/12`), and facade lux (`0/5/14` / `0/5/17` West, `0/5/13` / `0/5/16` South)
- **THEN** it normalizes `sunElevation` (`-90°` to `90°`), `sunAzimuth` (`0°` to `360°`), and lux values into `KnxEnvironmentDTO` with `source: 'knx'`

#### Scenario: Astronomical solar fallback in dry-run or pre-telegram state
- **WHEN** `KNX_ENABLED=false` or no sun angle/lux telegrams have arrived from the bus yet
- **THEN** the backend computes realistic `sunElevation`, `sunAzimuth`, and estimated daylight lux based on current local time and geographic coordinates (`48.3069° N, 14.2858° E`, Linz) with `source: 'fallback'` so the 3D blind simulation always reflects accurate sun geometry
