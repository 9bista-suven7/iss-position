package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** One telemetry sample for a single channel. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryEvent implements Serializable {
    /** NASA Program Unique Identifier, e.g. S4000001. */
    public String pui;
    /** Stable short name, e.g. voltage_1a. */
    public String channel;
    public String label;
    /** power | arrays | joints | thermal | atmosphere | gnc | state | signal */
    public String group;
    public String unit;
    public Double value;
    /** Decoded text for discrete/state channels. */
    public String valueText;
    public String statusClass;
    public Double nominalMin;
    public Double nominalMax;
    public long tsMs;
    public long ingestTsMs;
    /** "isslive" or "simulator". */
    public String source;

    public TelemetryEvent() {}

    /** True when a numeric value sits outside its declared nominal band. */
    public boolean isOutOfNominal() {
        if (value == null || nominalMin == null || nominalMax == null) return false;
        return value < nominalMin || value > nominalMax;
    }
}
