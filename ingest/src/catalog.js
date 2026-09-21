// Curated subset of the ISS public telemetry channels (PUIs).
//
// PUI -> label mappings are taken from the ISS-Mimic project's public
// telemetry database definition; units, groups and nominal ranges are added
// here so the pipeline can classify and range-check values without a lookup
// service. `nominal` drives Flink's out-of-range alerting.

/** @typedef {{channel:string,label:string,group:string,unit:string,nominal?:[number,number],discrete?:Record<string,string>}} ChannelMeta */

const V = [140, 175];      // primary bus volts
const A = [-15, 130];      // channel amps (negative while batteries charge)
const DEG = [-180, 180];

/** @type {Record<string, ChannelMeta>} */
export const CHANNELS = {
  // ---- Electrical power: 8 channels, 1A..4B -----------------------------
  S4000001: { channel: 'voltage_1a', label: 'SA 1A Voltage', group: 'power', unit: 'V', nominal: V },
  S6000004: { channel: 'voltage_1b', label: 'SA 1B Voltage', group: 'power', unit: 'V', nominal: V },
  P4000001: { channel: 'voltage_2a', label: 'SA 2A Voltage', group: 'power', unit: 'V', nominal: V },
  P6000004: { channel: 'voltage_2b', label: 'SA 2B Voltage', group: 'power', unit: 'V', nominal: V },
  S4000004: { channel: 'voltage_3a', label: 'SA 3A Voltage', group: 'power', unit: 'V', nominal: V },
  S6000001: { channel: 'voltage_3b', label: 'SA 3B Voltage', group: 'power', unit: 'V', nominal: V },
  P4000004: { channel: 'voltage_4a', label: 'SA 4A Voltage', group: 'power', unit: 'V', nominal: V },
  P6000001: { channel: 'voltage_4b', label: 'SA 4B Voltage', group: 'power', unit: 'V', nominal: V },

  S4000002: { channel: 'current_1a', label: 'SA 1A Current', group: 'power', unit: 'A', nominal: A },
  S6000005: { channel: 'current_1b', label: 'SA 1B Current', group: 'power', unit: 'A', nominal: A },
  P4000002: { channel: 'current_2a', label: 'SA 2A Current', group: 'power', unit: 'A', nominal: A },
  P6000005: { channel: 'current_2b', label: 'SA 2B Current', group: 'power', unit: 'A', nominal: A },
  S4000005: { channel: 'current_3a', label: 'SA 3A Current', group: 'power', unit: 'A', nominal: A },
  S6000002: { channel: 'current_3b', label: 'SA 3B Current', group: 'power', unit: 'A', nominal: A },
  P4000005: { channel: 'current_4a', label: 'SA 4A Current', group: 'power', unit: 'A', nominal: A },
  P6000002: { channel: 'current_4b', label: 'SA 4B Current', group: 'power', unit: 'A', nominal: A },

  // ---- Solar array beta gimbal angles -----------------------------------
  S4000007: { channel: 'beta_1a', label: 'Beta Gimbal 1A', group: 'arrays', unit: 'deg', nominal: DEG },
  S6000008: { channel: 'beta_1b', label: 'Beta Gimbal 1B', group: 'arrays', unit: 'deg', nominal: DEG },
  P4000007: { channel: 'beta_2a', label: 'Beta Gimbal 2A', group: 'arrays', unit: 'deg', nominal: DEG },
  P6000008: { channel: 'beta_2b', label: 'Beta Gimbal 2B', group: 'arrays', unit: 'deg', nominal: DEG },
  S4000008: { channel: 'beta_3a', label: 'Beta Gimbal 3A', group: 'arrays', unit: 'deg', nominal: DEG },
  S6000007: { channel: 'beta_3b', label: 'Beta Gimbal 3B', group: 'arrays', unit: 'deg', nominal: DEG },
  P4000008: { channel: 'beta_4a', label: 'Beta Gimbal 4A', group: 'arrays', unit: 'deg', nominal: DEG },
  P6000007: { channel: 'beta_4b', label: 'Beta Gimbal 4B', group: 'arrays', unit: 'deg', nominal: DEG },

  // ---- Rotary joints -----------------------------------------------------
  S0000004: { channel: 'psarj', label: 'Port SARJ Position', group: 'joints', unit: 'deg', nominal: [0, 360] },
  S0000003: { channel: 'ssarj', label: 'Stbd SARJ Position', group: 'joints', unit: 'deg', nominal: [0, 360] },
  S0000002: { channel: 'ptrrj', label: 'Port TRRJ Position', group: 'joints', unit: 'deg', nominal: DEG },
  S0000001: { channel: 'strrj', label: 'Stbd TRRJ Position', group: 'joints', unit: 'deg', nominal: DEG },

  // ---- External thermal control loops ------------------------------------
  S1000001: { channel: 'loopa_flowrate', label: 'Loop A Flow Rate', group: 'thermal', unit: 'kg/h', nominal: [0, 4000] },
  S1000002: { channel: 'loopa_pressure', label: 'Loop A Pressure', group: 'thermal', unit: 'kPa', nominal: [100, 700] },
  S1000003: { channel: 'loopa_temp', label: 'Loop A Temperature', group: 'thermal', unit: 'degC', nominal: [-20, 30] },
  P1000001: { channel: 'loopb_flowrate', label: 'Loop B Flow Rate', group: 'thermal', unit: 'kg/h', nominal: [0, 4000] },
  P1000002: { channel: 'loopb_pressure', label: 'Loop B Pressure', group: 'thermal', unit: 'kPa', nominal: [100, 700] },
  P1000003: { channel: 'loopb_temp', label: 'Loop B Temperature', group: 'thermal', unit: 'degC', nominal: [-20, 30] },

  // ---- Cabin atmosphere (ECLSS) ------------------------------------------
  USLAB000058: { channel: 'lab_cabin_pressure', label: 'Lab Cabin Pressure', group: 'atmosphere', unit: 'mmHg', nominal: [700, 790] },
  USLAB000053: { channel: 'lab_ppo2', label: 'Lab ppO2', group: 'atmosphere', unit: 'mmHg', nominal: [140, 175] },
  USLAB000055: { channel: 'lab_ppco2', label: 'Lab ppCO2', group: 'atmosphere', unit: 'mmHg', nominal: [0, 6] },
  USLAB000054: { channel: 'lab_ppn2', label: 'Lab ppN2', group: 'atmosphere', unit: 'mmHg', nominal: [400, 650] },
  NODE3000001: { channel: 'node3_ppo2', label: 'Node 3 ppO2', group: 'atmosphere', unit: 'mmHg', nominal: [140, 175] },
  NODE3000003: { channel: 'node3_ppco2', label: 'Node 3 ppCO2', group: 'atmosphere', unit: 'mmHg', nominal: [0, 6] },
  AIRLOCK000054: { channel: 'airlock_pressure', label: 'Airlock Pressure', group: 'atmosphere', unit: 'mmHg', nominal: [0, 790] },
  AIRLOCK000049: { channel: 'crewlock_pressure', label: 'Crewlock Pressure', group: 'atmosphere', unit: 'mmHg', nominal: [0, 790] },
  NODE3000011: { channel: 'oga_o2_rate', label: 'O2 Generation Rate', group: 'atmosphere', unit: 'kg/d', nominal: [0, 10] },

  // ---- Guidance, navigation & control ------------------------------------
  USLAB000040: { channel: 'solar_beta_angle', label: 'Solar Beta Angle', group: 'gnc', unit: 'deg', nominal: [-75, 75] },
  USLAB000010: { channel: 'cmg_momentum_pct', label: 'CMG Momentum Capacity', group: 'gnc', unit: '%', nominal: [0, 100] },
  USLAB000005: { channel: 'cmg_online_count', label: 'CMGs Online', group: 'gnc', unit: 'count', nominal: [3, 4] },
  USLAB000022: { channel: 'att_error_x', label: 'Attitude Error X', group: 'gnc', unit: 'deg', nominal: [-5, 5] },
  USLAB000023: { channel: 'att_error_y', label: 'Attitude Error Y', group: 'gnc', unit: 'deg', nominal: [-5, 5] },
  USLAB000024: { channel: 'att_error_z', label: 'Attitude Error Z', group: 'gnc', unit: 'deg', nominal: [-5, 5] },
  USLAB000039: { channel: 'iss_mass', label: 'ISS Mass', group: 'gnc', unit: 'kg', nominal: [400000, 460000] },
  Z1000009: { channel: 'cmg1_wheel_speed', label: 'CMG-1 Wheel Speed', group: 'gnc', unit: 'rpm', nominal: [6000, 6800] },
  Z1000010: { channel: 'cmg2_wheel_speed', label: 'CMG-2 Wheel Speed', group: 'gnc', unit: 'rpm', nominal: [6000, 6800] },
  Z1000011: { channel: 'cmg3_wheel_speed', label: 'CMG-3 Wheel Speed', group: 'gnc', unit: 'rpm', nominal: [6000, 6800] },
  Z1000012: { channel: 'cmg4_wheel_speed', label: 'CMG-4 Wheel Speed', group: 'gnc', unit: 'rpm', nominal: [6000, 6800] },

  // ---- Discrete state channels -------------------------------------------
  USLAB000086: {
    channel: 'iss_mode', label: 'Station Mode', group: 'state', unit: '',
    discrete: { 1: 'Standard', 2: 'Microgravity', 3: 'Reboost', 4: 'Proximity Ops', 5: 'External Ops', 6: 'Survival', 7: 'Assured Safe Crew Return' },
  },
  USLAB000012: {
    channel: 'us_gnc_mode', label: 'US GNC Mode', group: 'state', unit: '',
    discrete: { 0: 'Default', 1: 'Wait', 2: 'Reboost', 3: 'Standby', 4: 'CMG Attitude Control', 5: 'CMG/RS Assist', 6: 'User Data Generation', 7: 'Free Drift' },
  },
  RUSSEG000001: {
    channel: 'russian_mode', label: 'Russian Segment Mode', group: 'state', unit: '',
    discrete: { 1: 'Crew Rescue', 2: 'Survival', 3: 'Reboost', 4: 'Proximity Ops', 5: 'Microgravity', 6: 'Standard' },
  },
  Z1000013: { channel: 'kuband_transmit', label: 'Ku-Band Transmit', group: 'state', unit: '', discrete: { 0: 'Off', 1: 'On' } },

  // ---- Feed liveness -----------------------------------------------------
  TIME_000001: { channel: 'aos_timestamp', label: 'Signal Timestamp', group: 'signal', unit: 'h' },
  TIME_000002: { channel: 'aos_year', label: 'Signal Year', group: 'signal', unit: 'y' },
};

export const ALL_PUIS = Object.keys(CHANNELS);

/** Channels that carry a real measurement (excludes the signal/time items). */
export const MEASUREMENT_PUIS = ALL_PUIS.filter((p) => CHANNELS[p].group !== 'signal');

/**
 * The ISSLIVE feed reports TimeStamp as fractional hours since 31 Dec of the
 * previous year (UTC). Convert that to epoch milliseconds.
 * @param {number} hours
 * @param {number} [nowMs]
 */
export function decodeIssTimestamp(hours, nowMs = Date.now()) {
  if (!Number.isFinite(hours)) return nowMs;
  const year = new Date(nowMs).getUTCFullYear();
  const epoch = Date.UTC(year - 1, 11, 31, 0, 0, 0, 0);
  const ms = epoch + hours * 3600_000;
  // Guard against a year rollover producing a timestamp ~1 year in the future.
  if (ms - nowMs > 86_400_000) return ms - 365 * 86_400_000;
  return ms;
}
