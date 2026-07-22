const express = require('express');
const Event = require('../models/Event');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/events - recent events for the dashboard alert feed
router.get('/', async (req, res) => {
  const events = await Event.find().sort({ createdAt: -1 }).limit(50);
  res.json(events);
});

// PATCH /api/events/:id/ack - acknowledge an alert
router.patch('/:id/ack', async (req, res) => {
  const event = await Event.findByIdAndUpdate(req.params.id, { acknowledged: true }, { new: true });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

module.exports = router;
