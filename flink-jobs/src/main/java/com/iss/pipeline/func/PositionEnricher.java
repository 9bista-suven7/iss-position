package com.iss.pipeline.func;

import com.iss.pipeline.model.EnrichedPosition;
import com.iss.pipeline.model.OrbitEvent;
import com.iss.pipeline.model.PositionEvent;
import com.iss.pipeline.util.Geo;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

/**
 * Turns a bare position fix into a derived view of the orbit.
 *
 * Keyed by craft, so all state here describes a single vehicle: the previous
 * fix, the running ground track, the orbit counter and the current
 * illumination phase. Discrete moments (equator crossings, terminator
 * crossings, region changes) go to a side output.
 */
public class PositionEnricher extends KeyedProcessFunction<String, PositionEvent, EnrichedPosition> {

    /** Mean ISS orbital period, used only to express progress through an orbit. */
    private static final double ORBIT_PERIOD_MS = 92.68 * 60_000.0;
    /** Beyond this gap the previous fix is too old to derive motion from. */
    private static final long MAX_GAP_MS = 600_000L;

    private final OutputTag<OrbitEvent> eventTag;
    private final double observerLat;
    private final double observerLon;

    private transient ValueState<PositionEvent> previous;
    private transient ValueState<Double> cumulativeKm;
    private transient ValueState<Long> orbitNumber;
    private transient ValueState<Long> orbitStartMs;
    private transient ValueState<String> phase;
    private transient ValueState<Long> phaseStartMs;
    private transient ValueState<String> lastRegion;

    public PositionEnricher(OutputTag<OrbitEvent> eventTag, double observerLat, double observerLon) {
        this.eventTag = eventTag;
        this.observerLat = observerLat;
        this.observerLon = observerLon;
    }

    @Override
    public void open(Configuration parameters) {
        previous = getRuntimeContext().getState(
                new ValueStateDescriptor<>("previous-position", PositionEvent.class));
        cumulativeKm = getRuntimeContext().getState(
                new ValueStateDescriptor<>("cumulative-km", Double.class));
        orbitNumber = getRuntimeContext().getState(
                new ValueStateDescriptor<>("orbit-number", Long.class));
        orbitStartMs = getRuntimeContext().getState(
                new ValueStateDescriptor<>("orbit-start-ms", Long.class));
        phase = getRuntimeContext().getState(
                new ValueStateDescriptor<>("illumination-phase", String.class));
        phaseStartMs = getRuntimeContext().getState(
                new ValueStateDescriptor<>("phase-start-ms", Long.class));
        lastRegion = getRuntimeContext().getState(
                new ValueStateDescriptor<>("last-region", String.class));
    }

    @Override
    public void processElement(PositionEvent in, Context ctx, Collector<EnrichedPosition> out)
            throws Exception {

        PositionEvent prev = previous.value();
        EnrichedPosition e = new EnrichedPosition();
        e.craft = in.craft;
        e.lat = in.lat;
        e.lon = in.lon;
        e.altitudeKm = in.altitudeKm;
        e.velocityKmh = in.velocityKmh;
        e.visibility = in.visibility;
        e.footprintKm = in.footprintKm;
        e.tsMs = in.tsMs;
        e.ingestTsMs = in.ingestTsMs;
        e.solarLat = in.solarLat;
        e.solarLon = in.solarLon;
        e.pipelineLatencyMs = Math.max(0, System.currentTimeMillis() - in.tsMs);

        // ---- derived motion ------------------------------------------------
        long dtMs = prev == null ? 0 : in.tsMs - prev.tsMs;
        boolean usablePrev = prev != null && dtMs > 0 && dtMs <= MAX_GAP_MS;

        if (usablePrev) {
            double seg = Geo.haversineKm(prev.lat, prev.lon, in.lat, in.lon);
            e.segmentKm = seg;
            e.groundSpeedKmh = seg / (dtMs / 3_600_000.0);
            e.headingDeg = Geo.bearingDeg(prev.lat, prev.lon, in.lat, in.lon);
            e.altitudeRateMs = (in.altitudeKm - prev.altitudeKm) * 1000.0 / (dtMs / 1000.0);
        }

        double cum = cumulativeKm.value() == null ? 0.0 : cumulativeKm.value();
        cum += e.segmentKm;
        e.cumulativeKm = cum;
        cumulativeKm.update(cum);

        // ---- orbit counting -------------------------------------------------
        long orbit = orbitNumber.value() == null ? 1L : orbitNumber.value();
        Long orbitStart = orbitStartMs.value();
        if (orbitStart == null) {
            orbitStart = in.tsMs;
        }
        // A northbound equator crossing marks the start of a new orbit.
        if (usablePrev && prev.lat < 0 && in.lat >= 0) {
            orbit += 1;
            orbitStart = in.tsMs;
            OrbitEvent ev = new OrbitEvent("EQUATOR_CROSSING", in.craft, in.tsMs,
                    in.lat, in.lon, in.altitudeKm, orbit,
                    String.format("Ascending node at %.2f° longitude", in.lon));
            ctx.output(eventTag, ev);
        }
        orbitNumber.update(orbit);
        orbitStartMs.update(orbitStart);
        e.orbitNumber = orbit;
        double progress = (in.tsMs - orbitStart) / ORBIT_PERIOD_MS;
        e.orbitProgress = Math.max(0.0, Math.min(1.0, progress));

        // ---- illumination phase ---------------------------------------------
        String currentPhase = in.visibility == null ? "unknown" : in.visibility;
        String prevPhase = phase.value();
        Long phaseStart = phaseStartMs.value();
        if (prevPhase == null || phaseStart == null) {
            prevPhase = currentPhase;
            phaseStart = in.tsMs;
        } else if (!prevPhase.equals(currentPhase)) {
            long previousPhaseSeconds = Math.max(0, (in.tsMs - phaseStart) / 1000);
            boolean intoDaylight = !"eclipsed".equalsIgnoreCase(currentPhase);
            OrbitEvent ev = new OrbitEvent(
                    intoDaylight ? "ORBITAL_SUNRISE" : "ORBITAL_SUNSET",
                    in.craft, in.tsMs, in.lat, in.lon, in.altitudeKm, orbit,
                    intoDaylight
                            ? "Entered sunlight after " + previousPhaseSeconds + "s in eclipse"
                            : "Entered eclipse after " + previousPhaseSeconds + "s in sunlight");
            ev.previousPhaseSeconds = previousPhaseSeconds;
            ctx.output(eventTag, ev);
            prevPhase = currentPhase;
            phaseStart = in.tsMs;
        }
        phase.update(prevPhase);
        phaseStartMs.update(phaseStart);
        e.phaseSeconds = Math.max(0, (in.tsMs - phaseStart) / 1000);

        // ---- region ----------------------------------------------------------
        e.region = Geo.region(in.lat, in.lon);
        e.overOcean = Geo.isOcean(e.region);
        String prevRegion = lastRegion.value();
        if (prevRegion != null && !prevRegion.equals(e.region)) {
            ctx.output(eventTag, new OrbitEvent("REGION_CHANGE", in.craft, in.tsMs,
                    in.lat, in.lon, in.altitudeKm, orbit,
                    "Now over " + e.region + " (from " + prevRegion + ")"));
        }
        lastRegion.update(e.region);

        // ---- observer geometry -----------------------------------------------
        double dist = Geo.haversineKm(observerLat, observerLon, in.lat, in.lon);
        e.observerDistanceKm = dist;
        e.observerInFootprint = dist <= in.footprintKm / 2.0;
        e.observerElevationDeg = Geo.elevationDeg(dist, in.altitudeKm);

        previous.update(in);
        out.collect(e);
    }
}
