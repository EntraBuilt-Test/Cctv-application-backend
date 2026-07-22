/**
 * Talks to MediaMTX's runtime API to add/remove one path per camera.
 *
 * Why this exists: previously every camera card in the frontend pointed at the
 * same hardcoded "camera1" path, so adding a second camera did nothing visible.
 * Now each Camera document gets its own `streamKey`, and this service tells
 * MediaMTX to serve that path either from the camera's real RTSP feed (once
 * hardware is connected) or from a synthetic test feed (while it isn't) -
 * matching the PRD's "develop without physical hardware" assumption (9.1).
 *
 * MediaMTX API reference (bluenviron/mediamtx, v3 config API):
 *   POST   /v3/config/paths/add/{name}     body: path config JSON
 *   DELETE /v3/config/paths/delete/{name}
 *
 * Local dev: MEDIASERVER_API_URL = http://localhost:9997 (talks to MediaMTX directly).
 * Render (backend + media server as separate services): Render only exposes ONE
 * public port per service, so the media server container runs nginx in front of
 * MediaMTX, proxying "/control/*" -> MediaMTX's internal API port 9997 and
 * everything else -> its internal HLS port 8888 (see nginx.conf.template).
 * In that case set MEDIASERVER_API_URL = https://<media-server>.onrender.com/control
 */
const MEDIASERVER_API_URL = process.env.MEDIASERVER_API_URL || 'http://localhost:9997';

// $MTX_PATH is substituted by MediaMTX itself at runtime with the path name,
// so the exact same command works for every simulated camera.
function simulatedFeedCommand(streamKey) {
  // Vary the tone per camera (deterministic hash) so simulated feeds are at
  // least audibly distinct from one another until real hardware replaces them.
  let hash = 0;
  for (const ch of streamKey) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  const freq = 220 + (hash % 660); // 220Hz - 880Hz

  return (
    'ffmpeg -re -f lavfi -i "testsrc2=size=1280x720:rate=25" ' +
    `-f lavfi -i "sine=frequency=${freq}:sample_rate=48000" ` +
    '-pix_fmt yuv420p -c:v libx264 -preset veryfast -tune zerolatency ' +
    '-c:a aac -f rtsp rtsp://localhost:8554/$MTX_PATH'
  );
}

async function mtxRequest(method, path, body, { allow404 = false } = {}) {
  const res = await fetch(`${MEDIASERVER_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok && !(allow404 && res.status === 404)) {
    const text = await res.text().catch(() => '');
    throw new Error(`MediaMTX API ${method} ${path} -> ${res.status}: ${text}`);
  }
  return res;
}

/**
 * Registers (or re-registers) the given camera's stream as a MediaMTX path.
 * Never throws - a media-server hiccup shouldn't block camera onboarding,
 * it just means live view won't work until the path is retried.
 */
async function registerCameraPath({ streamKey, streamUrl, isSimulated }) {
  try {
    // Clear out any previous definition first (e.g. switching real <-> simulated).
    // 404 here just means "nothing to delete yet", which is fine - but the
    // POST below must NOT get the same leniency, or a wrong MEDIASERVER_API_URL
    // (e.g. missing the nginx "/control" prefix) would silently look successful.
    await mtxRequest('DELETE', `/v3/config/paths/delete/${streamKey}`, undefined, { allow404: true }).catch(
      () => {}
    );

    const pathConfig = isSimulated
      ? { runOnInit: simulatedFeedCommand(streamKey), runOnInitRestart: true }
      : // sourceOnDemand:false so MediaMTX stays connected to the real camera
        // continuously - needed so health monitoring reflects whether the
        // camera is actually reachable, not just "reachable while someone's viewing".
        { source: streamUrl, sourceOnDemand: false };

    await mtxRequest('POST', `/v3/config/paths/add/${streamKey}`, pathConfig);
    return { ok: true };
  } catch (err) {
    console.error(`[mediaserver] failed to register path "${streamKey}":`, err.message);
    return { ok: false, error: err.message };
  }
}

async function removeCameraPath(streamKey) {
  try {
    await mtxRequest('DELETE', `/v3/config/paths/delete/${streamKey}`, undefined, { allow404: true });
    return { ok: true };
  } catch (err) {
    console.error(`[mediaserver] failed to remove path "${streamKey}":`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Checks whether MediaMTX currently has a live, connected source for this path.
 * Returns 'online' if the path exists and has an active source/publisher,
 * 'offline' if the path exists but has no source, or if the path doesn't
 * exist at all yet (e.g. never registered, or media server was restarted
 * and the backend hasn't re-synced yet).
 */
async function getPathStatus(streamKey) {
  try {
    const res = await mtxRequest('GET', `/v3/paths/get/${streamKey}`, undefined, { allow404: true });
    if (res.status === 404) return 'offline';
    const data = await res.json();
    return data.ready ? 'online' : 'offline';
  } catch (err) {
    console.error(`[mediaserver] health check failed for "${streamKey}":`, err.message);
    return 'offline';
  }
}

module.exports = { registerCameraPath, removeCameraPath, getPathStatus, MEDIASERVER_API_URL };
