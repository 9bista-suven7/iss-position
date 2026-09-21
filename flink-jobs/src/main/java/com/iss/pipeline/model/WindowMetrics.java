package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** Tumbling-window summary of the orbital motion. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class WindowMetrics implements Serializable {
    public String craft;
    public long windowStartMs;
    public long windowEndMs;
    public long samples;

    public double avgAltitudeKm;
    public double minAltitudeKm;
    public double maxAltitudeKm;
    public double avgVelocityKmh;
    public double minVelocityKmh;
    public double maxVelocityKmh;
    /** Ground distance covered during the window, km. */
    public double distanceKm;
    /** Share of the window spent in sunlight, 0..1. */
    public double daylightFraction;

    public WindowMetrics() {}
}
