const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'iss-gateway',
    // A fresh group id each boot means a restarted gateway always starts from
    // the live edge rather than replaying a backlog the UI would discard.
    groupId: process.env.KAFKA_GROUP_ID || `iss-gateway-${process.pid}-${Date.now()}`,
    topics: {
      position: process.env.TOPIC_POSITION_ENRICHED || 'iss.position.enriched',
      telemetry: process.env.TOPIC_TELEMETRY_RAW || 'iss.telemetry.raw',
      telemetryStats: process.env.TOPIC_TELEMETRY_STATS || 'iss.telemetry.stats',
      metrics: process.env.TOPIC_METRICS_WINDOWED || 'iss.metrics.windowed',
      events: process.env.TOPIC_ORBIT_EVENTS || 'iss.orbit.events',
      alerts: process.env.TOPIC_ALERTS || 'iss.alerts',
    },
  },
  server: {
    port: num(process.env.GATEWAY_PORT, 7300),
    host: process.env.GATEWAY_HOST || '0.0.0.0',
  },
  history: {
    trackPoints: num(process.env.HISTORY_TRACK_POINTS, 2000),
    channelSamples: num(process.env.HISTORY_CHANNEL_SAMPLES, 180),
    alerts: num(process.env.HISTORY_ALERTS, 100),
    events: num(process.env.HISTORY_EVENTS, 100),
    metrics: num(process.env.HISTORY_METRICS, 120),
  },
  // Telemetry arrives ~58 msg/s. Coalesce it into periodic frames so the
  // browser gets steady updates instead of a message storm.
  broadcastIntervalMs: num(process.env.BROADCAST_MS, 500),
};
