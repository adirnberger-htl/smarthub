# Spec Delta

## MODIFIED Requirements

### Requirement: Routine coordinate persistence and reuse
When a routine's start address or destination address is geocoded or configured, the system SHALL persist the resolved coordinates (`startCoords`, `destCoords` with `address`, `lat`, `lon`, and `formattedAddress`) inside the routine's `config` object and reuse them in `BusWidget`, `CarWidget`, `WeatherWidget`, and `autoConfigure` whenever the stored address string matches the current routine address.

#### Scenario: Dashboard widgets reuse stored routine coordinates without geocoding
- **WHEN** an active routine has `startCoords` and `destCoords` in its `config` matching `routine.startAddress` and `routine.destination`
- **THEN** `BusWidget` requests `/api/bus/route`, `CarWidget` requests `/api/car/route`, and `WeatherWidget` requests `/api/weather/forecast` directly using those coordinates without redundant calls to `/api/places/geocode`

#### Scenario: Changing routine address refreshes stored coordinates
- **WHEN** a user updates a routine's `startAddress` or `destination` to a different address string
- **THEN** stale coordinates for the changed address are invalidated and refreshed via geocoding

## ADDED Requirements

### Requirement: Targeted route refetching and traffic updates in CarWidget
`CarWidget` SHALL fetch driving route data when the active routine's routing parameters (`startAddress`, `destination`, or `arrivalTime`) change, and SHALL periodically poll for refreshed traffic conditions at a throttled interval of 5 minutes during the active routine window, ignoring mutations to non-routing routine fields (`name`, `activeDays`, `alarms`, `startTime`, `endTime`).

#### Scenario: Routing parameter change triggers car route fetch
- **WHEN** the active routine's `startAddress`, `destination`, or `arrivalTime` changes
- **THEN** `CarWidget` initiates a new request to `/api/car/route` and updates the displayed travel time, departure callout, and traffic indicator

#### Scenario: Non-routing field mutation ignored
- **WHEN** an alarm or active day is toggled on the active routine
- **THEN** `CarWidget` does not issue any new geocoding or car route requests

### Requirement: Car-mode routine auto-configuration
When a user executes Auto-Configure on a routine configured with `transportMode === 'car'`, the system SHALL geocode missing start and destination coordinates, query `/api/car/route` with the target arrival time, and automatically calculate and set the routine's `startTime` (departure time minus a commute buffer), `endTime` (target arrival time), and suggested pre-commute wake-up alarms.

#### Scenario: User auto-configures a car routine
- **WHEN** the user clicks "Auto-Configure" on a routine with transport mode "Car", a valid start address, destination address, and arrival time of 08:30
- **THEN** the system resolves coordinates, calculates car commute duration, sets the routine `startTime` to the required departure time, and configures linked morning alarms
