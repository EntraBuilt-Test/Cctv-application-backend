require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const cameraRoutes = require('./routes/cameras');
const sensorRoutes = require('./routes/sensors');
const eventRoutes = require('./routes/events');
const { startMqttService } = require('./services/mqttService');
const { registerCameraPath } = require('./services/mediaServer');
const { startHealthMonitor } = require('./services/healthMonitor');
const Camera = require('./models/Camera');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/events', eventRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });

io.on('connection', (socket) => {
  console.log('[socket] client connected', socket.id);
});

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cctv_platform')
  .then(async () => {
    console.log('[mongo] connected');
    server.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
    startMqttService(io);

    // MediaMTX's dynamically-added paths live only in memory, so a media-server
    // restart/redeploy wipes them even though Camera docs are safely in Mongo.
    // Re-registering everything here means live view self-heals after either
    // service restarts, instead of silently staying broken until someone
    // re-adds each camera by hand.
    const cameras = await Camera.find({}, 'streamKey streamUrl isSimulated');
    console.log(`[mediaserver] re-syncing ${cameras.length} camera path(s)...`);
    for (const cam of cameras) {
      const result = await registerCameraPath(cam);
      if (!result.ok) {
        console.warn(`[mediaserver] re-sync failed for "${cam.streamKey}": ${result.error}`);
      }
    }

    startHealthMonitor(io);
  })
  .catch((err) => {
    console.error('[mongo] connection failed', err.message);
    process.exit(1);
  });
