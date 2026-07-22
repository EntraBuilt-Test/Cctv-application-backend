const express = require('express');
const Camera = require('../models/Camera');
const { requireAuth, requireRole } = require('../middleware/auth');
const { detectCapabilities } = require('../services/capabilityDetection');
const { registerCameraPath, removeCameraPath } = require('../services/mediaServer');
const { makeStreamKey } = require('../services/slug');

const router = express.Router();
router.use(requireAuth);

// GET /api/cameras - list all cameras
router.get('/', async (req, res) => {
  const cameras = await Camera.find().sort({ createdAt: -1 });
  res.json(cameras);
});

// POST /api/cameras - add a camera (admin/installer only)
// This is where the PRD's "capability-aware" onboarding flow happens (section 4.1):
// try ONVIF discovery first, fall back to a default profile if it doesn't respond.
router.post('/', requireRole('admin', 'installer'), async (req, res) => {
  try {
    const { name, siteId, streamUrl, isSimulated, onvifHost, onvifPort, onvifUsername, onvifPassword } = req.body;

    // A physical camera needs a real streamUrl; a simulated one (no hardware yet) doesn't.
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!isSimulated && !streamUrl) {
      return res.status(400).json({ error: 'streamUrl is required unless isSimulated is true' });
    }

    const streamKey = makeStreamKey(name);
    const effectiveStreamUrl = streamUrl || `simulated://${streamKey}`;

    // Skip ONVIF probing entirely for simulated cameras - there's no real device to ask.
    const capabilityProfile = isSimulated
      ? {
          onvifSupported: false,
          ptz: false,
          twoWayAudio: false,
          onboardMotionDetection: false,
          maxResolution: '720p',
          streamProtocol: 'RTSP',
          onboardAIEvents: []
        }
      : await detectCapabilities(streamUrl, {
          hostname: onvifHost,
          port: onvifPort,
          username: onvifUsername,
          password: onvifPassword
        });

    const camera = await Camera.create({
      name,
      siteId,
      streamUrl: effectiveStreamUrl,
      streamKey,
      isSimulated: Boolean(isSimulated),
      capabilityProfile,
      status: 'unknown'
    });

    const mediaResult = await registerCameraPath({
      streamKey,
      streamUrl: effectiveStreamUrl,
      isSimulated: Boolean(isSimulated)
    });

    res.status(201).json({ ...camera.toObject(), mediaServerWarning: mediaResult.ok ? undefined : mediaResult.error });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add camera', details: err.message });
  }
});

// PATCH /api/cameras/:id - rename / move site
router.patch('/:id', requireRole('admin', 'installer'), async (req, res) => {
  const { name, siteId } = req.body;
  const camera = await Camera.findByIdAndUpdate(
    req.params.id,
    { ...(name && { name }), ...(siteId && { siteId }) },
    { new: true }
  );
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  res.json(camera);
});

// DELETE /api/cameras/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const camera = await Camera.findByIdAndDelete(req.params.id);
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  if (camera.streamKey) await removeCameraPath(camera.streamKey);
  res.json({ deleted: true });
});

module.exports = router;
