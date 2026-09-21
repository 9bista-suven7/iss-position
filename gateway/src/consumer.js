// Consumes the pipeline's output topics and folds them into DashboardState.
import { Kafka, logLevel } from 'kafkajs';
import { EventEmitter } from 'node:events';
import { config } from './config.js';

export class PipelineConsumer extends EventEmitter {
  constructor(state) {
    super();
    this.state = state;
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.NOTHING,
      retry: { initialRetryTime: 300, retries: 10 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
    });
    this.connected = false;
  }

  async start() {
    const t = config.kafka.topics;
    await this.consumer.connect();
    this.connected = true;

    for (const topic of Object.values(t)) {
      // fromBeginning gives a newly started dashboard some immediate context
      // rather than an empty screen; the state caps how much is retained.
      await this.consumer.subscribe({ topic, fromBeginning: true });
    }

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        let payload;
        try {
          payload = JSON.parse(message.value.toString());
        } catch {
          return; // skip unparseable records rather than stalling the group
        }
        switch (topic) {
          case t.position:
            this.state.applyPosition(payload);
            this.emit('position', payload);
            break;
          case t.telemetry:
            this.state.applyTelemetry(payload);
            this.emit('telemetry', payload);
            break;
          case t.telemetryStats:
            this.state.applyTelemetryStat(payload);
            this.emit('telemetryStat', payload);
            break;
          case t.metrics:
            this.state.applyMetrics(payload);
            this.emit('metrics', payload);
            break;
          case t.events:
            this.state.applyEvent(payload);
            this.emit('orbitEvent', payload);
            break;
          case t.alerts:
            this.state.applyAlert(payload);
            this.emit('alert', payload);
            break;
          default:
            break;
        }
      },
    });
  }

  async stop() {
    if (this.connected) await this.consumer.disconnect();
    this.connected = false;
  }
}
