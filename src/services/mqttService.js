const mqtt = require('mqtt');
const Sensor = require('../models/Sensor');
const Event = require('../models/Event');

// Topic convention: cctv/<siteId>/<deviceId>/<type>
// Example payload: { "reading": true, "battery": 87 }
// This mirrors the PRD's IoT sensor data flow (section 6.3):
// ESP32 -> MQTT topic -> backend subscribes/normalizes -> rule engine (Phase 4) -> alert

function startMqttService(io) {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  console.log('[mqtt-debug] brokerUrl:', JSON.stringify(brokerUrl));
  console.log('[mqtt-debug] username:', JSON.stringify(process.env.MQTT_USERNAME));
  console.log('[mqtt-debug] password length:', (process.env.MQTT_PASSWORD || '').length);
  const client = mqtt.connect(brokerUrl, {
     username: process.env.MQTT_USERNAME,
     password: process.env.MQTT_PASSWORD,
     clientId: `cctv-backend-${Math.random().toString(16).slice(2, 10)}`,
     reconnectPeriod: 5000,
   });

  client.on('connect', () => {
    console.log(`[mqtt] connected to broker at ${brokerUrl}`);
    client.subscribe('cctv/+/+/+', (err) => {
      if (err) console.error('[mqtt] subscribe error', err);
      else console.log('[mqtt] subscribed to cctv/+/+/+');
    });
  });

  client.on('message', async (topic, payloadBuffer) => {
    try {
      const [, siteId, deviceId, type] = topic.split('/');
      const payload = JSON.parse(payloadBuffer.toString());

      const sensor = await Sensor.findOneAndUpdate(
        { deviceId },
        {
          deviceId,
          siteId,
          type,
          name: payload.name || deviceId,
          lastReading: payload,
          batteryLevel: payload.battery,
          status: 'online',
          lastSeenAt: new Date()
        },
        { upsert: true, new: true }
      );

      const event = await Event.create({
        sourceType: 'sensor',
        sourceId: deviceId,
        type,
        severity: payload.severity || 'low',
        meta: payload
      });

      // Push to any connected dashboards in real time
      io.emit('sensor:update', sensor);
      io.emit('event:new', event);
    } catch (err) {
      console.error('[mqtt] failed to process message', err.message);
    }
  });

  client.on('error', (err) => console.error('[mqtt] connection error', err.message));

  return client;
}

module.exports = { startMqttService };
