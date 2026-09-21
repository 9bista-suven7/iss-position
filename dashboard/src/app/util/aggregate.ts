import { Sample } from '../models/telemetry.models';

/**
 * Combines several channels into one series by bucketing samples into fixed
 * time bins and reducing each bin.
 *
 * Binning rather than index-pairing matters: the simulator emits every channel
 * on one tick, but the live NASA feed updates each channel independently, so
 * sample arrays are neither aligned nor equal length. Bins make the aggregate
 * correct either way.
 */
export function aggregateSeries(
  histories: (Sample[] | undefined)[],
  mode: 'mean' | 'sum',
  binMs = 1000,
): Sample[] {
  const bins = new Map<number, { total: number; count: number; channels: Set<number> }>();

  histories.forEach((h, idx) => {
    if (!h) return;
    for (const s of h) {
      const bin = Math.floor(s.t / binMs) * binMs;
      let e = bins.get(bin);
      if (!e) { e = { total: 0, count: 0, channels: new Set() }; bins.set(bin, e); }
      e.total += s.v;
      e.count += 1;
      e.channels.add(idx);
    }
  });

  const expected = histories.filter(Boolean).length;
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    // A sum is only meaningful once every channel has reported in that bin;
    // a partial bin would read as a sudden dip.
    .filter(([, e]) => (mode === 'sum' ? e.channels.size === expected : e.count > 0))
    .map(([t, e]) => ({ t, v: mode === 'sum' ? e.total : e.total / e.count }));
}

/** Pulls one channel's history, newest last. */
export function seriesOf(history: Map<string, Sample[]>, channel: string): Sample[] {
  return history.get(channel) ?? [];
}
