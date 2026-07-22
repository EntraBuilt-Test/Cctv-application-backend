/**
 * Simulates an ESP32 door sensor publishing over MQTT.
 * Run this AFTER the backend and an MQTT broker (e.g. Mosquitto) are running:
 *   node src/simulate-sensor.js
 *
 * This stands in for real ESP32 firmware until hardware arrives (PRD 9.1/9.2).
 */
require('dotenv').config();
const mqtt = require('mqtt');

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(brokerUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `cctv-simulator-${Math.random().toString(16).slice(2, 10)}`,
});
const topic = 'cctv/default-site/esp32-door-01/door';

client.on('connect', () => {
  console.log(`[simulator] connected, publishing to ${topic} every 10s`);
  setInterval(() => {
    const isOpen = Math.random() > 0.7;
    const payload = {
      name: 'Front Door Sensor',
      reading: isOpen ? 'open' : 'closed',
      battery: Math.floor(80 + Math.random() * 20),
      severity: isOpen ? 'medium' : 'low'
    };
    client.publish(topic, JSON.stringify(payload));
    console.log('[simulator] published', payload);
  }, 10000);
});
