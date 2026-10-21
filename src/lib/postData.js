import request from './request.js';
import Progress from './Progress.js';

// See https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
let backends = [
  'https://overpass-api.de/api/interpreter',
  // no area index (area queries fail fast with a remark), but fast for bounding boxes
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  // Unreachable when last checked, kept in case they are only temporarily down:
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.openstreetmap.ru/cgi/interpreter'
]

// Overpass asks clients to back off when it is at capacity (429/502/503/504).
// Busy responses often lack CORS headers, so the browser reports them as network errors.
const busyStatuses = new Set([429, 502, 503, 504]);
const retryDelays = [5000, 15000, 45000];

// Some mirrors accept the connection and never answer; don't wait on them forever.
const requestTimeout = 120000;

export default function postData(data, progress) {
  progress = progress || new Progress();
  const postData = {
    method: 'POST',
    responseType: 'json',
    progress,
    timeout: requestTimeout,
    headers: {
      'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'data=' + encodeURIComponent(data),
  };

  let serverIndex = 0;
  let round = 0;
  let allBusy = true;

  return fetchFrom(backends[serverIndex]);

  function fetchFrom(overpassUrl) {
    return request(overpassUrl, postData, 'POST')
      .then(checkRemark)
      .catch(handleError);
  }

  function checkRemark(response) {
    // Overpass reports timeouts, memory limits and missing area data as 200 + remark.
    let remark = response && response.remark;
    if (remark && remark.indexOf('runtime error') > -1) {
      let err = new Error(remark);
      err.remarkError = true;
      // e.g. "open64: ... area_tags_local.bin" - this server cannot answer area() queries
      err.noAreaIndex = remark.indexOf('area') > -1;
      throw err;
    }
    return response;
  }

  function handleError(err) {
    if (err.cancelled) throw err;
    // Callers can fall back to a bounding box download (see loadAreaRoads.js), which is
    // faster than waiting for the remaining, slower servers.
    if (err.noAreaIndex) throw err;
    if (!busyStatuses.has(err.statusError) && !err.networkError) allBusy = false;

    if (serverIndex >= backends.length - 1) {
      if (allBusy && round < retryDelays.length) {
        // every server is overloaded - wait and try them all again.
        let delay = retryDelays[round];
        round += 1;
        serverIndex = 0;
        allBusy = true;
        return wait(delay).then(() => {
          if (progress.isCancelled) throw {cancelled: true};
          return fetchFrom(backends[serverIndex]);
        });
      }
      // we can't do much anymore - all servers failed
      err.allServersFailed = true;
      err.serversAttempted = backends.length;
      throw err;
    }

    if (err.statusError || err.networkError || err.timedOut) {
      progress.notify({
        loaded: -1
      });
    }

    serverIndex += 1;
    return fetchFrom(backends[serverIndex])
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
