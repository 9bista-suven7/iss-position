package com.iss.pipeline.util;

import java.io.Serializable;

/** Spherical-earth geodesy helpers used across the pipeline. */
public final class Geo implements Serializable {
    public static final double EARTH_RADIUS_KM = 6371.0088;

    private Geo() {}

    /** Great-circle distance between two points, in kilometres. */
    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dPhi = Math.toRadians(lat2 - lat1);
        double dLambda = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /** Initial bearing from point 1 to point 2, degrees clockwise from north. */
    public static double bearingDeg(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dLambda = Math.toRadians(lon2 - lon1);
        double y = Math.sin(dLambda) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        return (Math.toDegrees(Math.atan2(y, x)) + 360.0) % 360.0;
    }

    /**
     * Elevation of a satellite above an observer's local horizon, in degrees.
     * Negative means below the horizon.
     *
     * @param groundDistanceKm great-circle distance from observer to sub-satellite point
     * @param altitudeKm       satellite altitude above the surface
     */
    public static double elevationDeg(double groundDistanceKm, double altitudeKm) {
        double gamma = groundDistanceKm / EARTH_RADIUS_KM;   // earth-central angle
        double denom = Math.sin(gamma);
        if (denom < 1e-9) return 90.0;                        // directly overhead
        double elevation = Math.atan2(
                Math.cos(gamma) - EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm), denom);
        return Math.toDegrees(elevation);
    }

    /** Normalises longitude into [-180, 180). */
    public static double normalizeLon(double lon) {
        double x = (lon + 180.0) % 360.0;
        if (x < 0) x += 360.0;
        return x - 180.0;
    }

    /**
     * Coarse label for the sub-satellite point. Deliberately simple: it uses
     * bounding boxes rather than a polygon set, which is accurate enough to
     * annotate a live ground track and costs nothing per event.
     */
    public static String region(double lat, double lon) {
        double x = normalizeLon(lon);
        if (lat > 70.0) return "Arctic";
        if (lat < -60.0) return "Southern Ocean";

        // Land boxes, narrow enough that open water nearby does not get
        // labelled as a continent. Checked before the ocean fallback.
        if (within(lat, 60, 84) && within(x, -73, -12)) return "Greenland";
        if (within(lat, 55, 72) && within(x, -168, -141)) return "Alaska";
        if (within(lat, 49, 70) && within(x, -141, -58)) return "Canada";
        if (within(lat, 25, 49) && within(x, -125, -67)) return "United States";
        if (within(lat, 15, 32) && within(x, -112, -86)) return "Mexico";
        if (within(lat, 7, 18) && within(x, -92, -77)) return "Central America";
        if (within(lat, -56, 13) && within(x, -81, -35)) return "South America";
        if (within(lat, -35, 37) && within(x, -17, 51) && !(lat > 31 && x > 34)) return "Africa";
        if (within(lat, 36, 71) && within(x, -10, 40)) return "Europe";
        if (within(lat, 12, 42) && within(x, 34, 60)) return "Middle East";
        if (within(lat, 5, 55) && within(x, 60, 146)) return "Asia";
        if (within(lat, -11, 6) && within(x, 95, 141)) return "Indonesia";
        if (within(lat, -44, -10) && within(x, 112, 154)) return "Australia";
        if (within(lat, -47, -34) && within(x, 166, 179)) return "New Zealand";

        // Not over land: name the ocean basin.
        if (within(x, -70, 20)) return lat >= 0 ? "North Atlantic" : "South Atlantic";
        if (within(x, 20, 147) && lat < 30) return "Indian Ocean";
        return lat >= 0 ? "North Pacific" : "South Pacific";
    }

    /** True when the coarse region lookup did not land on a continent. */
    public static boolean isOcean(String region) {
        return region.contains("Ocean") || region.contains("Atlantic")
            || region.contains("Pacific");
    }

    private static boolean within(double v, double lo, double hi) {
        return v >= lo && v <= hi;
    }
}
