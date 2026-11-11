# Spec Delta: routine-route-fetching

## ADDED Requirements

### Requirement: Static route map visualization in CarWidget
In place of a textual maneuver directions list, `CarWidget` SHALL render a static route map visualizing the commute path geometry with start and destination markers, auto-fitted to the path's bounding coordinates with padding, styled to match the active theme (dark/light), and with pointer and touch interactions disabled to prevent viewport displacement on kiosk and desktop displays.

#### Scenario: Displaying route geometry on map in CarWidget
- **WHEN** an active car routine has a valid route with geometry coordinates returned from `/api/car/route`
- **THEN** `CarWidget` renders a map canvas containing the route path polyline, start pin, destination pin, and auto-fits the viewport to enclose the full route without requiring user scrolling or panning

#### Scenario: Locked interaction on map viewport
- **WHEN** a user hovers, clicks, drags, or gestures over the route map canvas on desktop or touch display
- **THEN** the map does not pan, zoom, or drift, maintaining its auto-fitted commute overview at all times

#### Scenario: Theme-aware map tiles
- **WHEN** the active application theme transitions between light and dark modes
- **THEN** `CarWidget` switches the base map tile style to Carto Dark Matter in dark mode and Carto Voyager or Positron in light mode
