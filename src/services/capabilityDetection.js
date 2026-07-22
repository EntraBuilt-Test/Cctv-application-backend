/**
 * Capability-aware onboarding (PRD section 4.1).
 *
 * Real ONVIF probing: given a camera's address, we make an actual ONVIF
 * network call (GetCapabilities/GetDeviceInformation) and build a profile
 * from the real response.
 *
 * Important limitation (by design, not a bug): true ONVIF *discovery*
 * (broadcasting on the local network to find nearby cameras) only works
 * from a device sitting on the same network as the cameras. Our backend
 * runs in the cloud, so it can't broadcast onto someone's local camera
 * network. What it CAN do - and what this does - is directly probe a
 * specific camera address the installer provides, the same way a
 * commercial VMS backend does once it has an IP to talk to.
 *
 * If the camera doesn't answer (wrong network, ESP32-CAM with no ONVIF,
 * firewalled, offline, wrong credentials, etc.) we fall back to a safe
 * default profile instead of failing the whole onboarding flow.
 */

const Onvif = require('onvif').Cam;

const PROBE_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('ONVIF probe timed out')), ms))
  ]);
}

async function probeOnvif({ hostname, port, username, password }) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const cam = new Onvif({ hostname, port, username, password, timeout: PROBE_TIMEOUT_MS }, (err) => {
        if (err) return reject(err);

        cam.getCapabilities((capErr, capabilities) => {
          if (capErr) return reject(capErr);

          const ptz = Boolean(capabilities?.PTZ);
          const media = Boolean(capabilities?.media);

          // Profiles carry resolution/codec info once media capability is present
          cam.getProfiles((profErr, profiles) => {
            let maxResolution = 'unknown';
            if (!profErr && Array.isArray(profiles) && profiles.length > 0) {
              const res = profiles[0]?.videoEncoderConfiguration?.resolution;
              if (res?.width && res?.height) maxResolution = `${res.width}x${res.height}`;
            }

            resolve({
              onvifSupported: true,
              ptz,
              twoWayAudio: Boolean(capabilities?.device?.IO?.auxiliary),
              onboardMotionDetection: Boolean(capabilities?.analytics),
              maxResolution,
              streamProtocol: 'RTSP',
              onboardAIEvents: []
            });
          });
        });
      });
    }),
    PROBE_TIMEOUT_MS
  );
}

function fallbackProfile(streamUrl) {
  const looksLikeEsp32 = /esp32|mjpeg/i.test(streamUrl);

  if (looksLikeEsp32) {
    // Fallback profile - PRD section 4.1, bullet 2
    return {
      onvifSupported: false,
      ptz: false,
      twoWayAudio: false,
      onboardMotionDetection: false,
      maxResolution: '720p',
      streamProtocol: 'MJPEG',
      onboardAIEvents: []
    };
  }

  // Generic "unknown but assumed RTSP" fallback - camera exists and streams,
  // but we couldn't confirm its real ONVIF capabilities.
  return {
    onvifSupported: false,
    ptz: false,
    twoWayAudio: false,
    onboardMotionDetection: false,
    maxResolution: 'unknown',
    streamProtocol: 'RTSP',
    onboardAIEvents: []
  };
}

/**
 * @param {string} streamUrl - the camera's RTSP/MJPEG stream URL
 * @param {object} [onvifOptions] - optional explicit ONVIF connection info
 * @param {string} [onvifOptions.hostname] - defaults to the host in streamUrl
 * @param {number} [onvifOptions.port] - defaults to 80
 * @param {string} [onvifOptions.username]
 * @param {string} [onvifOptions.password]
 */
async function detectCapabilities(streamUrl, onvifOptions = {}) {
  let hostname = onvifOptions.hostname;
  try {
    if (!hostname) hostname = new URL(streamUrl.replace('rtsp://', 'http://')).hostname;
  } catch {
    // streamUrl wasn't a parseable URL - skip straight to fallback
    return fallbackProfile(streamUrl);
  }

  const looksLikeEsp32 = /esp32|mjpeg/i.test(streamUrl);
  if (looksLikeEsp32) return fallbackProfile(streamUrl);

  try {
    const profile = await probeOnvif({
      hostname,
      port: onvifOptions.port || 80,
      username: onvifOptions.username,
      password: onvifOptions.password
    });
    return profile;
  } catch (err) {
    console.log(`[onvif] probe failed for ${hostname}, using fallback profile: ${err.message}`);
    return fallbackProfile(streamUrl);
  }
}

module.exports = { detectCapabilities };
