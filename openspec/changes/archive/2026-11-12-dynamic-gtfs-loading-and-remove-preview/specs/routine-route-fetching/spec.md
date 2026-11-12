# Spec Delta

## ADDED Requirements

### Requirement: Direct widget route presentation without manual preview
Routine route calculation and display SHALL be handled exclusively by active dashboard commute widgets (`BusWidget` for public transport and `CarWidget` for driving) according to routine time windows and active days. The Settings interface SHALL NOT provide a manual route preview button, and the Dashboard SHALL NOT render a persistent or floating route-preview overlay card.

#### Scenario: Routine card in settings displays no preview button
- **WHEN** a user views a routine in Settings under either bus or car transport mode
- **THEN** the routine card displays Auto-Configure and timing controls, but contains no manual Preview button

#### Scenario: Dashboard contains no route-preview overlay
- **WHEN** a user navigates to the Dashboard
- **THEN** commute routes are displayed only inside the active `BusWidget` or `CarWidget` without any separate `<div class="route-preview">` element
