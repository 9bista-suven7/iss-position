// Gateway: Kafka -> (WebSocket + REST) -> Angular dashboard.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { DashboardState } from './state.js';
import { PipelineConsumer } from './consumer.js';

const state = new DashboardState();
const consumer = new PipelineConsumer(state);

// ---- pending deltas, flushed on a timer -----------------------------------
// Telemetry is far too chatty to forward message-by-message, so changes are
// coalesced per channel and shipped as one frame per interval.
const pending = {
  telemetry: new Map(),
  stats: new Map(),
  position: null,
  alerts: [],
  events: [],
  metrics: [],
};

consumer.on('position', (p) => { pending.position = p; });
consumer.on('telemetry', (r) => pending.telemetry.set(r.channel, r));
consumer.on('telemetryStat', (s) => pending.stats.set(s.channel, s));
consumer.on('alert', (a) => pending.alerts.push(a));
consumer.on('orbitEvent', (e) => pending.events.push(e));
consumer.on('metrics', (m) => pending.metrics.push(m));

// ---- HTTP ------------------------------------------------------------------
const json = (res, code, body) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    }).end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  switch (url.pathname) {
    case '/health':
      return json(res, 200, {
        status: 'up',
        startedAt: state.startedAt,
        kafkaConnected: consumer.connected,
        clients: wss ? wss.clients.size : 0,
        counters: state.counters,
      });
    case '/api/snapshot':
      return json(res, 200, state.snapshot().data);
    case '/api/track':
      return json(res, 200, state.track);
    case '/api/position':
      return json(res, 200, state.position);
    case '/api/channels':
      return json(res, 200, [...state.channels.values()]);
    case '/api/channel-history': {
      const ch = url.searchParams.get('channel');
      return json(res, 200, ch ? (state.channelHistory.get(ch) ?? [])
                               : Object.fromEntries(state.channelHistory));
    }
    case '/api/alerts':
      return json(res, 200, { recent: state.alerts, active: [...state.activeAlerts.values()] });
    case '/api/events':
      return json(res, 200, state.events);
    case '/api/metrics':
      return json(res, 200, state.metrics);
    default:
      return json(res, 404, { error: 'not found', path: url.pathname });
  }
});

// ---- WebSocket --------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  // Bootstrap the client so it can paint a full dashboard immediately.
  ws.send(JSON.stringify(state.snapshot()));
});

const broadcast = (frame) => {
  const text = JSON.stringify(frame);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
};

setInterval(() => {
  if (wss.clients.size === 0) {
    // Nobody listening: drop the buffered deltas so they cannot grow forever.
    pending.telemetry.clear(); pending.stats.clear();
    pending.position = null;
    pending.alerts.length = 0; pending.events.length = 0; pending.metrics.length = 0;
    return;
  }
  if (pending.position) {
    broadcast({ type: 'position', data: pending.position });
    pending.position = null;
  }
  if (pending.telemetry.size) {
    broadcast({ type: 'telemetry', data: [...pending.telemetry.values()] });
    pending.telemetry.clear();
  }
  if (pending.stats.size) {
    broadcast({ type: 'telemetryStats', data: [...pending.stats.values()] });
    pending.stats.clear();
  }
  for (const a of pending.alerts.splice(0)) broadcast({ type: 'alert', data: a });
  for (const e of pending.events.splice(0)) broadcast({ type: 'orbitEvent', data: e });
  for (const m of pending.metrics.splice(0)) broadcast({ type: 'metrics', data: m });
}, config.broadcastIntervalMs).unref?.();

// Drop connections that stopped responding so clients.size stays honest.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref?.();

// ---- lifecycle ---------------------------------------------------------------
async function main() {
  await consumer.start();
  server.listen(config.server.port, config.server.host, () => {
    console.log(`[gateway] http://localhost:${config.server.port}  ws://localhost:${config.server.port}/stream`);
  });
}

const shutdown = async () => {
  await consumer.stop().catch(() => {});
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => {
  console.error('[gateway] fatal', e);
  process.exit(1);
});
