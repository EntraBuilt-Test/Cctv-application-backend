/**
 * Camera health monitoring.
 *
 * MediaMTX already knows, per path, whether it has a live source attached
 * ("ready": true/false) - true for a real camera whose RTSP stream is being
 * pulled successfully, and equally true for a simulated camera whose ffmpeg
 * test feed is running. That's exactly the "is this camera actually online"
 * signal the PRD dashboard needs, so we poll it rather than inventing a
 * separate heartbeat mechanism.
 *
 * GET /v3/paths/get/{name} -> { ready: bool, readyTime, tracks, ... }
 */

const Camera = require('../models/Camera');
const { MEDIASERVER_API_URL } = require('./mediaServer');

const POLL_INTERVAL_MS = 20000;

async function checkCamera(streamKey) {
  try {
    const res = await fetch(`${MEDIASERVER_API_URL}/v3/paths/get/${streamKey}`);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.ready);
  } catch (err) {
    return false;
  }
}

async function runHealthCheck(io) {
  const cameras = await Camera.find({}, 'streamKey status lastSeenAt');

  await Promise.all(
    cameras.map(async (cam) => {
      const isReady = await checkCamera(cam.streamKey);
      const newStatus = isReady ? 'online' : 'offline';

      if (cam.status === newStatus) return; // no change, skip a write + broadcast

      cam.status = newStatus;
      if (isReady) cam.lastSeenAt = new Date();
      await cam.save();

      io.emit('camera:status', {
        cameraId: cam._id,
        status: cam.status,
        lastSeenAt: cam.lastSeenAt
      });
    })
  );
}

function startHealthMonitor(io) {
  runHealthCheck(io).catch((err) => console.error('[health] initial check failed:', err.message));
  setInterval(() => {
    runHealthCheck(io).catch((err) => console.error('[health] check failed:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`[health] monitoring camera status every ${POLL_INTERVAL_MS / 1000}s`);
}

module.exports = { startHealthMonitor };
