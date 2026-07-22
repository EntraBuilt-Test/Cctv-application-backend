/**
 * Builds a unique, URL/path-safe stream key from a camera name, e.g.
 * "Front Gate Cam" -> "front-gate-cam-a1b2c3". MediaMTX path names must be
 * simple strings, and we need one that's guaranteed unique per camera.
 */
function makeStreamKey(name) {
  const base = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'camera';

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

module.exports = { makeStreamKey };
