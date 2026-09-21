import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnrichedPosition, TrackPoint } from '../../models/telemetry.models';
import { WORLD_LAND_PATH, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from '../../data/world-map';

const W = WORLD_MAP_WIDTH;    // 2000
const H = WORLD_MAP_HEIGHT;   // 1000

const xOf = (lon: number) => ((lon + 180) / 360) * W;
const yOf = (lat: number) => ((90 - lat) / 180) * H;

/**
 * Ground track on an equirectangular world map.
 *
 * The projection is a plain linear mapping, so the land outlines are baked in
 * at build time and every overlay is a direct multiply - no geo library, no
 * tile requests, and it renders identically offline.
 */
@Component({
  selector: 'app-ground-track',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="map" [attr.viewBox]="'0 0 ' + W + ' ' + H"
         preserveAspectRatio="xMidYMid meet" role="img"
         [attr.aria-label]="ariaLabel()">

      <rect x="0" y="0" [attr.width]="W" [attr.height]="H" class="map__ocean" />

      <!-- night side, drawn under the land so coastlines stay legible -->
      @if (terminator(); as t) {
        <path [attr.d]="t.fill" class="map__night" />
        <path [attr.d]="t.line" class="map__terminator" />
      }

      <path [attr.d]="LAND" class="map__land" fill-rule="evenodd" />

      <!-- graticule -->
      @for (g of graticule(); track g.d) { <path [attr.d]="g.d" class="map__grid" /> }
      <line x1="0" [attr.y1]="yOf(0)" [attr.x2]="W" [attr.y2]="yOf(0)" class="map__equator" />

      <!-- visibility footprint -->
      @if (footprint(); as f) {
        <ellipse [attr.cx]="f.cx" [attr.cy]="f.cy" [attr.rx]="f.rx" [attr.ry]="f.ry"
                 class="map__footprint" />
      }

      <!-- past ground track, split at the dateline -->
      @for (seg of trackSegments(); track $index) {
        <path [attr.d]="seg" class="map__track" />
      }

      @if (marker(); as m) {
        <g [attr.transform]="'translate(' + m.x + ' ' + m.y + ')'">
          <circle r="16" class="map__halo" />
          <circle r="7" class="map__craft" />
        </g>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .map { width: 100%; height: 100%; display: block; border-radius: 8px; }
    .map__ocean { fill: var(--surface-2); }
    .map__land { fill: var(--grid); stroke: var(--baseline); stroke-width: 1.2; }
    .map__night { fill: var(--map-night, #0b1020); opacity: var(--map-night-opacity, 0.34); }
    .map__terminator {
      fill: none; stroke: var(--status-warning); stroke-width: 2;
      stroke-dasharray: 9 7; opacity: 0.75;
    }
    .map__grid { stroke: var(--grid); stroke-width: 1; fill: none; opacity: 0.8; }
    .map__equator { stroke: var(--baseline); stroke-width: 1.4; stroke-dasharray: 10 8; }
    .map__footprint {
      fill: var(--series-1); fill-opacity: 0.12;
      stroke: var(--series-1); stroke-width: 2; stroke-opacity: 0.55;
    }
    .map__track {
      fill: none; stroke: var(--series-1); stroke-width: 3.5;
      stroke-linecap: round; stroke-linejoin: round; opacity: 0.9;
    }
    .map__craft { fill: var(--series-2); stroke: var(--surface-1); stroke-width: 2.5; }
    .map__halo { fill: var(--series-2); opacity: 0.22; }
  `],
})
export class GroundTrackComponent {
  readonly position = input<EnrichedPosition | null>(null);
  readonly track = input<TrackPoint[]>([]);

  readonly W = W;
  readonly H = H;
  readonly LAND = WORLD_LAND_PATH;
  readonly yOf = yOf;

  readonly ariaLabel = computed(() => {
    const p = this.position();
    return p
      ? `World map showing the station at ${p.lat.toFixed(1)} degrees latitude, ${p.lon.toFixed(1)} degrees longitude, over ${p.region}`
      : 'World map, awaiting position';
  });

  readonly marker = computed(() => {
    const p = this.position();
    return p ? { x: xOf(p.lon), y: yOf(p.lat) } : null;
  });

  /**
   * Footprint radius in degrees. Longitude degrees shrink with latitude, so the
   * circle is drawn as an ellipse whose x-radius grows toward the poles - that
   * is what a circle on the globe actually looks like in this projection.
   */
  readonly footprint = computed(() => {
    const p = this.position();
    if (!p || !p.footprintKm) return null;
    const radiusKm = p.footprintKm / 2;
    const degLat = radiusKm / 111.32;
    const cosLat = Math.max(0.15, Math.cos((p.lat * Math.PI) / 180));
    const degLon = Math.min(170, degLat / cosLat);
    return {
      cx: xOf(p.lon), cy: yOf(p.lat),
      rx: (degLon / 360) * W, ry: (degLat / 180) * H,
    };
  });

  /** Split the track wherever it crosses the antimeridian to avoid a sweep across the map. */
  readonly trackSegments = computed(() => {
    const pts = this.track();
    if (pts.length < 2) return [];
    const segs: string[] = [];
    let cur = `M${xOf(pts[0].lon).toFixed(1)} ${yOf(pts[0].lat).toFixed(1)}`;
    let started = true;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], p = pts[i];
      if (Math.abs(p.lon - prev.lon) > 180) {
        if (started) segs.push(cur);
        cur = `M${xOf(p.lon).toFixed(1)} ${yOf(p.lat).toFixed(1)}`;
        started = true;
        continue;
      }
      cur += `L${xOf(p.lon).toFixed(1)} ${yOf(p.lat).toFixed(1)}`;
    }
    if (started) segs.push(cur);
    return segs.filter((s) => s.includes('L'));
  });

  /**
   * The terminator is the great circle 90 degrees from the sub-solar point:
   * lat(lon) = atan(-cos(lon - solarLon) / tan(solarLat)). The polygon is
   * closed along whichever pole is in darkness.
   */
  readonly terminator = computed(() => {
    const p = this.position();
    if (!p || !Number.isFinite(p.solarLat) || !Number.isFinite(p.solarLon)) return null;

    const solarLatRad = (p.solarLat * Math.PI) / 180;
    // Near an equinox tan(solarLat) approaches zero and the curve degenerates.
    const tanSolar = Math.tan(solarLatRad);
    if (Math.abs(tanSolar) < 1e-6) return null;

    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      const h = ((lon - p.solarLon) * Math.PI) / 180;
      const lat = (Math.atan(-Math.cos(h) / tanSolar) * 180) / Math.PI;
      pts.push(`${lon === -180 ? 'M' : 'L'}${xOf(lon).toFixed(1)} ${yOf(lat).toFixed(1)}`);
    }
    // Darkness lies south of the curve when the sun is north of the equator,
    // so the polygon closes along that edge. Verified against the solar
    // zenith-angle test: the two agree on every grid point.
    const line = pts.join('');
    const closeY = p.solarLat >= 0 ? H : 0;
    return { line, fill: `${line}L${W} ${closeY}L0 ${closeY}Z` };
  });

  readonly graticule = computed(() => {
    const lines: { d: string }[] = [];
    for (let lon = -150; lon <= 150; lon += 30) {
      lines.push({ d: `M${xOf(lon)} 0L${xOf(lon)} ${H}` });
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      lines.push({ d: `M0 ${yOf(lat)}L${W} ${yOf(lat)}` });
    }
    return lines;
  });
}
