/**
 * TypeScript mirrors of the JSON the Flink pipeline writes to Kafka.
 * Field names match the Java model classes exactly - if you change one side,
 * change the other.
 */

export interface EnrichedPosition {
  craft: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  visibility: 'daylight' | 'eclipsed' | string;
  footprintKm: number;
  tsMs: number;
  ingestTsMs: number;

  /** Sub-solar point, used to draw the day/night terminator. */
  solarLat: number;
  solarLon: number;

  segmentKm: number;
  /** Ground-track speed in the Earth-fixed frame - legitimately lower than velocityKmh. */
  groundSpeedKmh: number;
  cumulativeKm: number;
  headingDeg: number;
  altitudeRateMs: number;

  orbitNumber: number;
  orbitProgress: number;
  phaseSeconds: number;
  region: string;
  overOcean: boolean;

  observerDistanceKm: number;
  observerInFootprint: boolean;
  observerElevationDeg: number;
  pipelineLatencyMs: number;
}

export type ChannelGroup =
  | 'power' | 'arrays' | 'joints' | 'thermal'
  | 'atmosphere' | 'gnc' | 'state' | 'signal';

export interface TelemetryEvent {
  pui: string;
  channel: string;
  label: string;
  group: ChannelGroup;
  unit: string;
  value: number | null;
  valueText: string | null;
  statusClass: string | null;
  nominalMin: number | null;
  nominalMax: number | null;
  tsMs: number;
  ingestTsMs: number;
  source: 'isslive' | 'simulator' | string;
}

export interface TelemetryStat {
  pui: string;
  channel: string;
  label: string;
  group: ChannelGroup;
  unit: string;
  windowStartMs: number;
  windowEndMs: number;
  count: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  last: number;
  outOfNominalCount: number;
  source: string;
}

export interface WindowMetrics {
  craft: string;
  windowStartMs: number;
  windowEndMs: number;
  samples: number;
  avgAltitudeKm: number;
  minAltitudeKm: number;
  maxAltitudeKm: number;
  avgVelocityKmh: number;
  minVelocityKmh: number;
  maxVelocityKmh: number;
  distanceKm: number;
  daylightFraction: number;
}

export interface OrbitEvent {
  type: 'EQUATOR_CROSSING' | 'ORBITAL_SUNRISE' | 'ORBITAL_SUNSET' | 'REGION_CHANGE' | string;
  craft: string;
  tsMs: number;
  lat: number;
  lon: number;
  altitudeKm: number;
  orbitNumber: number;
  detail: string;
  previousPhaseSeconds: number;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  key: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  channel: string | null;
  group: string | null;
  value: number | null;
  nominalMin: number | null;
  nominalMax: number | null;
  unit: string | null;
  tsMs: number;
  resolved: boolean;
}

/** A single point in a channel's recent history. */
export interface Sample {
  t: number;
  v: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  t: number;
  visibility: string;
  altitudeKm: number;
}

export interface Snapshot {
  position: EnrichedPosition | null;
  track: TrackPoint[];
  channels: TelemetryEvent[];
  channelHistory: Record<string, Sample[]>;
  channelStats: TelemetryStat[];
  alerts: Alert[];
  activeAlerts: Alert[];
  events: OrbitEvent[];
  metrics: WindowMetrics[];
  serverTime: number;
}

export type StreamFrame =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'position'; data: EnrichedPosition }
  | { type: 'telemetry'; data: TelemetryEvent[] }
  | { type: 'telemetryStats'; data: TelemetryStat[] }
  | { type: 'alert'; data: Alert }
  | { type: 'orbitEvent'; data: OrbitEvent }
  | { type: 'metrics'; data: WindowMetrics };

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';
