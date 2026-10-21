import Query from './Query.js';
import LoadOptions from './LoadOptions.js';
import {fetchBoundary, clipGridToBoundary} from './boundary.js';

/**
 * Downloads all roads inside an area (city, village, ...).
 *
 * First we ask Overpass for `way(area)`. Some public servers do not have the
 * area index (or are too busy to use it), so when that fails or comes back empty
 * we download the bounding box of the boundary and clip it on our side.
 */
export default function loadAreaRoads(areaId, progress) {
  let firstError;

  return Query.runFromOptions(new LoadOptions({
    wayFilter: Query.Road,
    areaId
  }), progress).then(grid => {
    if (grid.hasRoads()) return grid;
    return loadClipped(areaId, progress);
  }, err => {
    if (err.cancelled) throw err;
    firstError = err;
    return loadClipped(areaId, progress);
  }).catch(err => {
    if (err.cancelled || !firstError) throw err;
    // Report the original problem if the fallback could not even start.
    throw err.boundaryError ? firstError : err;
  });
}

function loadClipped(areaId, progress) {
  return fetchBoundary(areaId).catch(err => {
    err.boundaryError = true;
    throw err;
  }).then(boundary => {
    let options = new LoadOptions();
    let bbox = boundary.bbox.join(',');
    options.raw = `[timeout:${options.timeout}][maxsize:${options.maxHeapByteSize}][out:json];
(${Query.Road}(${bbox}); node(w););
out ${options.outputMethod};`;

    return Query.runFromOptions(options, progress)
      .then(grid => clipGridToBoundary(grid, boundary.polygons));
  });
}
