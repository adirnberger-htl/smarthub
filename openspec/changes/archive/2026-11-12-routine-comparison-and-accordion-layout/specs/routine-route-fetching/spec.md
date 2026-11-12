# Spec Delta

## MODIFIED Requirements

### Requirement: Commute mode speed comparison indicator in routine configuration
The system SHALL display an indicator comparing driving and public transit travel times for each configured routine when start and destination locations are available. Comparison fetches SHALL be scoped strictly to changes in routing parameters (`startAddress`, `destination`, `arrivalTime`), SHALL maintain isolated debounce timers per routine without cancelling sibling routine requests, and SHALL persist resolved coordinates to the routine model ONLY when coordinates were newly geocoded.

#### Scenario: Car is faster than public transport
- **WHEN** a routine has resolved start and destination coordinates and car travel duration is shorter than public transit duration by at least 2 minutes for the target arrival time
- **THEN** the indicator displays that Car is faster along with the difference in minutes and both durations (e.g. "Car is 15 min faster (20m vs 35m)")

#### Scenario: Public transport is faster than car
- **WHEN** a routine has resolved start and destination coordinates and public transit duration is shorter than car travel duration by at least 2 minutes for the target arrival time
- **THEN** the indicator displays that Public Transport is faster along with the difference in minutes and both durations (e.g. "Public Transport is 8 min faster (22m vs 30m)")

#### Scenario: Both travel modes have similar duration
- **WHEN** driving and public transit durations are within 1 minute of each other
- **THEN** the indicator displays that both modes have similar travel times (e.g. "Similar travel time (~25 min)")

#### Scenario: Unresolved coordinates or unavailable route
- **WHEN** start address or destination address is empty, or one of the transport modes returns no valid route
- **THEN** the indicator gracefully omits relative comparison text or displays an informative notice without throwing errors

#### Scenario: Debounced comparison and coordinate reuse
- **WHEN** the user updates arrival time or address fields in routine settings
- **THEN** comparison requests reuse stored `startCoords` and `destCoords` without redundant geocoding, and network comparison requests are debounced

#### Scenario: Multi-routine independent comparison execution
- **WHEN** multiple routines exist with configured addresses in Routine Settings
- **THEN** each routine's commute comparison executes independently with its own debounce timer, ensuring every routine displays its calculated comparison without starvation or cancellation by sibling routines

#### Scenario: Coordinate persistence occurs only on newly resolved coordinates
- **WHEN** routine comparison resolves coordinates that match already cached coordinates
- **THEN** no routine update or persistence event is triggered, preventing cyclical re-renders and recursive network requests

## ADDED Requirements

### Requirement: Structured accordion routine list presentation in settings
The Routine Settings interface SHALL present routines in an accordion layout featuring compact summary card headers and expandable configuration panels, preventing an endless vertical scroll of full forms.

#### Scenario: Collapsed routine card header display
- **WHEN** a routine card is in a collapsed state
- **THEN** its header displays the routine name, transport mode badge, active days badges, target arrival time, the commute mode comparison badge, an expand/collapse toggle, and a delete action button in a compact row

#### Scenario: Toggling accordion expansion
- **WHEN** a user clicks on a collapsed routine card header
- **THEN** the selected routine expands to reveal full editing controls (transport selector, visibility window, address autocompletes, linked alarms) while other routines remain collapsed or collapse

#### Scenario: Inline or header routine name customization
- **WHEN** a user updates a routine's name
- **THEN** the updated name is immediately reflected in the routine's accordion header and persisted to the routine model
