package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** Windowed aggregate for one telemetry channel. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryStat implements Serializable {
    public String pui;
    public String channel;
    public String label;
    public String group;
    public String unit;

    public long windowStartMs;
    public long windowEndMs;
    public long count;
    public double min;
    public double max;
    public double avg;
    public double stdDev;
    public double last;
    /** Samples in this window that fell outside the nominal band. */
    public long outOfNominalCount;
    public String source;

    public TelemetryStat() {}
}
