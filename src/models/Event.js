const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ['camera', 'sensor', 'system'], required: true },
    sourceId: { type: String, required: true }, // Camera _id or Sensor deviceId
    type: { type: String, required: true }, // e.g. 'motion', 'door_open', 'camera_offline'
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    acknowledged: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
