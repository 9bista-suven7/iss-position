package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/**
 * A position sample after stateful enrichment: derived motion, orbit counting,
 * illumination phase and observer geometry.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class EnrichedPosition implements Serializable {
    public String craft;
    public double lat;
    public double lon;
    public double altitudeKm;
    public double velocityKmh;
    public String visibility;
    public double footprintKm;
    public long tsMs;
    public long ingestTsMs;

    /** Sub-solar point, carried through so the UI can draw the terminator. */
    public double solarLat;
    public double solarLon;

    /** Great-circle distance from the previous sample, in km. */
    public double segmentKm;
    /**
     * Ground-track speed derived from consecutive fixes, km/h.
     *
     * This is deliberately NOT the same number as {@link #velocityKmh}. The
     * reported orbital velocity is measured in the inertial frame; this value
     * is the speed of the sub-satellite point across an Earth-fixed grid, so
     * it is scaled by R/(R+h) and further reduced by the earth's own rotation
     * where the track runs eastward. Around 24,800 km/h at mid-latitudes
     * against a 27,600 km/h orbital velocity is correct, not a defect.
     */
    public double groundSpeedKmh;
    /** Cumulative ground track distance since the job started, km. */
    public double cumulativeKm;
    /** Heading over ground, degrees clockwise from north. */
    public double headingDeg;
    /** Altitude change rate, metres per second. */
    public double altitudeRateMs;

    /** Orbit number since the job started, incremented at northbound equator crossings. */
    public long orbitNumber;
    /** Fraction [0,1) through the current orbit, by time. */
    public double orbitProgress;

    /** Seconds spent in the current illumination phase. */
    public long phaseSeconds;
    /** Coarse region label for the sub-satellite point. */
    public String region;
    /** True when the sub-satellite point is over open ocean. */
    public boolean overOcean;

    /** Great-circle distance to the configured observer, km. */
    public double observerDistanceKm;
    /** True when the observer falls inside the station's visibility footprint. */
    public boolean observerInFootprint;
    /** Approximate elevation of the station above the observer's horizon, degrees. */
    public double observerElevationDeg;

    /** End-to-end latency from measurement to enrichment, ms. */
    public long pipelineLatencyMs;

    public EnrichedPosition() {}
}
