package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** Raw orbital position sample as produced by the ingest service. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PositionEvent implements Serializable {
    public String craft = "iss";
    public int noradId;
    public double lat;
    public double lon;
    public double altitudeKm;
    public double velocityKmh;
    /** "daylight" or "eclipsed". */
    public String visibility;
    public double footprintKm;
    public double solarLat;
    public double solarLon;
    public long tsMs;
    public long ingestTsMs;
    public String source;

    public PositionEvent() {}

    public boolean isEclipsed() {
        return "eclipsed".equalsIgnoreCase(visibility);
    }
}
