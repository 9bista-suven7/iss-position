package com.iss.pipeline.func;

import com.iss.pipeline.model.TelemetryEvent;
import com.iss.pipeline.model.TelemetryStat;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

/**
 * Summarises one channel over one window: count, extremes, mean, population
 * standard deviation and how many samples breached the nominal band.
 */
public class TelemetryStatsFunction
        extends ProcessWindowFunction<TelemetryEvent, TelemetryStat, String, TimeWindow> {

    @Override
    public void process(String channel, Context ctx,
                        Iterable<TelemetryEvent> elements,
                        Collector<TelemetryStat> out) {

        long count = 0;
        long breaches = 0;
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0.0;
        double sumSquares = 0.0;
        TelemetryEvent last = null;

        for (TelemetryEvent e : elements) {
            last = e;
            if (e.value == null || !Double.isFinite(e.value)) continue;
            count++;
            double v = e.value;
            sum += v;
            sumSquares += v * v;
            if (v < min) min = v;
            if (v > max) max = v;
            if (e.isOutOfNominal()) breaches++;
        }

        // A window of only non-numeric samples (discrete/state channels) has
        // nothing to summarise.
        if (count == 0 || last == null) return;

        double mean = sum / count;
        double variance = Math.max(0.0, (sumSquares / count) - (mean * mean));

        TelemetryStat s = new TelemetryStat();
        s.pui = last.pui;
        s.channel = channel;
        s.label = last.label;
        s.group = last.group;
        s.unit = last.unit;
        s.source = last.source;
        s.windowStartMs = ctx.window().getStart();
        s.windowEndMs = ctx.window().getEnd();
        s.count = count;
        s.min = min;
        s.max = max;
        s.avg = round(mean);
        s.stdDev = round(Math.sqrt(variance));
        s.last = last.value == null ? mean : last.value;
        s.outOfNominalCount = breaches;
        out.collect(s);
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
