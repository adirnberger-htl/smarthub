# routine-route-fetching Specification

## Purpose
Coordinates how routines store resolved geographic coordinates, how address inputs emit updates during configuration, and how dashboard widgets fetch routes and weather without redundant network calls.

## Requirements

### Requirement: Routine coordinate persistence and reuse
When a routine's start address or destination address is geocoded or configured, the system SHALL persist the resolved coordinates (`startCoords`, `destCoords` with `address`, `lat`, `lon`, and `formattedAddress`) inside the routine's `config` object and reuse them in `BusWidget`, `CarWidget`, `WeatherWidget`, and `autoConfigure` whenever the stored address string matches the current routine address.

#### Scenario: Dashboard widgets reuse stored routine coordinates without geocoding
- **WHEN** an active routine has `startCoords` and `destCoords` in its `config` matching `routine.startAddress` and `routine.destination`
- **THEN** `BusWidget` requests `/api/bus/route`, `CarWidget` requests `/api/car/route`, and `WeatherWidget` requests `/api/weather/forecast` directly using those coordinates without redundant calls to `/api/places/geocode`

#### Scenario: Changing routine address refreshes stored coordinates
- **WHEN** a user updates a routine's `startAddress` or `destination` to a different address string
- **THEN** stale coordinates for the changed address are invalidated and refreshed via geocoding

### Requirement: Targeted route refetching in BusWidget
`BusWidget` SHALL only trigger a route fetch when the active routine's routing parameters (`startAddress`, `destination`, or `arrivalTime`) change, ignoring mutations to non-routing routine fields (`name`, `activeDays`, `alarms`, `startTime`, `endTime`).

#### Scenario: Toggling an alarm or active day does not re-fetch the bus route
- **WHEN** a user modifies an alarm or active day on the active routine while `startAddress`, `destination`, and `arrivalTime` remain unchanged
- **THEN** `BusWidget` does not issue any `/api/places/geocode` or `/api/bus/route` requests

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

### Requirement: Commit-based address input updates
`AddressAutocomplete` SHALL fetch autocomplete suggestions while typing (debounced) but SHALL only commit the updated address value to its bound routine model when the user selects a suggestion or blurs/commits the input field.

#### Scenario: Typing an address does not trigger routine PUT requests on every keystroke
- **WHEN** a user types characters into the Start Address or Destination Address field in Settings before selecting a suggestion or blurring the input
- **THEN** `/api/places/autocomplete` is queried after the input debounce, but `PUT /api/routines/:id` is not called until a suggestion is selected or the input loses focus

### Requirement: Static route map visualization in CarWidget
In place of a textual maneuver directions list, `CarWidget` SHALL render a static route map visualizing the commute path geometry with start and destination markers, auto-fitted to the path's bounding coordinates with padding, styled to match the active theme (dark/light), and with pointer and touch interactions disabled to prevent viewport displacement on kiosk and desktop displays. If a CARTO basemap key is configured via application environment/runtime config, `CarWidget` SHALL append the key parameter to the raster tile URL so tiles render without watermark stamps.

#### Scenario: Displaying route geometry on map in CarWidget
- **WHEN** an active car routine has a valid route with geometry coordinates returned from `/api/car/route`
- **THEN** `CarWidget` renders a map canvas containing the route path polyline, start pin, destination pin, and auto-fits the viewport to enclose the full route without requiring user scrolling or panning

#### Scenario: Locked interaction on map viewport
- **WHEN** a user hovers, clicks, drags, or gestures over the route map canvas on desktop or touch display
- **THEN** the map does not pan, zoom, or drift, maintaining its auto-fitted commute overview at all times

#### Scenario: Theme-aware map tiles
- **WHEN** the active application theme transitions between light and dark modes
- **THEN** `CarWidget` switches the base map tile style to Carto Dark Matter in dark mode and Carto Voyager or Positron in light mode, appending the configured CARTO key parameter if present

#### Scenario: Graceful fallback without configured API key
- **WHEN** `CarWidget` initializes or switches themes while no CARTO key is configured in runtime settings
- **THEN** `CarWidget` requests standard unkeyed Carto tile URLs without throwing runtime errors or breaking map rendering

### Requirement: Direct widget route presentation without manual preview
Routine route calculation and display SHALL be handled exclusively by active dashboard commute widgets (`BusWidget` for public transport and `CarWidget` for driving) according to routine time windows and active days. The Settings interface SHALL NOT provide a manual route preview button, and the Dashboard SHALL NOT render a persistent or floating route-preview overlay card.

#### Scenario: Routine card in settings displays no preview button
- **WHEN** a user views a routine in Settings under either bus or car transport mode
- **THEN** the routine card displays Auto-Configure and timing controls, but contains no manual Preview button

#### Scenario: Dashboard contains no route-preview overlay
- **WHEN** a user navigates to the Dashboard
- **THEN** commute routes are displayed only inside the active `BusWidget` or `CarWidget` without any separate `<div class="route-preview">` element

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

### Requirement: Structured accordion routine list presentation in settings
The Routine Settings interface SHALL present routines in an accordion layout featuring compact summary card headers and expandable configuration panels, preventing an endless vertical scroll of full forms. An expansion toggle chevron indicator on each card header SHALL visually reflect the current expansion state of the routine card.

#### Scenario: Collapsed routine card header display
- **WHEN** a routine card is in a collapsed state
- **THEN** its header displays the routine name, transport mode badge, active days badges, target arrival time, the commute mode comparison badge, an expand/collapse toggle chevron pointing right, and a delete action button in a compact row

#### Scenario: Toggling accordion expansion
- **WHEN** a user clicks on a collapsed routine card header
- **THEN** the selected routine expands to reveal full editing controls (transport selector, visibility window, address autocompletes, linked alarms) while other routines remain collapsed or collapse, and its header toggle chevron rotates to point downward

#### Scenario: Collapsing an expanded routine card
- **WHEN** an expanded routine card is collapsed by clicking its header
- **THEN** the routine editing controls are hidden and the toggle chevron rotates back to pointing right

#### Scenario: Inline or header routine name customization
- **WHEN** a user updates a routine's name
- **THEN** the updated name is immediately reflected in the routine's accordion header and persisted to the routine model
