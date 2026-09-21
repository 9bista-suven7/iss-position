package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** An operator-facing alert raised by the pipeline. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class Alert implements Serializable {
    /** Stable identity for de-duplication in the UI, e.g. "telemetry:voltage_1a". */
    public String key;
    /** TELEMETRY_OUT_OF_RANGE | TELEMETRY_RECOVERED | OBSERVER_PASS | FEED_STALE */
    public String type;
    /** info | warning | critical */
    public String severity;
    public String title;
    public String message;
    public String channel;
    public String group;
    public Double value;
    public Double nominalMin;
    public Double nominalMax;
    public String unit;
    public long tsMs;
    /** True when this alert clears a previously raised one. */
    public boolean resolved;

    public Alert() {}
}
