# Changelog

## Unreleased

## 1.1.0 - 2026-10-22

### Added
- "Add place" panel: stitch neighbouring villages or cities into one map. Added places share the
  projection of the first place, so roads line up at the border. The label becomes "A & B" and the
  view fits all places. Places can be removed again.
- A warning when an added place does not border the places already on the map, with "Add anyway".
- Added places are kept in the url (`with=<areaId>,<areaId>`), so links and reloads restore the whole map.
- Fallback for servers without an area index: download the bounding box of the boundary and keep only
  the ways that have a node inside it (same rule as Overpass `way(area)`).
- `scene.remove(layer)` and `scene.fitAll()` in the scene API.

### Fixed
- `scene.load()` threw `ReferenceError: projector is not defined` when a custom projector was passed.
- Requests to a hanging Overpass mirror now time out (120 s) instead of loading forever.
- When every server is busy (429/502/503/504 or a network error), retry the servers with backoff.
- Overpass responses with a `runtime error` remark are treated as failures instead of "no roads".

### Changed
- Fallback servers: added overpass.openstreetmap.fr and overpass.private.coffee. maps.mail.ru,
  overpass.osm.jp and overpass.openstreetmap.ru were unreachable when checked; they stay in the list
  (last) in case they come back.
- Default query budget lowered from 900 s / 1 GB to 180 s / 256 MB, which busy public servers accept.
