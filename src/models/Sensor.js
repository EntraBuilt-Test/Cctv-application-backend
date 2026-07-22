const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true }, // matches ESP32 MQTT client id / topic key
    siteId: { type: String, default: 'default-site' },
    type: {
      type: String,
      enum: ['door', 'pir_motion', 'smoke', 'temperature', 'water_leak', 'gas_leak', 'siren', 'smart_light', 'lock'],
      required: true
    },
    name: { type: String, required: true },
    lastReading: { type: mongoose.Schema.Types.Mixed },
    batteryLevel: { type: Number },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeenAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sensor', sensorSchema);
