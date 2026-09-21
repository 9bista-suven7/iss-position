package com.iss.pipeline;

import com.iss.pipeline.func.ObserverPassDetector;
import com.iss.pipeline.func.PositionEnricher;
import com.iss.pipeline.func.PositionMetricsFunction;
import com.iss.pipeline.func.TelemetryAlerter;
import com.iss.pipeline.func.TelemetryStatsFunction;
import com.iss.pipeline.model.Alert;
import com.iss.pipeline.model.EnrichedPosition;
import com.iss.pipeline.model.OrbitEvent;
import com.iss.pipeline.model.PositionEvent;
import com.iss.pipeline.model.TelemetryEvent;
import com.iss.pipeline.model.TelemetryStat;
import com.iss.pipeline.model.WindowMetrics;
import com.iss.pipeline.util.Json;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.utils.ParameterTool;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;

import org.apache.flink.util.OutputTag;

import java.time.Duration;

/**
 * The ISS streaming pipeline.
 *
 * <pre>
 *   iss.position.raw  ─┬─▶ enrich (stateful) ─┬─▶ iss.position.enriched
 *                      │                      ├─▶ iss.orbit.events   (side output)
 *                      │                      ├─▶ 1 min windows ────▶ iss.metrics.windowed
 *                      │                      └─▶ pass detection ──┐
 *   iss.telemetry.raw ─┴─▶ range alerting ───────────────────────── ┼─▶ iss.alerts
 *                      └─▶ 30 s windows ────────────────────────────┴─▶ iss.telemetry.stats
 * </pre>
 */
public class IssPipelineJob {

    private static final OutputTag<OrbitEvent> ORBIT_EVENTS =
            new OutputTag<>("orbit-events", TypeInformation.of(OrbitEvent.class));

    public static void main(String[] args) throws Exception {
        ParameterTool p = ParameterTool.fromArgs(args);

        final String bootstrap   = p.get("bootstrap", "localhost:9092");
        final String groupId     = p.get("group-id", "iss-flink-pipeline");
        final String tPositionIn = p.get("topic-position-raw", "iss.position.raw");
        final String tTelemIn    = p.get("topic-telemetry-raw", "iss.telemetry.raw");
        final String tPositionOut= p.get("topic-position-enriched", "iss.position.enriched");
        final String tMetrics    = p.get("topic-metrics", "iss.metrics.windowed");
        final String tEvents     = p.get("topic-orbit-events", "iss.orbit.events");
        final String tAlerts     = p.get("topic-alerts", "iss.alerts");
        final String tTelemStats = p.get("topic-telemetry-stats", "iss.telemetry.stats");

        // Ground station the pass detector reports against.
        final double observerLat = p.getDouble("observer-lat", 28.5729);   // Kennedy Space Center
        final double observerLon = p.getDouble("observer-lon", -80.6490);
        final double minElevation= p.getDouble("min-elevation-deg", 10.0);

        final int positionWindowS = p.getInt("position-window-seconds", 60);
        final int telemetryWindowS= p.getInt("telemetry-window-seconds", 30);
        final int breachesToRaise = p.getInt("breaches-to-raise", 3);
        final int samplesToClear  = p.getInt("samples-to-clear", 5);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(30_000);
        env.getConfig().setGlobalJobParameters(p);

        // ---- sources ---------------------------------------------------------
        // Idleness matters: the telemetry topic has several partitions and a
        // quiet one would otherwise hold the watermark back and stall windows.
        WatermarkStrategy<PositionEvent> positionWm = WatermarkStrategy
                .<PositionEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((e, ts) -> e.tsMs)
                .withIdleness(Duration.ofSeconds(15));

        WatermarkStrategy<TelemetryEvent> telemetryWm = WatermarkStrategy
                .<TelemetryEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((e, ts) -> e.tsMs)
                .withIdleness(Duration.ofSeconds(15));

        KafkaSource<PositionEvent> positionSource = KafkaSource.<PositionEvent>builder()
                .setBootstrapServers(bootstrap)
                .setTopics(tPositionIn)
                .setGroupId(groupId + "-position")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(Json.deserializer(PositionEvent.class))
                .build();

        KafkaSource<TelemetryEvent> telemetrySource = KafkaSource.<TelemetryEvent>builder()
                .setBootstrapServers(bootstrap)
                .setTopics(tTelemIn)
                .setGroupId(groupId + "-telemetry")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(Json.deserializer(TelemetryEvent.class))
                .build();

        DataStream<PositionEvent> positions = env
                .fromSource(positionSource, positionWm, "kafka: " + tPositionIn)
                .filter(e -> e != null && Double.isFinite(e.lat) && Double.isFinite(e.lon))
                .name("drop malformed positions");

        DataStream<TelemetryEvent> telemetry = env
                .fromSource(telemetrySource, telemetryWm, "kafka: " + tTelemIn)
                .filter(e -> e != null && e.channel != null)
                .name("drop malformed telemetry");

        // ---- position enrichment ---------------------------------------------
        SingleOutputStreamOperator<EnrichedPosition> enriched = positions
                .keyBy(e -> e.craft)
                .process(new PositionEnricher(ORBIT_EVENTS, observerLat, observerLon))
                .name("enrich position");

        enriched.sinkTo(sink(bootstrap, tPositionOut, (EnrichedPosition e) -> e.craft))
                .name("sink: " + tPositionOut);

        enriched.getSideOutput(ORBIT_EVENTS)
                .sinkTo(sink(bootstrap, tEvents, (OrbitEvent e) -> e.craft))
                .name("sink: " + tEvents);

        // ---- windowed orbital metrics ----------------------------------------
        enriched
                .keyBy(e -> e.craft)
                .window(TumblingEventTimeWindows.of(Duration.ofSeconds(positionWindowS)))
                .process(new PositionMetricsFunction())
                .name("orbital metrics / " + positionWindowS + "s")
                .sinkTo(sink(bootstrap, tMetrics, (WindowMetrics m) -> m.craft))
                .name("sink: " + tMetrics);

        // ---- windowed telemetry statistics -----------------------------------
        telemetry
                .keyBy(e -> e.channel)
                .window(TumblingEventTimeWindows.of(Duration.ofSeconds(telemetryWindowS)))
                .process(new TelemetryStatsFunction())
                .name("telemetry stats / " + telemetryWindowS + "s")
                .sinkTo(sink(bootstrap, tTelemStats, (TelemetryStat s) -> s.channel))
                .name("sink: " + tTelemStats);

        // ---- alerts -----------------------------------------------------------
        DataStream<Alert> rangeAlerts = telemetry
                .keyBy(e -> e.channel)
                .process(new TelemetryAlerter(breachesToRaise, samplesToClear))
                .name("telemetry range alerts");

        DataStream<Alert> passAlerts = enriched
                .keyBy(e -> e.craft)
                .process(new ObserverPassDetector(minElevation))
                .name("observer pass alerts");

        rangeAlerts.union(passAlerts)
                .sinkTo(sink(bootstrap, tAlerts, (Alert a) -> a.key))
                .name("sink: " + tAlerts);

        env.execute("ISS Live Telemetry Pipeline");
    }

    /** Builds a keyed JSON Kafka sink. */
    private static <T> KafkaSink<T> sink(String bootstrap, String topic, Json.KeyExtractor<T> key) {
        return KafkaSink.<T>builder()
                .setBootstrapServers(bootstrap)
                .setRecordSerializer(KafkaRecordSerializationSchema.<T>builder()
                        .setTopic(topic)
                        .setKeySerializationSchema(Json.keySerializer(key))
                        .setValueSerializationSchema(Json.<T>serializer())
                        .build())
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .build();
    }
}
