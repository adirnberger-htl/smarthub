# Spec Delta

## Purpose

Coordinates how routines store resolved geographic coordinates, how address inputs emit updates during configuration, and how dashboard widgets fetch routes and weather without redundant network calls.

## ADDED Requirements

### Requirement: Routine coordinate persistence and reuse
When a routine's start address or destination address is geocoded or configured, the system SHALL persist the resolved coordinates (`startCoords`, `destCoords` with `address`, `lat`, `lon`, and `formattedAddress`) inside the routine's `config` object and reuse them in `BusWidget`, `WeatherWidget`, and `autoConfigure` whenever the stored address string matches the current routine address.

#### Scenario: Dashboard widgets reuse stored routine coordinates without geocoding
- **WHEN** an active routine has `startCoords` and `destCoords` in its `config` matching `routine.startAddress` and `routine.destination`
- **THEN** `BusWidget` requests `/api/bus/route` directly using those coordinates without calling `/api/places/geocode`, and `WeatherWidget` requests `/api/weather/forecast` with `lat` and `lon` directly

#### Scenario: Changing routine address refreshes stored coordinates
- **WHEN** a user updates a routine's `startAddress` or `destination` to a different address string
- **THEN** stale coordinates for the changed address are invalidated and refreshed via geocoding

### Requirement: Targeted route refetching in BusWidget
`BusWidget` SHALL only trigger a route fetch when the active routine's routing parameters (`startAddress`, `destination`, or `arrivalTime`) change, ignoring mutations to non-routing routine fields (`name`, `activeDays`, `alarms`, `startTime`, `endTime`).

#### Scenario: Toggling an alarm or active day does not re-fetch the bus route
- **WHEN** a user modifies an alarm or active day on the active routine while `startAddress`, `destination`, and `arrivalTime` remain unchanged
- **THEN** `BusWidget` does not issue any `/api/places/geocode` or `/api/bus/route` requests

### Requirement: Commit-based address input updates
`AddressAutocomplete` SHALL fetch autocomplete suggestions while typing (debounced) but SHALL only commit the updated address value to its bound routine model when the user selects a suggestion or blurs/commits the input field.

#### Scenario: Typing an address does not trigger routine PUT requests on every keystroke
- **WHEN** a user types characters into the Start Address or Destination Address field in Settings before selecting a suggestion or blurring the input
- **THEN** `/api/places/autocomplete` is queried after the input debounce, but `PUT /api/routines/:id` is not called until a suggestion is selected or the input loses focus
