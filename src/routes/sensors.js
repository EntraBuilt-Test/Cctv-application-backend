const express = require('express');
const Sensor = require('../models/Sensor');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/sensors - list all IoT devices and their last known reading
router.get('/', async (req, res) => {
  const sensors = await Sensor.find().sort({ updatedAt: -1 });
  res.json(sensors);
});

module.exports = router;
