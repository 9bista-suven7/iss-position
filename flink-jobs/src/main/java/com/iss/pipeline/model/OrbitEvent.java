package com.iss.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;

/** A discrete moment of interest along the orbit. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrbitEvent implements Serializable {
    /** EQUATOR_CROSSING | ORBITAL_SUNRISE | ORBITAL_SUNSET | REGION_CHANGE | APSIS */
    public String type;
    public String craft;
    public long tsMs;
    public double lat;
    public double lon;
    public double altitudeKm;
    public long orbitNumber;
    public String detail;
    /** Duration of the phase that just ended, seconds (sunrise/sunset only). */
    public long previousPhaseSeconds;

    public OrbitEvent() {}

    public OrbitEvent(String type, String craft, long tsMs, double lat, double lon,
                      double altitudeKm, long orbitNumber, String detail) {
        this.type = type;
        this.craft = craft;
        this.tsMs = tsMs;
        this.lat = lat;
        this.lon = lon;
        this.altitudeKm = altitudeKm;
        this.orbitNumber = orbitNumber;
        this.detail = detail;
    }
}
