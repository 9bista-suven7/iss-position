package com.iss.pipeline.func;

import com.iss.pipeline.model.Alert;
import com.iss.pipeline.model.TelemetryEvent;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/**
 * Raises an alert when a channel leaves its nominal band, and clears it when
 * the channel comes back.
 *
 * A single stray sample is not an excursion, so a channel must breach for
 * {@code breachesToRaise} consecutive samples before an alert fires, and
 * recover for {@code samplesToClear} before it clears. That hysteresis is what
 * keeps a noisy channel sitting on its limit from flapping the alert feed.
 */
public class TelemetryAlerter extends KeyedProcessFunction<String, TelemetryEvent, Alert> {

    private final int breachesToRaise;
    private final int samplesToClear;

    private transient ValueState<Integer> consecutiveBreaches;
    private transient ValueState<Integer> consecutiveOk;
    private transient ValueState<Boolean> alerting;

    public TelemetryAlerter(int breachesToRaise, int samplesToClear) {
        this.breachesToRaise = breachesToRaise;
        this.samplesToClear = samplesToClear;
    }

    @Override
    public void open(Configuration parameters) {
        consecutiveBreaches = getRuntimeContext().getState(
                new ValueStateDescriptor<>("consecutive-breaches", Integer.class));
        consecutiveOk = getRuntimeContext().getState(
                new ValueStateDescriptor<>("consecutive-ok", Integer.class));
        alerting = getRuntimeContext().getState(
                new ValueStateDescriptor<>("alerting", Boolean.class));
    }

    @Override
    public void processElement(TelemetryEvent in, Context ctx, Collector<Alert> out)
            throws Exception {

        if (in.value == null || in.nominalMin == null || in.nominalMax == null) return;

        boolean active = Boolean.TRUE.equals(alerting.value());
        int breaches = consecutiveBreaches.value() == null ? 0 : consecutiveBreaches.value();
        int ok = consecutiveOk.value() == null ? 0 : consecutiveOk.value();

        if (in.isOutOfNominal()) {
            breaches += 1;
            ok = 0;
            if (!active && breaches >= breachesToRaise) {
                out.collect(build(in, false));
                alerting.update(true);
            }
        } else {
            ok += 1;
            breaches = 0;
            if (active && ok >= samplesToClear) {
                out.collect(build(in, true));
                alerting.update(false);
            }
        }

        consecutiveBreaches.update(breaches);
        consecutiveOk.update(ok);
    }

    private Alert build(TelemetryEvent in, boolean resolved) {
        Alert a = new Alert();
        a.key = "telemetry:" + in.channel;
        a.type = resolved ? "TELEMETRY_RECOVERED" : "TELEMETRY_OUT_OF_RANGE";
        a.channel = in.channel;
        a.group = in.group;
        a.value = in.value;
        a.nominalMin = in.nominalMin;
        a.nominalMax = in.nominalMax;
        a.unit = in.unit;
        a.tsMs = in.tsMs;
        a.resolved = resolved;

        if (resolved) {
            a.severity = "info";
            a.title = in.label + " back in range";
            a.message = String.format("%s returned to nominal at %.2f %s",
                    in.label, in.value, in.unit);
        } else {
            double over = in.value > in.nominalMax
                    ? in.value - in.nominalMax
                    : in.nominalMin - in.value;
            double span = Math.max(1e-9, in.nominalMax - in.nominalMin);
            // Far outside the band is treated as critical rather than a warning.
            a.severity = (over / span) > 0.15 ? "critical" : "warning";
            a.title = in.label + " out of range";
            a.message = String.format("%s is %.2f %s, outside nominal %.2f–%.2f %s",
                    in.label, in.value, in.unit, in.nominalMin, in.nominalMax, in.unit);
        }
        return a;
    }
}
