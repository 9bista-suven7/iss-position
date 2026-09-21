package com.iss.pipeline.func;

import com.iss.pipeline.model.Alert;
import com.iss.pipeline.model.EnrichedPosition;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/**
 * Emits an alert when the station rises above the observer's horizon and
 * another when it sets. Edge-triggered on the elevation sign, so exactly one
 * alert is produced per transition.
 */
public class ObserverPassDetector extends KeyedProcessFunction<String, EnrichedPosition, Alert> {

    /** Below this elevation a pass is not practically observable. */
    private final double minElevationDeg;

    private transient ValueState<Boolean> abovePreviously;
    private transient ValueState<Double> maxElevationThisPass;
    private transient ValueState<Long> passStartMs;

    public ObserverPassDetector(double minElevationDeg) {
        this.minElevationDeg = minElevationDeg;
    }

    @Override
    public void open(Configuration parameters) {
        abovePreviously = getRuntimeContext().getState(
                new ValueStateDescriptor<>("above-horizon", Boolean.class));
        maxElevationThisPass = getRuntimeContext().getState(
                new ValueStateDescriptor<>("max-elevation", Double.class));
        passStartMs = getRuntimeContext().getState(
                new ValueStateDescriptor<>("pass-start", Long.class));
    }

    @Override
    public void processElement(EnrichedPosition in, Context ctx, Collector<Alert> out)
            throws Exception {

        boolean above = in.observerElevationDeg >= minElevationDeg;
        boolean wasAbove = Boolean.TRUE.equals(abovePreviously.value());

        if (above && !wasAbove) {
            passStartMs.update(in.tsMs);
            maxElevationThisPass.update(in.observerElevationDeg);

            Alert a = new Alert();
            a.key = "pass:" + in.craft;
            a.type = "OBSERVER_PASS";
            a.severity = "info";
            a.title = "ISS pass starting";
            a.message = String.format(
                    "Station is above your horizon: %.1f° elevation, %.0f km away, over %s",
                    in.observerElevationDeg, in.observerDistanceKm, in.region);
            a.tsMs = in.tsMs;
            out.collect(a);

        } else if (above) {
            Double peak = maxElevationThisPass.value();
            if (peak == null || in.observerElevationDeg > peak) {
                maxElevationThisPass.update(in.observerElevationDeg);
            }

        } else if (wasAbove) {
            Double peak = maxElevationThisPass.value();
            Long start = passStartMs.value();
            long durationS = start == null ? 0 : Math.max(0, (in.tsMs - start) / 1000);

            Alert a = new Alert();
            a.key = "pass:" + in.craft;
            a.type = "OBSERVER_PASS";
            a.severity = "info";
            a.title = "ISS pass ended";
            a.message = String.format(
                    "Pass lasted %ds with a peak elevation of %.1f°",
                    durationS, peak == null ? 0.0 : peak);
            a.tsMs = in.tsMs;
            a.resolved = true;
            out.collect(a);

            maxElevationThisPass.clear();
            passStartMs.clear();
        }

        abovePreviously.update(above);
    }
}
