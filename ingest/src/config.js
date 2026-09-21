// Central configuration. Everything is overridable by environment variable so
// the same build runs locally and in a container.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'iss-ingest',
    topics: {
      position: process.env.TOPIC_POSITION_RAW || 'iss.position.raw',
      telemetry: process.env.TOPIC_TELEMETRY_RAW || 'iss.telemetry.raw',
    },
    // Telemetry arrives in bursts; batching keeps the producer from doing one
    // round trip per sample.
    flushIntervalMs: num(process.env.KAFKA_FLUSH_MS, 500),
    maxBatchSize: num(process.env.KAFKA_MAX_BATCH, 500),
  },

  position: {
    enabled: bool(process.env.POSITION_ENABLED, true),
    url: process.env.POSITION_URL || 'https://api.wheretheiss.at/v1/satellites/25544',
    // wheretheiss.at asks for <= 1 request/second.
    pollMs: num(process.env.POSITION_POLL_MS, 1000),
    timeoutMs: num(process.env.POSITION_TIMEOUT_MS, 8000),
    maxBackoffMs: num(process.env.POSITION_MAX_BACKOFF_MS, 60000),
  },

  telemetry: {
    enabled: bool(process.env.TELEMETRY_ENABLED, true),
    serverUrl: process.env.LS_SERVER_URL || 'https://push.lightstreamer.com',
    adapterSet: process.env.LS_ADAPTER_SET || 'ISSLIVE',
    // 'live'      - only the real NASA feed
    // 'simulated' - only the built-in simulator
    // 'auto'      - prefer live, fall back to the simulator while it is silent
    mode: process.env.TELEMETRY_MODE || 'auto',
    // How long the live feed may be silent before 'auto' switches to the
    // simulator. The real feed goes quiet during loss-of-signal periods.
    silenceFallbackMs: num(process.env.TELEMETRY_SILENCE_MS, 45000),
    simulatorIntervalMs: num(process.env.TELEMETRY_SIM_MS, 1000),
  },

  health: {
    port: num(process.env.INGEST_HEALTH_PORT, 7301),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};
