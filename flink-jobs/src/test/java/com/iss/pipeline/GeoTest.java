package com.iss.pipeline;

import com.iss.pipeline.util.Geo;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GeoTest {

    @Test
    void haversineMatchesKnownDistance() {
        // London Heathrow -> New York JFK is ~5555 km.
        double d = Geo.haversineKm(51.4700, -0.4543, 40.6413, -73.7781);
        assertEquals(5555, d, 25, "LHR->JFK great-circle distance");
    }

    @Test
    void haversineIsZeroForSamePoint() {
        assertEquals(0.0, Geo.haversineKm(10, 20, 10, 20), 1e-9);
    }

    @Test
    void bearingDueEastIsNinetyDegrees() {
        // Along the equator, heading east.
        assertEquals(90.0, Geo.bearingDeg(0, 0, 0, 10), 0.5);
    }

    @Test
    void bearingDueNorthIsZeroDegrees() {
        assertEquals(0.0, Geo.bearingDeg(0, 0, 10, 0), 0.5);
    }

    @Test
    void elevationIsNinetyWhenOverhead() {
        assertEquals(90.0, Geo.elevationDeg(0.0, 420.0), 0.01);
    }

    @Test
    void elevationFallsBelowHorizonAtLongRange() {
        // At 3000 km ground range a 420 km orbit is well below the horizon.
        assertTrue(Geo.elevationDeg(3000, 420) < 0,
                "distant station should be below the horizon");
    }

    @Test
    void elevationDecreasesWithDistance() {
        double near = Geo.elevationDeg(100, 420);
        double far = Geo.elevationDeg(1500, 420);
        assertTrue(near > far, "elevation must fall off with ground range");
    }

    @Test
    void longitudeNormalisationWraps() {
        assertEquals(-170.0, Geo.normalizeLon(190.0), 1e-9);
        assertEquals(170.0, Geo.normalizeLon(-190.0), 1e-9);
        assertEquals(0.0, Geo.normalizeLon(360.0), 1e-9);
    }

    @Test
    void regionLookupIdentifiesLandAndOcean() {
        assertEquals("Arctic", Geo.region(80, 10));
        assertTrue(Geo.isOcean(Geo.region(0, -140)), "mid-Pacific should be ocean");
        assertFalse(Geo.isOcean(Geo.region(-1.3, 36.8)), "Nairobi should be land");
    }

    @Test
    void openWaterNearLandIsNotLabelledAsContinent() {
        // Bering Sea, well off the Aleutians - previously read as North America.
        assertTrue(Geo.isOcean(Geo.region(51.37, -167.97)),
                "Bering Sea should be ocean, not a continent");
        // Off the California coast.
        assertTrue(Geo.isOcean(Geo.region(35.0, -127.5)),
                "eastern Pacific should be ocean");
        // ~500 km off the Mexican Pacific coast.
        assertTrue(Geo.isOcean(Geo.region(13.32, -102.94)),
                "Pacific off Mexico should be ocean, not Central America");
    }

    @Test
    void mexicoAndCentralAmericaResolveSeparately() {
        assertEquals("Mexico", Geo.region(23.6, -102.5));          // central Mexico
        assertEquals("Central America", Geo.region(9.9, -84.1));   // Costa Rica
    }

    @Test
    void wellKnownLandPointsResolve() {
        assertEquals("United States", Geo.region(39.0, -98.0));
        assertEquals("South America", Geo.region(-15.8, -47.9));   // Brasilia
        assertEquals("Australia", Geo.region(-25.3, 133.8));
        assertEquals("Asia", Geo.region(39.9, 116.4));             // Beijing
        assertEquals("Europe", Geo.region(48.9, 2.35));            // Paris
    }
}
