# Spec Delta

## MODIFIED Requirements

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
