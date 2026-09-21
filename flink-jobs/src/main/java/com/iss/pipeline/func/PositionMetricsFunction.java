package com.iss.pipeline.func;

import com.iss.pipeline.model.EnrichedPosition;
import com.iss.pipeline.model.WindowMetrics;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

/** Tumbling-window rollup of the orbital motion. */
public class PositionMetricsFunction
        extends ProcessWindowFunction<EnrichedPosition, WindowMetrics, String, TimeWindow> {

    @Override
    public void process(String craft, Context ctx,
                        Iterable<EnrichedPosition> elements,
                        Collector<WindowMetrics> out) {

        long samples = 0;
        long daylight = 0;
        double altSum = 0, velSum = 0, distance = 0;
        double altMin = Double.POSITIVE_INFINITY, altMax = Double.NEGATIVE_INFINITY;
        double velMin = Double.POSITIVE_INFINITY, velMax = Double.NEGATIVE_INFINITY;

        for (EnrichedPosition e : elements) {
            samples++;
            altSum += e.altitudeKm;
            velSum += e.velocityKmh;
            distance += e.segmentKm;
            altMin = Math.min(altMin, e.altitudeKm);
            altMax = Math.max(altMax, e.altitudeKm);
            velMin = Math.min(velMin, e.velocityKmh);
            velMax = Math.max(velMax, e.velocityKmh);
            if (!"eclipsed".equalsIgnoreCase(e.visibility)) daylight++;
        }
        if (samples == 0) return;

        WindowMetrics m = new WindowMetrics();
        m.craft = craft;
        m.windowStartMs = ctx.window().getStart();
        m.windowEndMs = ctx.window().getEnd();
        m.samples = samples;
        m.avgAltitudeKm = round(altSum / samples);
        m.minAltitudeKm = round(altMin);
        m.maxAltitudeKm = round(altMax);
        m.avgVelocityKmh = round(velSum / samples);
        m.minVelocityKmh = round(velMin);
        m.maxVelocityKmh = round(velMax);
        m.distanceKm = round(distance);
        m.daylightFraction = round((double) daylight / samples);
        out.collect(m);
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
