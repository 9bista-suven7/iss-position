// Ingest supervisor: runs the position poller and the telemetry source,
// publishes both to Kafka, and arbitrates between the live NASA feed and the
// built-in simulator.
import http from 'node:http';
import { config } from './config.js';
import { logger } from './log.js';
import { KafkaPublisher } from './kafka.js';
import { PositionSource } from './position-source.js';
import { TelemetrySource } from './telemetry-source.js';
import { TelemetrySimulator } from './telemetry-sim.js';

const log = logger('ingest');

const publisher = new KafkaPublisher();
const position = new PositionSource();
const live = new TelemetrySource();
const sim = new TelemetrySimulator();

const state = {
  startedAt: new Date().toISOString(),
  telemetryMode: config.telemetry.mode,
  activeTelemetrySource: 'none',
  lastPosition: null,
};

// ---- position ------------------------------------------------------------
position.on('record', (rec) => {
  state.lastPosition = rec;
  sim.updateContext(rec);   // keep the simulator physically coherent
  publisher.publish(config.kafka.topics.position, rec.craft, rec);
});

// ---- telemetry -----------------------------------------------------------
const publishTelemetry = (rec) =>
  publisher.publish(config.kafka.topics.telemetry, rec.pui, rec);

live.on('record', publishTelemetry);
sim.on('record', publishTelemetry);

/**
 * In 'auto' mode, prefer the real feed and fall back to the simulator whenever
 * it has been silent past the threshold. Switching is idempotent, so this can
 * run on a plain interval.
 */
function arbitrate() {
  if (config.telemetry.mode === 'live') return setActive('live');
  if (config.telemetry.mode === 'simulated') return setActive('simulator');
  setActive(live.isSilent() ? 'simulator' : 'live');
}

function setActive(which) {
  if (state.activeTelemetrySource === which) return;
  const previous = state.activeTelemetrySource;
  if (which === 'simulator') {
    sim.start();
  } else {
    sim.stop();
  }
  state.activeTelemetrySource = which;
  log.warn('telemetry source switched', {
    from: previous, to: which,
    reason: which === 'simulator' ? 'live feed silent' : 'live feed producing data',
  });
}

// ---- health --------------------------------------------------------------
const health = http.createServer((req, res) => {
  if (req.url !== '/health' && req.url !== '/') {
    res.writeHead(404).end();
    return;
  }
  const body = {
    status: 'up',
    startedAt: state.startedAt,
    kafka: { connected: publisher.connected, ...publisher.stats },
    position: { ...position.stats, last: state.lastPosition },
    telemetry: {
      configuredMode: config.telemetry.mode,
      active: state.activeTelemetrySource,
      liveStatus: live.status,
      liveUpdates: live.stats.updates,
      liveChannelsSeen: live.stats.channels.size,
      liveSilent: live.isSilent(),
      simulated: sim.stats,
    },
  };
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
});

// ---- lifecycle -----------------------------------------------------------
async function main() {
  await publisher.connect();

  if (config.position.enabled) position.start();

  if (config.telemetry.enabled) {
    if (config.telemetry.mode !== 'simulated') live.start();
    // Give the live feed a grace period before judging it silent.
    setActive(config.telemetry.mode === 'simulated' ? 'simulator' : 'live');
    const t = setInterval(arbitrate, 5000);
    t.unref?.();
  }

  health.listen(config.health.port, () => {
    log.info('ingest running', {
      health: `http://localhost:${config.health.port}/health`,
      telemetryMode: config.telemetry.mode,
    });
  });
}

async function shutdown(signal) {
  log.info('shutting down', { signal });
  position.stop();
  live.stop();
  sim.stop();
  health.close();
  await publisher.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  log.error('fatal', { err: err.message, stack: err.stack });
  process.exit(1);
});
