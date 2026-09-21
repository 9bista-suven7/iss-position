// Polls the public ISS orbital-position API and emits normalized records.
// Backs off exponentially on failure so a flaky network never hammers the API.
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { logger } from './log.js';

const log = logger('position');

export class PositionSource extends EventEmitter {
  constructor() {
    super();
    this.stopped = false;
    this.backoffMs = 0;
    this.stats = { polls: 0, ok: 0, failed: 0, lastTsMs: null };
  }

  start() {
    this.stopped = false;
    this.#loop();
    log.info('polling started', { url: config.position.url, everyMs: config.position.pollMs });
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async #loop() {
    if (this.stopped) return;
    const started = Date.now();
    try {
      const rec = await this.#fetchOnce();
      this.stats.ok += 1;
      this.stats.lastTsMs = rec.tsMs;
      this.backoffMs = 0;
      this.emit('record', rec);
    } catch (err) {
      this.stats.failed += 1;
      this.backoffMs = this.backoffMs
        ? Math.min(this.backoffMs * 2, config.position.maxBackoffMs)
        : 2000;
      log.warn('poll failed, backing off', { err: err.message, backoffMs: this.backoffMs });
    } finally {
      this.stats.polls += 1;
      if (!this.stopped) {
        const elapsed = Date.now() - started;
        const wait = Math.max(0, (this.backoffMs || config.position.pollMs) - elapsed);
        this.timer = setTimeout(() => this.#loop(), wait);
        this.timer.unref?.();
      }
    }
  }

  async #fetchOnce() {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), config.position.timeoutMs);
    try {
      const res = await fetch(config.position.url, {
        signal: ac.signal,
        headers: { accept: 'application/json', 'user-agent': 'iss-stream-dashboard/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) {
        throw new Error('malformed payload: missing coordinates');
      }
      const ingestTsMs = Date.now();
      return {
        craft: 'iss',
        noradId: d.id ?? 25544,
        lat: d.latitude,
        lon: d.longitude,
        altitudeKm: d.altitude,
        velocityKmh: d.velocity,
        visibility: d.visibility,          // 'daylight' | 'eclipsed'
        footprintKm: d.footprint,
        solarLat: d.solar_lat,
        solarLon: d.solar_lon,
        tsMs: (d.timestamp ?? Math.floor(ingestTsMs / 1000)) * 1000,
        ingestTsMs,
        source: 'wheretheiss.at',
      };
    } finally {
      clearTimeout(t);
    }
  }
}
