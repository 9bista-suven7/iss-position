// Subscribes to NASA's public ISSLIVE Lightstreamer feed and emits normalized
// telemetry records.
//
// NOTE: the public feed goes quiet during loss-of-signal windows, and has had
// extended outages. `isSilent()` lets the supervisor decide when to fall back
// to the simulator; the moment real data resumes the supervisor switches back.
import { EventEmitter } from 'node:events';
import ls from 'lightstreamer-client-node';
import { config } from './config.js';
import { CHANNELS, ALL_PUIS, decodeIssTimestamp } from './catalog.js';
import { logger } from './log.js';

const { LightstreamerClient, Subscription } = ls.default || ls;
const log = logger('telemetry-live');

export class TelemetrySource extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.status = 'DISCONNECTED';
    this.lastUpdateMs = 0;
    this.stats = { updates: 0, channels: new Set(), subscribed: false };
  }

  start() {
    this.client = new LightstreamerClient(config.telemetry.serverUrl, config.telemetry.adapterSet);
    // The ISS feed publishes faster than the default throttle expects.
    this.client.connectionOptions.setSlowingEnabled(false);

    this.client.addListener({
      onStatusChange: (s) => {
        this.status = s;
        log.info('client status', { status: s });
        this.emit('status', s);
      },
      onServerError: (code, msg) => log.error('server error', { code, msg }),
    });

    const sub = new Subscription('MERGE', ALL_PUIS, ['TimeStamp', 'Value', 'Status.Class']);
    sub.addListener({
      onSubscription: () => {
        this.stats.subscribed = true;
        log.info('subscribed', { channels: ALL_PUIS.length });
      },
      onSubscriptionError: (code, msg) => log.error('subscription error', { code, msg }),
      onItemUpdate: (u) => this.#onUpdate(u),
    });

    // The ISSLIVE adapter expects the subscription to be registered before the
    // client connects.
    this.client.subscribe(sub);
    this.client.connect();
    this.subscription = sub;
  }

  #onUpdate(update) {
    const pui = update.getItemName();
    const meta = CHANNELS[pui];
    if (!meta) return;

    const raw = update.getValue('Value');
    const tsRaw = Number(update.getValue('TimeStamp'));
    const ingestTsMs = Date.now();
    const numeric = Number(raw);
    const value = Number.isFinite(numeric) ? numeric : null;

    this.lastUpdateMs = ingestTsMs;
    this.stats.updates += 1;
    this.stats.channels.add(pui);

    this.emit('record', {
      pui,
      channel: meta.channel,
      label: meta.label,
      group: meta.group,
      unit: meta.unit,
      value,
      valueText: meta.discrete ? (meta.discrete[String(raw)] ?? String(raw)) : null,
      statusClass: update.getValue('Status.Class') ?? null,
      nominalMin: meta.nominal ? meta.nominal[0] : null,
      nominalMax: meta.nominal ? meta.nominal[1] : null,
      tsMs: decodeIssTimestamp(tsRaw, ingestTsMs),
      ingestTsMs,
      source: 'isslive',
    });
  }

  /** True when the live feed has produced nothing for longer than the threshold. */
  isSilent(thresholdMs = config.telemetry.silenceFallbackMs) {
    return Date.now() - (this.lastUpdateMs || 0) > thresholdMs;
  }

  stop() {
    try {
      if (this.subscription) this.client?.unsubscribe(this.subscription);
      this.client?.disconnect();
    } catch (e) {
      log.warn('error during shutdown', { err: e.message });
    }
  }
}
