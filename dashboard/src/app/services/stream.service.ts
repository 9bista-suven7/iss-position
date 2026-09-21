import { Injectable, computed, signal } from '@angular/core';
import {
  Alert, ConnectionState, EnrichedPosition, OrbitEvent, Sample, Snapshot,
  StreamFrame, TelemetryEvent, TelemetryStat, TrackPoint, WindowMetrics,
} from '../models/telemetry.models';

/** Keep client-side history bounded; the pipeline is the source of truth. */
const MAX_TRACK = 2000;
const MAX_SAMPLES = 180;
const MAX_ALERTS = 120;
const MAX_EVENTS = 80;
const MAX_METRICS = 120;

const GATEWAY = (globalThis as any).__ISS_GATEWAY__ ?? 'localhost:7300';

function push<T>(arr: T[], item: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(arr.length - max + 1) : arr.slice();
  next.push(item);
  return next;
}

/**
 * Single source of live pipeline state for the whole dashboard.
 *
 * Holds one WebSocket to the gateway and exposes everything as signals, so
 * components re-render only on the slices they actually read.
 */
@Injectable({ providedIn: 'root' })
export class StreamService {
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  readonly connection = signal<ConnectionState>('connecting');
  readonly position = signal<EnrichedPosition | null>(null);
  readonly track = signal<TrackPoint[]>([]);
  readonly channels = signal<Map<string, TelemetryEvent>>(new Map());
  readonly history = signal<Map<string, Sample[]>>(new Map());
  readonly stats = signal<Map<string, TelemetryStat>>(new Map());
  readonly alerts = signal<Alert[]>([]);
  readonly activeAlerts = signal<Alert[]>([]);
  readonly events = signal<OrbitEvent[]>([]);
  readonly metrics = signal<WindowMetrics[]>([]);
  readonly lastFrameAt = signal<number>(0);

  /** Which telemetry source the values are coming from. */
  readonly telemetrySource = computed(() => {
    const first = this.channels().values().next().value as TelemetryEvent | undefined;
    return first?.source ?? 'unknown';
  });

  readonly criticalCount = computed(
    () => this.activeAlerts().filter((a) => a.severity === 'critical').length,
  );
  readonly warningCount = computed(
    () => this.activeAlerts().filter((a) => a.severity === 'warning').length,
  );

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.connection.set(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${GATEWAY}/stream`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.connection.set('live');
    };
    ws.onmessage = (ev) => {
      this.lastFrameAt.set(Date.now());
      try {
        this.apply(JSON.parse(ev.data as string) as StreamFrame);
      } catch {
        /* a single malformed frame must not tear down the socket */
      }
    };
    ws.onclose = () => this.scheduleReconnect();
    ws.onerror = () => ws.close();
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = undefined;
    this.connection.set('offline');
  }

  private scheduleReconnect(): void {
    this.connection.set('reconnecting');
    // Exponential backoff, capped, so a gateway restart is picked up quickly
    // but a long outage does not hammer the network.
    const delay = Math.min(15000, 750 * 2 ** Math.min(this.reconnectAttempts, 5));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private apply(frame: StreamFrame): void {
    switch (frame.type) {
      case 'snapshot':
        this.applySnapshot(frame.data);
        break;
      case 'position':
        this.applyPosition(frame.data);
        break;
      case 'telemetry':
        this.applyTelemetry(frame.data);
        break;
      case 'telemetryStats': {
        const next = new Map(this.stats());
        for (const s of frame.data) next.set(s.channel, s);
        this.stats.set(next);
        break;
      }
      case 'alert':
        this.applyAlert(frame.data);
        break;
      case 'orbitEvent':
        this.events.set(push(this.events(), frame.data, MAX_EVENTS));
        break;
      case 'metrics':
        this.metrics.set(push(this.metrics(), frame.data, MAX_METRICS));
        break;
    }
  }

  private applySnapshot(s: Snapshot): void {
    this.position.set(s.position);
    this.track.set(s.track.slice(-MAX_TRACK));
    this.channels.set(new Map(s.channels.map((c) => [c.channel, c])));
    this.history.set(new Map(
      Object.entries(s.channelHistory).map(([k, v]) => [k, v.slice(-MAX_SAMPLES)]),
    ));
    this.stats.set(new Map(s.channelStats.map((x) => [x.channel, x])));
    this.alerts.set(s.alerts.slice(-MAX_ALERTS));
    this.activeAlerts.set(s.activeAlerts);
    this.events.set(s.events.slice(-MAX_EVENTS));
    this.metrics.set(s.metrics.slice(-MAX_METRICS));
  }

  private applyPosition(p: EnrichedPosition): void {
    this.position.set(p);
    this.track.set(push(this.track(), {
      lat: p.lat, lon: p.lon, t: p.tsMs,
      visibility: p.visibility, altitudeKm: p.altitudeKm,
    }, MAX_TRACK));
  }

  private applyTelemetry(list: TelemetryEvent[]): void {
    const chans = new Map(this.channels());
    const hist = new Map(this.history());
    for (const rec of list) {
      chans.set(rec.channel, rec);
      if (rec.value !== null && rec.value !== undefined) {
        hist.set(rec.channel, push(hist.get(rec.channel) ?? [], { t: rec.tsMs, v: rec.value }, MAX_SAMPLES));
      }
    }
    this.channels.set(chans);
    this.history.set(hist);
  }

  private applyAlert(a: Alert): void {
    this.alerts.set(push(this.alerts(), a, MAX_ALERTS));
    // A resolution shares its key with the alert it clears.
    const active = this.activeAlerts().filter((x) => x.key !== a.key);
    if (!a.resolved) active.push(a);
    this.activeAlerts.set(active);
  }
}
