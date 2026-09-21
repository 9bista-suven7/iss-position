// Buffered Kafka producer. Callers push records; the buffer is flushed on a
// timer or when it grows past maxBatchSize, so a 1 Hz position feed and a
// bursty telemetry feed can share one producer cheaply.
import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { config } from './config.js';
import { logger } from './log.js';

const log = logger('kafka');

export class KafkaPublisher {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.NOTHING,
      retry: { initialRetryTime: 300, retries: 10 },
    });
    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
      allowAutoTopicCreation: false,
    });
    /** @type {Map<string, Array<{key:string,value:string}>>} */
    this.buffers = new Map();
    this.timer = null;
    this.connected = false;
    this.stats = { produced: 0, failed: 0, flushes: 0 };
  }

  async connect() {
    await this.producer.connect();
    this.connected = true;
    log.info('producer connected', { brokers: config.kafka.brokers });
    this.timer = setInterval(() => {
      this.flush().catch((e) => log.error('scheduled flush failed', { err: e.message }));
    }, config.kafka.flushIntervalMs);
    this.timer.unref?.();
  }

  /** Queue one record. `key` decides the partition, so keep it stable per entity. */
  publish(topic, key, payload) {
    if (!this.buffers.has(topic)) this.buffers.set(topic, []);
    const buf = this.buffers.get(topic);
    buf.push({ key: String(key), value: JSON.stringify(payload) });
    if (buf.length >= config.kafka.maxBatchSize) {
      this.flush().catch((e) => log.error('size flush failed', { err: e.message }));
    }
  }

  async flush() {
    if (!this.connected) return;
    const batches = [];
    for (const [topic, messages] of this.buffers) {
      if (messages.length === 0) continue;
      batches.push({ topic, messages: messages.splice(0, messages.length) });
    }
    if (batches.length === 0) return;

    const count = batches.reduce((n, b) => n + b.messages.length, 0);
    try {
      await this.producer.sendBatch({ topicMessages: batches, acks: 1 });
      this.stats.produced += count;
      this.stats.flushes += 1;
      log.debug('flushed', { records: count, topics: batches.length });
    } catch (err) {
      this.stats.failed += count;
      log.error('send failed, records dropped', { records: count, err: err.message });
    }
  }

  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.flush().catch(() => {});
    if (this.connected) await this.producer.disconnect();
    this.connected = false;
    log.info('producer closed', this.stats);
  }
}
