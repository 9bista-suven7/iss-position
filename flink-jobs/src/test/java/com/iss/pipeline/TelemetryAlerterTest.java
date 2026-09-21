package com.iss.pipeline;

import com.iss.pipeline.func.TelemetryAlerter;
import com.iss.pipeline.model.Alert;
import com.iss.pipeline.model.TelemetryEvent;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Verifies the raise/clear hysteresis around the nominal band. */
class TelemetryAlerterTest {

    private KeyedOneInputStreamOperatorTestHarness<String, TelemetryEvent, Alert> harness;
    private long clock = 1_700_000_000_000L;

    @BeforeEach
    void setUp() throws Exception {
        // Raise after 3 consecutive breaches, clear after 5 consecutive good samples.
        harness = new KeyedOneInputStreamOperatorTestHarness<>(
                new KeyedProcessOperator<>(new TelemetryAlerter(3, 5)),
                (TelemetryEvent e) -> e.channel,
                TypeInformation.of(String.class));
        harness.open();
    }

    @AfterEach
    void tearDown() throws Exception {
        harness.close();
    }

    private void push(double value) throws Exception {
        TelemetryEvent e = new TelemetryEvent();
        e.pui = "S4000001";
        e.channel = "voltage_1a";
        e.label = "SA 1A Voltage";
        e.group = "power";
        e.unit = "V";
        e.value = value;
        e.nominalMin = 140.0;
        e.nominalMax = 175.0;
        e.tsMs = (clock += 1000);
        harness.processElement(new StreamRecord<>(e, e.tsMs));
    }

    private List<Alert> alerts() {
        List<Alert> out = new ArrayList<>();
        for (Object o : harness.extractOutputStreamRecords()) {
            out.add(((StreamRecord<Alert>) o).getValue());
        }
        return out;
    }

    @Test
    void doesNotAlertWhileInsideNominalBand() throws Exception {
        for (int i = 0; i < 10; i++) push(160.0);
        assertTrue(alerts().isEmpty(), "in-range samples must not alert");
    }

    @Test
    void singleTransientBreachDoesNotAlert() throws Exception {
        push(160.0);
        push(200.0);   // one stray sample
        push(160.0);
        assertTrue(alerts().isEmpty(), "a lone spike must not raise an alert");
    }

    @Test
    void raisesOnceAfterSustainedBreach() throws Exception {
        push(200.0);
        push(200.0);
        assertTrue(alerts().isEmpty(), "should not fire before the third breach");
        push(200.0);

        List<Alert> raised = alerts();
        assertEquals(1, raised.size(), "exactly one alert on crossing the threshold");
        assertEquals("TELEMETRY_OUT_OF_RANGE", raised.get(0).type);
        assertFalse(raised.get(0).resolved);
        assertEquals("telemetry:voltage_1a", raised.get(0).key);

        // Staying out of range must not produce a second alert.
        push(200.0);
        push(200.0);
        assertEquals(1, alerts().size(), "alert must not repeat while still breached");
    }

    @Test
    void clearsOnlyAfterSustainedRecovery() throws Exception {
        for (int i = 0; i < 3; i++) push(200.0);   // raise
        assertEquals(1, alerts().size());

        for (int i = 0; i < 4; i++) push(160.0);   // not yet enough to clear
        assertEquals(1, alerts().size(), "must not clear before 5 good samples");

        push(160.0);                                // fifth good sample
        List<Alert> all = alerts();
        assertEquals(2, all.size());
        assertEquals("TELEMETRY_RECOVERED", all.get(1).type);
        assertTrue(all.get(1).resolved);
    }

    @Test
    void severityEscalatesFarOutsideTheBand() throws Exception {
        for (int i = 0; i < 3; i++) push(300.0);   // far above 175
        assertEquals("critical", alerts().get(0).severity);
    }

    @Test
    void severityIsWarningJustOutsideTheBand() throws Exception {
        for (int i = 0; i < 3; i++) push(177.0);   // just above 175
        assertEquals("warning", alerts().get(0).severity);
    }

    @Test
    void ignoresSamplesWithoutNominalBounds() throws Exception {
        TelemetryEvent e = new TelemetryEvent();
        e.channel = "voltage_1a";
        e.value = 9999.0;
        e.nominalMin = null;
        e.nominalMax = null;
        e.tsMs = (clock += 1000);
        harness.processElement(new StreamRecord<>(e, e.tsMs));
        assertTrue(alerts().isEmpty(), "channels without limits cannot breach");
    }
}
