# place-geocoding Specification

## Purpose
Resolves human-readable place names into geographic coordinates and provides address autocomplete suggestions via the Google Maps API with in-memory caching and concurrent request deduplication.

## Requirements

### Requirement: Cached and deduplicated place geocoding
The geocoding service SHALL cache successful geocoding results in memory by normalized place query and SHALL deduplicate concurrent in-flight requests for the same normalized place query.

#### Scenario: Repeated geocode request hits cache
- **WHEN** `geocodePlace` is called with a place string that was resolved within the cache TTL (e.g., `"Linz, Austria"` and `"  linz, austria "`)
- **THEN** the service returns the cached `PlaceResult` with the original caller's `place` field preserved and without issuing an external HTTP request to Google Maps

#### Scenario: Concurrent identical geocode requests share a single external call
- **WHEN** multiple callers invoke `geocodePlace` for the same uncached place string simultaneously (such as `BusWidget` and `WeatherWidget` on dashboard mount)
- **THEN** only one external HTTP request is sent to the Google Geocoding API and all callers receive the resolved result

#### Scenario: Failed geocode requests are negatively cached briefly
- **WHEN** an external geocoding call fails (e.g., quota exceeded or network error)
- **THEN** subsequent requests for the same normalized key within the failure TTL fail fast without hammering the external API

### Requirement: Cached and deduplicated place autocomplete
The autocomplete service SHALL cache successful autocomplete predictions in memory by normalized query string and SHALL deduplicate concurrent in-flight requests for the same normalized query string.

#### Scenario: Repeated autocomplete prefix hits cache
- **WHEN** `autocompletePlace` is called with a query string that was fetched within the autocomplete cache TTL
- **THEN** the service returns the cached list of `AutocompleteResult` predictions without issuing an external HTTP request
