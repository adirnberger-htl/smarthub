# Spec Delta

## MODIFIED Requirements

### Requirement: KZ West Device Inventory and State Query
The system SHALL expose an authenticated `GET /api/devices` endpoint returning all configured `KZ West` smart devices (`ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, `blinds-all`) serialized as protocol-agnostic `SmartDeviceDTO` objects (`id`, `name`, `room`, `category`, `capabilities`, `state`) alongside the current normalized KNX weather station `environment` telemetry (`sunElevation`, `sunAzimuth`, `luxWest`, `luxSouth`, `luxMax`, `outdoorTemp`, `raining`, `solarRadiation`, `updatedAt`) without exposing internal KNX group addresses.

#### Scenario: Fetch KZ West devices while authenticated
- **WHEN** an authenticated client sends `GET /api/devices`
- **THEN** the system returns HTTP 200 with `{ devices: SmartDeviceDTO[], environment: KnxEnvironmentDTO }` containing `ceiling-light`, `desk-light`, `room-leds`, `outlet`, `blind-west`, `blind-south`, and `blinds-all`, plus the latest cached or solar-fallback `environment` telemetry

#### Scenario: Reject unauthenticated device query
- **WHEN** an unauthenticated client sends `GET /api/devices`
- **THEN** the system returns HTTP 401

### Requirement: Real-Time Bus State Synchronization via SSE
The system SHALL listen for incoming KNX `GroupValue_Write` and `GroupValue_Response` telegrams for both `KZ West` devices and the KNX weather station (`0/5/*`), update the state cache, and broadcast normalized `SmartDeviceDTO` (`device-state`) and `KnxEnvironmentDTO` (`environment-state`) updates to authenticated clients connected to `GET /api/devices/events`.

#### Scenario: Physical wall switch updates connected UI
- **WHEN** a physical wall switch or actuator transmits a `GroupValue_Write` on `0/0/55` (`KZ recht Decke Status`) or `0/1/71` (`Jal KZ rechts,west Lamellenpos. Status`)
- **THEN** the backend updates the cached device state and pushes an SSE `device-state` event with the updated `SmartDeviceDTO` payload to all connected `GET /api/devices/events` clients

#### Scenario: KNX weather station telegram updates connected 3D blind simulation
- **WHEN** the KNX weather station transmits a telegram on `0/5/8` (`Elevation`), `0/5/12` (`Azimuth`), `0/5/13` (`HelligkeitSued_Lux`), `0/5/14` (`HelligkeitWest_Lux`), `0/5/16` (`Lux Süd`), `0/5/17` (`Lux West`), `0/5/19` (`HelligkeitMax_Lux`), `0/5/6` (`Niederschlag`), `0/5/7` (`Außentemperatur`), or `0/5/26` (`Globalstrahlung`)
- **THEN** the backend decodes and updates the cached `environment` telemetry and pushes an SSE `environment-state` event to all connected `GET /api/devices/events` clients

## ADDED Requirements

### Requirement: KNX Weather Station Sun and Lux Telemetry (`0/5/*`)
The system SHALL read and decode KNX weather station group addresses (`0/5/6` Precipitation, `0/5/7` Outdoor Temperature, `0/5/8` Sun Elevation, `0/5/12` Sun Azimuth, `0/5/13` & `0/5/16` South Lux, `0/5/14` & `0/5/17` West Lux, `0/5/19` Max Lux, and `0/5/26` Solar Radiation) on startup and on live bus indications, and SHALL provide a deterministic astronomical solar angle and lux fallback when running with `KNX_ENABLED=false` or before weather station telegrams are received.

#### Scenario: Decode live weather station sun angle and lux telegrams
- **WHEN** the backend receives KNX telegrams for sun elevation (`0/5/8`), sun azimuth (`0/5/12`), and facade lux (`0/5/14` / `0/5/17` West, `0/5/13` / `0/5/16` South)
- **THEN** it normalizes `sunElevation` (`-90°` to `90°`), `sunAzimuth` (`0°` to `360°`), and lux values into `KnxEnvironmentDTO` with `source: 'knx'`

#### Scenario: Astronomical solar fallback in dry-run or pre-telegram state
- **WHEN** `KNX_ENABLED=false` or no sun angle/lux telegrams have arrived from the bus yet
- **THEN** the backend computes realistic `sunElevation`, `sunAzimuth`, and estimated daylight lux based on current local time and geographic coordinates (`48.3069° N, 14.2858° E`, Linz) with `source: 'fallback'` so the 3D blind simulation always reflects accurate sun geometry
