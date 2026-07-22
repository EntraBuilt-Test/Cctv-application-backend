require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Camera = require('./models/Camera');
const { registerCameraPath } = require('./services/mediaServer');
const { makeStreamKey } = require('./services/slug');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cctv_platform');

  const email = 'admin@entraiot.local';
  const existing = await User.findOne({ email });
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    await User.create({ name: 'Admin', email, passwordHash, role: 'admin' });
    console.log(`Created admin user: ${email} / password: Admin@123`);
  } else {
    console.log('Admin user already exists, skipping.');
  }

  const existingCam = await Camera.findOne({ name: 'Demo Camera (Simulated)' });
  if (!existingCam) {
    // No physical camera on hand yet (PRD 9.1) - register a synthetic test feed
    // through the same streamKey + media-server path every real camera will use,
    // so the whole onboarding-to-live-view pipeline is demonstrable end to end.
    const streamKey = makeStreamKey('Demo Camera (Simulated)');
    const cam = await Camera.create({
      name: 'Demo Camera (Simulated)',
      siteId: 'default-site',
      streamUrl: `simulated://${streamKey}`,
      streamKey,
      isSimulated: true,
      capabilityProfile: {
        onvifSupported: false,
        ptz: false,
        twoWayAudio: false,
        onboardMotionDetection: false,
        maxResolution: '720p',
        streamProtocol: 'RTSP',
        onboardAIEvents: []
      },
      status: 'unknown'
    });
    await registerCameraPath({ streamKey: cam.streamKey, streamUrl: cam.streamUrl, isSimulated: true });
    console.log(`Created a simulated demo camera (streamKey: ${streamKey}). Add real cameras via the Add Camera UI once hardware arrives.`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
