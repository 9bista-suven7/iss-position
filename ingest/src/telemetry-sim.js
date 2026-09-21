// Orbit-aware telemetry simulator.
//
// Used when the live ISSLIVE feed is unavailable. It is driven by the REAL
// position stream, so the values stay physically coherent with where the
// station actually is: solar arrays fall off in eclipse and recover in
// daylight, beta gimbals track the sun, thermal loops lag behind insolation.
// It also injects occasional out-of-nominal excursions so the downstream
// alerting path has something to detect.
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { CHANNELS, MEASUREMENT_PUIS } from './catalog.js';
import { logger } from './log.js';

const log = logger('telemetry-sim');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Per-channel probability per tick. With ~58 channels at 1 Hz this works out
// to roughly one excursion every two minutes across the whole station - enough
// to exercise the alerting path without making every chart a square wave.
const ANOMALY_RATE = Number(process.env.TELEMETRY_SIM_ANOMALY_RATE ?? 0.00015);

/** Groups whose values are angles on a circle rather than bounded magnitudes. */
const WRAPPING_GROUPS = new Set(['arrays', 'joints']);

export class TelemetrySimulator extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    /** Latest real orbital context, fed in from the position stream. */
    this.ctx = { visibility: 'daylight', solarLat: 0, lat: 0, lon: 0, betaAngle: 0 };
    /** Per-channel smoothed state so values walk instead of jumping. */
    this.state = new Map();
    /** pui -> { until:number, offset:number } */
    this.anomalies = new Map();
    this.stats = { emitted: 0, anomalies: 0 };
    this.t0 = Date.now();
  }

  /** Feed the simulator the latest real position sample. */
  updateContext(pos) {
    if (!pos) return;
    this.ctx.visibility = pos.visibility ?? this.ctx.visibility;
    this.ctx.solarLat = pos.solarLat ?? this.ctx.solarLat;
    this.ctx.lat = pos.lat;
    this.ctx.lon = pos.lon;
    // Rough solar beta: the angle between the orbit plane and the sun vector.
    // ISS inclination is 51.64 deg; this approximation is good enough to make
    // the power profile behave sensibly.
    const inc = 51.64;
    this.ctx.betaAngle = clamp(this.ctx.solarLat + inc * Math.sin((pos.lon ?? 0) * Math.PI / 180) * 0.35, -75, 75);
  }

  start() {
    this.timer = setInterval(() => this.#tick(), config.telemetry.simulatorIntervalMs);
    this.timer.unref?.();
    log.info('simulator started', {
      channels: MEASUREMENT_PUIS.length,
      everyMs: config.telemetry.simulatorIntervalMs,
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  #tick() {
    const now = Date.now();
    const sunlit = this.ctx.visibility !== 'eclipsed';
    for (const pui of MEASUREMENT_PUIS) {
      const rec = this.#sample(pui, now, sunlit);
      if (rec) this.emit('record', rec);
    }
  }

  #sample(pui, now, sunlit) {
    const meta = CHANNELS[pui];
    const secs = (now - this.t0) / 1000;
    let value;
    let valueText = null;

    if (meta.discrete) {
      // Discrete state channels sit on a steady value.
      const keys = Object.keys(meta.discrete);
      const pick = meta.channel === 'kuband_transmit'
        ? (sunlit ? '1' : '0')
        : keys[Math.min(keys.length - 1, meta.channel === 'iss_mode' ? 1 : 3)];
      value = Number(pick);
      valueText = meta.discrete[pick] ?? String(pick);
    } else {
      value = this.#numeric(meta, secs, sunlit);
      const anomaly = this.#maybeAnomaly(pui, meta, now);
      if (anomaly !== 0) value += anomaly;
      // A channel counted in whole units ("CMGs online") must never report
      // a fraction, including when an anomaly displaces it.
      value = meta.unit === 'count' ? Math.round(value) : Number(value.toFixed(3));
    }

    this.stats.emitted += 1;
    return {
      pui,
      channel: meta.channel,
      label: meta.label,
      group: meta.group,
      unit: meta.unit,
      value: Number.isFinite(value) ? value : null,
      valueText,
      statusClass: '24',
      nominalMin: meta.nominal ? meta.nominal[0] : null,
      nominalMax: meta.nominal ? meta.nominal[1] : null,
      tsMs: now,
      ingestTsMs: now,
      source: 'simulator',
    };
  }

  #numeric(meta, secs, sunlit) {
    const ch = meta.channel;
    const n = () => (Math.random() - 0.5);
    const prev = this.state.get(ch);
    // First-order smoothing toward the target keeps traces realistic.
    const settle = (target, tau = 0.25, jitter = 0) => {
      const next = prev === undefined ? target : prev + (target - prev) * tau + n() * jitter;
      this.state.set(ch, next);
      return next;
    };

    if (ch.startsWith('voltage_')) {
      // Sunlit: arrays regulate near 160 V. Eclipse: batteries hold ~151 V.
      const base = sunlit ? 160.5 : 151.5;
      return settle(base + n() * 1.2, 0.3, 0.15);
    }
    if (ch.startsWith('current_')) {
      // Channel current scales with how square-on the arrays are to the sun.
      const beta = Math.cos((this.ctx.betaAngle * Math.PI) / 180);
      const base = sunlit ? 55 + 45 * Math.abs(beta) * (0.8 + 0.2 * Math.sin(secs / 90)) : 1.5;
      return settle(clamp(base + n() * 4, -5, 125), 0.25, 0.6);
    }
    if (ch.startsWith('beta_')) {
      // Gimbals rotate continuously to track the sun through the orbit.
      // Channel names are beta_<1..4><a|b>; both parts matter, otherwise the
      // two arrays on a truss pair would report identical angles.
      const num = Number(ch.charAt(5)) || 1;
      const isB = ch.charAt(6) === 'b';
      const idx = (num - 1) * 2 + (isB ? 1 : 0);          // 0..7
      const ang = ((secs / 92 / 60) * 360 + idx * 45 + this.ctx.betaAngle) % 360;
      return ang > 180 ? ang - 360 : ang < -180 ? ang + 360 : ang;
    }
    if (ch === 'psarj' || ch === 'ssarj') {
      // SARJ makes one revolution per ~92 minute orbit.
      return ((secs / (92 * 60)) * 360 + (ch === 'ssarj' ? 180 : 0)) % 360;
    }
    if (ch === 'ptrrj' || ch === 'strrj') return settle(this.ctx.betaAngle * 0.8 + n() * 2, 0.2, 0.3);

    if (ch.endsWith('_flowrate')) return settle(2900 + n() * 60, 0.2, 8);
    if (ch.endsWith('_pressure') && ch.startsWith('loop')) return settle(420 + n() * 15, 0.2, 2);
    if (ch.endsWith('_temp')) {
      // Radiator loops lag insolation by roughly a quarter orbit. Loop B runs
      // slightly warmer and out of phase with loop A - they are separate
      // circuits with different radiator exposure, not copies of each other.
      const isB = ch.startsWith('loopb');
      const th = (sunlit ? 6 : 1.5) + (isB ? 1.8 : 0);
      const phase = isB ? Math.PI / 3 : 0;
      return settle(th + 3 * Math.sin(secs / 300 + phase) + n() * 0.8, 0.12, 0.1);
    }

    if (ch === 'lab_cabin_pressure' || ch === 'airlock_pressure') return settle(742 + n() * 2.5, 0.15, 0.2);
    if (ch === 'crewlock_pressure') return settle(740 + n() * 3, 0.1, 0.2);
    if (ch.endsWith('_ppo2')) return settle(163 + n() * 3, 0.15, 0.2);
    if (ch.endsWith('_ppco2')) {
      // CO2 sawtooths as the scrubber cycles on and off.
      const cycle = (secs % 1800) / 1800;
      return settle(2.4 + 1.5 * cycle + n() * 0.25, 0.2, 0.03);
    }
    if (ch.endsWith('_ppn2')) return settle(575 + n() * 6, 0.15, 0.4);
    if (ch === 'oga_o2_rate') return settle(sunlit ? 5.4 : 2.1, 0.1, 0.05);

    if (ch === 'solar_beta_angle') return Number(this.ctx.betaAngle.toFixed(2));
    if (ch === 'cmg_momentum_pct') return settle(45 + 25 * Math.sin(secs / 420) + n() * 3, 0.15, 0.3);
    if (ch === 'cmg_online_count') return 4;
    if (ch.startsWith('att_error_')) return settle(n() * 1.4, 0.3, 0.12);
    if (ch === 'iss_mass') return settle(ccMass(secs), 0.05, 5);
    if (ch.endsWith('_wheel_speed')) return settle(6600 + n() * 60, 0.1, 3);

    return settle(meta.nominal ? (meta.nominal[0] + meta.nominal[1]) / 2 : 0, 0.2, 0.5);
  }

  /** Occasionally push a channel outside its nominal band for a short while. */
  #maybeAnomaly(pui, meta, now) {
    if (!meta.nominal) return 0;
    // Angles wrap, so their nominal band is the whole circle and *any* offset
    // reads as an excursion. Injecting here would emit a permanent stream of
    // meaningless alerts, so rotating joints and gimbals are left alone.
    if (WRAPPING_GROUPS.has(meta.group)) return 0;
    const active = this.anomalies.get(pui);
    if (active) {
      if (now < active.until) return active.offset;
      this.anomalies.delete(pui);
      return 0;
    }
    if (Math.random() < ANOMALY_RATE) {
      const [lo, hi] = meta.nominal;
      const span = hi - lo;
      const offset = (Math.random() < 0.5 ? -1 : 1) * span * (0.12 + Math.random() * 0.18);
      this.anomalies.set(pui, { until: now + 20_000 + Math.random() * 40_000, offset });
      this.stats.anomalies += 1;
      log.info('injecting anomaly', { channel: meta.channel, offset: Number(offset.toFixed(2)) });
      return offset;
    }
    return 0;
  }
}

// Station mass creeps down as consumables are used and jumps on resupply.
function ccMass(secs) {
  return 419_725 - (secs % 5400) * 0.4;
}
