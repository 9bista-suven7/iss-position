# ISS Live Telemetry Dashboard

A real streaming pipeline for International Space Station data: live orbital
position and station telemetry flow through **Kafka**, get enriched and
aggregated by **Apache Flink**, and land in an **Angular** dashboard over a
WebSocket.

![Architecture: ISS position and telemetry flow through ingest into Kafka raw topics, are enriched by an Apache Flink job into five derived topics, and reach an Angular dashboard through a WebSocket gateway](docs/architecture.svg)


## Quick start

```bash
./infra/setup.sh        # downloads + configures Kafka and Flink (first run only)
./infra/start-all.sh    # broker, topics, Flink cluster, job, ingest, gateway
cd dashboard && npm start
```

Then open <http://localhost:4200>.

| Surface | URL |
|---|---|
| Dashboard | http://localhost:4200 |
| Flink UI | http://localhost:8181 |
| Gateway REST | http://localhost:7300/health |
| Gateway stream | ws://localhost:7300/stream |
| Ingest health | http://localhost:7301/health |

`./infra/status.sh` prints component health and every topic's offset.
`./infra/stop-all.sh` shuts the stack down.

> Flink's web UI runs on **8181**, not the usual 8081, because port 8081 was
> already taken on this machine. Change `FLINK_REST` in `infra/env.sh` and the
> `rest.port` in `infra/setup.sh` if you want it back.

## Data sources

**Orbital position** comes from `api.wheretheiss.at`, polled at 1 Hz. This is
live and working: latitude, longitude, altitude, velocity, footprint,
sunlight/eclipse state and the sub-solar point.

**Station telemetry** is subscribed from NASA's public **ISSLIVE** Lightstreamer
feed (`push.lightstreamer.com`), covering 60 channels — solar array voltages and
currents, beta gimbal angles, thermal loops, cabin atmosphere, CMG state and
more. Channel identifiers and labels come from the
[ISS-Mimic](https://github.com/ISS-Mimic/Mimic) project's public telemetry
definitions.

> **The public NASA telemetry feed is currently silent.** The `ISSLIVE` adapter
> set is still registered and accepts subscriptions, but publishes no data — a
> 150-second subscription to 12 channels (including the `TIME_000001` heartbeat)
> returned zero updates, while Lightstreamer's own demo adapter streamed
> normally from the same client. `isslive.com` now resolves to a parked domain.
>
> The live path is fully implemented and wired. `TELEMETRY_MODE` decides what
> happens when it is quiet:
>
> | mode | behaviour |
> |---|---|
> | `auto` *(default)* | prefer the live feed; fall back to the simulator after it stays silent, and switch back the moment real data resumes |
> | `live` | live feed only — the dashboard stays empty while it is down |
> | `simulated` | simulator only |
>
> The simulator is **driven by the real position stream**, so it stays
> physically coherent: arrays collapse to near-zero current in eclipse and
> recover in sunlight, gimbals track the sun, CO₂ sawtooths with the scrubber
> cycle. It also injects occasional out-of-nominal excursions so the alerting
> path is exercised.

## What Flink actually computes

This is not a pass-through. The job (`flink-jobs/`) runs 16 tasks across six
sinks:

**Stateful position enrichment** (`PositionEnricher`) — keyed by craft, holding
the previous fix, the running track, the orbit counter and the illumination
phase:

- great-circle segment distance, ground-track speed, heading and altitude rate
- orbit number, incremented at each **northbound equator crossing**
- time spent in the current sunlight/eclipse phase
- coarse region of the sub-satellite point
- distance, elevation and footprint geometry against a configured observer

**Side output** → `iss.orbit.events`: equator crossings, orbital sunrise/sunset
(carrying how long the previous phase lasted) and region changes.

**Tumbling windows** → `iss.metrics.windowed` (60 s: altitude and velocity
extremes, distance covered, daylight fraction) and `iss.telemetry.stats` (30 s
per channel: count, min, max, mean, standard deviation, breach count).

**Alerting** → `iss.alerts`:

- `TelemetryAlerter` raises when a channel is outside its nominal band for 3
  consecutive samples and clears after 5 good ones. That hysteresis is the point
   — without it a channel sitting on its limit flaps the alert feed.
- `ObserverPassDetector` is edge-triggered on the station rising above and
  setting below the observer's horizon, reporting duration and peak elevation.

### Ground speed is not orbital velocity

The dashboard shows both, and they differ by roughly 2,800 km/h. That is
correct. Reported velocity is measured in the inertial frame; ground-track speed
is the sub-satellite point moving across an Earth-fixed grid, so it is scaled by
`R/(R+h)` **and** reduced by the earth's own rotation where the track runs
eastward. At 51.7°N the predicted value is ≈24,829 km/h against a measured
24,754 — within 0.3%.

## Topics

| Topic | Parts | Produced by | Contents |
|---|---|---|---|
| `iss.position.raw` | 1 | ingest | raw position fixes |
| `iss.telemetry.raw` | 3 | ingest | per-channel telemetry samples |
| `iss.position.enriched` | 1 | Flink | enriched position |
| `iss.orbit.events` | 1 | Flink | equator/terminator/region events |
| `iss.metrics.windowed` | 1 | Flink | 60 s orbital rollups |
| `iss.telemetry.stats` | 3 | Flink | 30 s per-channel statistics |
| `iss.alerts` | 1 | Flink | range and pass alerts |

Position streams use a single partition so ordering is strict; telemetry is
keyed by channel so it fans out while keeping per-channel order.

## Dashboard

Angular 18, standalone components and signals, no charting dependency — every
chart is hand-built SVG. The world map is Natural Earth 110m land, pre-projected
to an equirectangular canvas at build time, so there are no map tiles and no
network requests at runtime.

Colour follows a validated palette: categorical slots are capped at three, which
clears every colourblind and normal-vision separation gate on the all-pairs test
in both light and dark mode. Series identity is never carried by colour alone —
every chart has a legend and direct end-labels, severity ships with an icon and
a written label, and the channel table gives the numbers directly.

## Layout

```
infra/       cluster download, config, lifecycle scripts
ingest/      Node.js: ISS sources -> Kafka
flink-jobs/  Java 17 + Maven: the Flink pipeline (18 tests)
gateway/     Node.js: Kafka -> WebSocket/REST
dashboard/   Angular 18 dashboard
```

## Configuration

Everything is environment-driven. The most useful knobs:

| Variable | Default | Meaning |
|---|---|---|
| `KAFKA_BROKERS` | `localhost:9092` | broker list (ingest + gateway) |
| `TELEMETRY_MODE` | `auto` | `auto` / `live` / `simulated` |
| `TELEMETRY_SILENCE_MS` | `45000` | silence before falling back |
| `TELEMETRY_SIM_ANOMALY_RATE` | `0.00015` | per-channel anomaly chance per tick |
| `POSITION_POLL_MS` | `1000` | position poll interval |
| `GATEWAY_PORT` | `7300` | gateway HTTP/WS port |
| `OBSERVER_LAT` / `OBSERVER_LON` | KSC | ground station for pass alerts |

Job parameters (`./infra/submit-job.sh` passes these through):
`--bootstrap`, `--observer-lat`, `--observer-lon`, `--min-elevation-deg`,
`--position-window-seconds`, `--telemetry-window-seconds`,
`--breaches-to-raise`, `--samples-to-clear`.

## Tests

```bash
cd flink-jobs && mvn test
```

19 tests: spherical geodesy against known distances and horizon geometry, the
region lookup (including open water near coastlines), and the alerter's
raise/clear hysteresis driven through a real Flink operator test harness.

## Requirements

Java 17, Node 18.17+, Maven 3.8+. No Docker required — Kafka runs in KRaft mode
and Flink as a local standalone cluster, both from the tarballs `setup.sh`
fetches into `infra/dist/`.
