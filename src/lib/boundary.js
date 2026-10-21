import request from './request.js';
import Grid from './Grid.js';

/**
 * Helpers to work with administrative boundaries (outlines of cities and villages).
 * They let us clip a bounding box download to the actual boundary when an Overpass
 * server cannot resolve `area(id)` queries.
 */

/**
 * Converts an Overpass area id back into the OSM element it was derived from.
 */
export function areaIdToOsm(areaId) {
  areaId = Number(areaId);
  if (areaId >= 36e8) return {osmType: 'R', osmId: areaId - 36e8};
  if (areaId >= 24e8) return {osmType: 'W', osmId: areaId - 24e8};
}

/**
 * Fetches the boundary outline for an area id from nominatim.
 * Resolves to {name, bbox: [south, west, north, east], polygons}, where
 * polygons is an array of [outerRing, ...holes] and each ring is [[lon, lat], ...]
 */
export function fetchBoundary(areaId) {
  let osm = areaIdToOsm(areaId);
  if (!osm) return Promise.reject(new Error('Not an area id: ' + areaId));

  let url = `https://nominatim.openstreetmap.org/lookup?format=json&polygon_geojson=1&osm_ids=${osm.osmType}${osm.osmId}`;
  return request(url, {responseType: 'json'}).then(rows => {
    let row = rows && rows[0];
    if (!row || !row.geojson) throw new Error('Could not find boundary for area ' + areaId);

    let geometry = row.geojson;
    let polygons;
    if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
    else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
    else throw new Error(`Boundary of area ${areaId} is a ${geometry.type}, not a polygon`);

    let b = row.boundingbox.map(Number.parseFloat);
    return {
      name: row.display_name,
      bbox: [b[0], b[2], b[1], b[3]],
      polygons
    };
  });
}

export function isInsidePolygons(lon, lat, polygons) {
  return polygons.some(([outer, ...holes]) =>
    isInsideRing(lon, lat, outer) && !holes.some(hole => isInsideRing(lon, lat, hole))
  );
}

/**
 * Keeps only the ways that have at least one node inside the boundary. This
 * mirrors how Overpass `way(area)` filter selects ways.
 */
export function clipGridToBoundary(grid, polygons) {
  let nodes = grid.nodes;
  let keptNodes = new Set();
  let keptWays = [];

  grid.forEachElement(element => {
    if (element.type !== 'way') return;
    let inside = element.nodes.some(id => {
      let node = nodes.get(id);
      return node && isInsidePolygons(node.lon, node.lat, polygons);
    });
    if (!inside) return;

    keptWays.push(element);
    element.nodes.forEach(id => keptNodes.add(id));
  });

  let elements = keptWays;
  keptNodes.forEach(id => {
    let node = nodes.get(id);
    if (node) elements.push(node);
  });

  return Grid.fromOSMResponse(elements);
}

/**
 * Checks whether two [south, west, north, east] boxes touch or overlap.
 * Tolerance is in degrees.
 */
export function bboxesTouch(a, b, tolerance = 0.005) {
  return a[0] <= b[2] + tolerance && b[0] <= a[2] + tolerance &&
         a[1] <= b[3] + tolerance && b[1] <= a[3] + tolerance;
}

function isInsideRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0], yi = ring[i][1];
    let xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
