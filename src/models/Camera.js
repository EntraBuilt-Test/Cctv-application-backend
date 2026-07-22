const mongoose = require('mongoose');

// Mirrors the "CapabilityProfile" entity from the PRD (section 7)
const capabilityProfileSchema = new mongoose.Schema(
  {
    onvifSupported: { type: Boolean, default: false },
    ptz: { type: Boolean, default: false },
    twoWayAudio: { type: Boolean, default: false },
    onboardMotionDetection: { type: Boolean, default: false },
    maxResolution: { type: String, default: 'unknown' },
    streamProtocol: {
      type: String,
      enum: ['RTSP', 'RTMP', 'MJPEG', 'proprietary'],
      default: 'RTSP'
    },
    onboardAIEvents: { type: [String], default: [] }
  },
  { _id: false }
);

const cameraSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    siteId: { type: String, default: 'default-site' },
    streamUrl: { type: String, required: true }, // RTSP/MJPEG URL, or a placeholder if simulated
    // Unique path name this camera is registered under on the media server.
    // The frontend always plays `${MEDIA_BASE}/${streamKey}/index.m3u8` - never a hardcoded path.
    streamKey: { type: String, required: true, unique: true },
    // true = no physical camera yet; media server generates a synthetic test feed for this path
    // instead of pulling from streamUrl. Flip to false once real hardware is connected (PRD 9.1/9.2).
    isSimulated: { type: Boolean, default: false },
    capabilityProfile: { type: capabilityProfileSchema, default: () => ({}) },
    status: { type: String, enum: ['online', 'offline', 'unknown'], default: 'unknown' },
    lastSeenAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Camera', cameraSchema);
