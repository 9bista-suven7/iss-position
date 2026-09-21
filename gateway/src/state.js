// In-memory view of the pipeline output. The gateway is intentionally
// stateless across restarts: Kafka holds the durable history, this just keeps
// enough recent data to bootstrap a newly connected dashboard.
import { config } from './config.js';

const cap = (arr, n) => (arr.length > n ? arr.splice(0, arr.length - n) : undefined);

export class DashboardState {
  constructor() {
    this.position = null;
    /** Recent ground-track points, trimmed to a bounded window. */
    this.track = [];
    /** channel -> latest telemetry record. */
    this.channels = new Map();
    /** channel -> recent numeric samples [{t, v}]. */
    this.channelHistory = new Map();
    /** channel -> latest windowed stat. */
    this.channelStats = new Map();
    this.alerts = [];
    /** Alerts currently unresolved, keyed by alert key. */
    this.activeAlerts = new Map();
    this.events = [];
    this.metrics = [];
    this.startedAt = new Date().toISOString();
    this.counters = { position: 0, telemetry: 0, alerts: 0, events: 0, metrics: 0, stats: 0 };
  }

  applyPosition(p) {
    this.position = p;
    this.track.push({
      lat: p.lat, lon: p.lon, t: p.tsMs,
      visibility: p.visibility, altitudeKm: p.altitudeKm,
    });
    cap(this.track, config.history.trackPoints);
    this.counters.position++;
  }

  applyTelemetry(rec) {
    this.channels.set(rec.channel, rec);
    if (rec.value !== null && rec.value !== undefined) {
      if (!this.channelHistory.has(rec.channel)) this.channelHistory.set(rec.channel, []);
      const h = this.channelHistory.get(rec.channel);
      h.push({ t: rec.tsMs, v: rec.value });
      cap(h, config.history.channelSamples);
    }
    this.counters.telemetry++;
  }

  applyTelemetryStat(s) {
    this.channelStats.set(s.channel, s);
    this.counters.stats++;
  }

  applyAlert(a) {
    this.alerts.push(a);
    cap(this.alerts, config.history.alerts);
    // An alert and its resolution share a key, so the active set stays small.
    if (a.resolved) this.activeAlerts.delete(a.key);
    else this.activeAlerts.set(a.key, a);
    this.counters.alerts++;
  }

  applyEvent(e) {
    this.events.push(e);
    cap(this.events, config.history.events);
    this.counters.events++;
  }

  applyMetrics(m) {
    this.metrics.push(m);
    cap(this.metrics, config.history.metrics);
    this.counters.metrics++;
  }

  /** Everything a freshly connected dashboard needs to render immediately. */
  snapshot() {
    return {
      type: 'snapshot',
      data: {
        position: this.position,
        track: this.track,
        channels: [...this.channels.values()],
        channelHistory: Object.fromEntries(this.channelHistory),
        channelStats: [...this.channelStats.values()],
        alerts: this.alerts.slice(-50),
        activeAlerts: [...this.activeAlerts.values()],
        events: this.events.slice(-50),
        metrics: this.metrics.slice(-60),
        serverTime: Date.now(),
      },
    };
  }
}
