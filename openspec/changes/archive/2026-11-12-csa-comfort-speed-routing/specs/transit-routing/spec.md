# Spec Delta

## ADDED Requirements

### Requirement: Comfort and speed optimized reverse transit routing
When calculating transit connections for a specified arrival time (`arrival_time`), the transit routing engine SHALL evaluate candidate itineraries arriving within an arrival lookback window (up to 45 minutes prior to target arrival time) and rank them using a composite utility score balancing total travel duration, transit mode comfort (prioritizing rail and tram over buses), and transfer count, returning the highest-utility connection as the primary result.

#### Scenario: Faster rail connection preferred over slightly later slow multi-bus route
- **WHEN** a route is requested with a target arrival time where an itinerary utilizing rail (S-Bahn, Regionalbahn) or tram achieves substantially lower travel duration than an all-bus connection that departs slightly later
- **THEN** the routing engine selects and returns the faster, higher-comfort rail/tram itinerary as the top route

#### Scenario: Direct or low-transfer route preferred when durations are comparable
- **WHEN** candidate connections within the arrival window have comparable travel times
- **THEN** the routing engine favors itineraries with fewer transfers and departures closest to the target arrival time

#### Scenario: Multi-probe search maintains bounded in-memory latency
- **WHEN** an arrival-time route search executes multi-probe candidate evaluation against the active GTFS graph
- **THEN** the complete candidate search and ranking executes in under 10 milliseconds using existing in-memory graph structures
