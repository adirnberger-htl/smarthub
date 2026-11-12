# Spec Delta

## ADDED Requirements

### Requirement: Commute mode speed comparison indicator in routine configuration
The system SHALL display an indicator beneath the transport mode selector (Public Transport / Car) in the Routine Settings interface comparing driving and public transit travel times when start and destination locations are configured.

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
