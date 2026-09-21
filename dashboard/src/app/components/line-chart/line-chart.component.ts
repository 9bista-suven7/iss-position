import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sample } from '../../models/telemetry.models';

export interface ChartSeries {
  key: string;
  label: string;
  /** A CSS colour, normally a var(--series-N) token. */
  color: string;
  points: Sample[];
}

const W = 600;      // internal viewBox units; the SVG scales to its container
const H = 200;
const PAD = { top: 12, right: 54, bottom: 22, left: 46 };

/**
 * Multi-series time-series chart.
 *
 * Deliberately single-axis: two measures of different scale get two charts,
 * never a second y-axis. Series are capped at three by the palette's
 * all-pairs guarantee. Identity is never carried by colour alone - a legend is
 * present for two or more series and each line is also labelled at its end.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart">
      @if (series().length > 1) {
        <div class="chart__legend">
          @for (s of series(); track s.key) {
            <span class="chart__legend-item">
              <span class="chart__swatch" [style.background]="s.color"></span>
              <span>{{ s.label }}</span>
            </span>
          }
        </div>
      }

      <svg class="chart__svg" [attr.viewBox]="'0 0 ' + W + ' ' + H"
           preserveAspectRatio="none" role="img"
           [attr.aria-label]="ariaLabel()"
           (pointermove)="onMove($event)" (pointerleave)="hover.set(null)">

        <!-- nominal band sits behind everything as a recessive wash -->
        @if (bandRect(); as b) {
          <rect [attr.x]="PAD.left" [attr.y]="b.y" [attr.width]="plotW"
                [attr.height]="b.h" class="chart__band" />
        }

        @for (g of yTicks(); track g.v) {
          <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right"
                [attr.y1]="g.y" [attr.y2]="g.y" class="chart__grid" />
          <text [attr.x]="PAD.left - 7" [attr.y]="g.y + 3"
                class="chart__tick chart__tick--y">{{ g.text }}</text>
        }

        @for (t of xTicks(); track t.x) {
          <text [attr.x]="t.x" [attr.y]="H - 6" class="chart__tick chart__tick--x">{{ t.text }}</text>
        }

        <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right"
              [attr.y1]="H - PAD.bottom" [attr.y2]="H - PAD.bottom" class="chart__axis" />

        @for (s of paths(); track s.key) {
          <path [attr.d]="s.d" fill="none" [attr.stroke]="s.color"
                stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
                vector-effect="non-scaling-stroke" />
          @if (s.endLabel) {
            <text [attr.x]="s.endX + 6" [attr.y]="s.endY + 3"
                  class="chart__endlabel">{{ s.endLabel }}</text>
          }
        }

        @if (hover(); as h) {
          <line [attr.x1]="h.x" [attr.x2]="h.x" [attr.y1]="PAD.top"
                [attr.y2]="H - PAD.bottom" class="chart__crosshair" />
          @for (p of h.points; track p.key) {
            <circle [attr.cx]="h.x" [attr.cy]="p.y" r="4"
                    [attr.fill]="p.color" class="chart__dot" />
          }
        }
      </svg>

      @if (hover(); as h) {
        <div class="chart__tooltip" [style.left.%]="h.leftPct"
             [class.chart__tooltip--flip]="h.leftPct > 62">
          <div class="chart__tooltip-time">{{ h.timeText }}</div>
          @for (p of h.points; track p.key) {
            <div class="chart__tooltip-row">
              <span class="chart__swatch" [style.background]="p.color"></span>
              <span class="chart__tooltip-label">{{ p.label }}</span>
              <span class="chart__tooltip-value">{{ p.text }}</span>
            </div>
          }
        </div>
      }

      @if (!hasData()) { <div class="chart__empty">waiting for data…</div> }
    </div>
  `,
  styles: [`
    .chart { position: relative; width: 100%; }
    .chart__svg { width: 100%; height: var(--chart-h, 170px); display: block; overflow: visible; }
    .chart__legend {
      display: flex; flex-wrap: wrap; gap: 4px 14px;
      margin-bottom: 6px; font-size: 11px; color: var(--text-secondary);
    }
    .chart__legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .chart__swatch {
      width: 9px; height: 9px; border-radius: 2px; display: inline-block; flex: none;
    }
    .chart__grid { stroke: var(--grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .chart__axis { stroke: var(--baseline); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .chart__band { fill: var(--status-good); opacity: 0.07; }
    .chart__tick { fill: var(--text-muted); font-size: 9px; font-family: var(--font); }
    .chart__tick--y { text-anchor: end; }
    .chart__tick--x { text-anchor: middle; }
    .chart__endlabel {
      fill: var(--text-secondary); font-size: 9px; font-family: var(--font);
      font-weight: 600; dominant-baseline: middle;
    }
    .chart__crosshair { stroke: var(--text-muted); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .chart__dot { stroke: var(--surface-1); stroke-width: 2; }
    .chart__tooltip {
      position: absolute; top: 4px; transform: translateX(8px);
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: var(--shadow);
      padding: 7px 9px; font-size: 11px; pointer-events: none;
      min-width: 120px; z-index: 5;
    }
    .chart__tooltip--flip { transform: translateX(-108%); }
    .chart__tooltip-time { color: var(--text-muted); margin-bottom: 4px; font-size: 10px; }
    .chart__tooltip-row { display: flex; align-items: center; gap: 6px; line-height: 1.6; }
    .chart__tooltip-label { color: var(--text-secondary); flex: 1; }
    .chart__tooltip-value { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
    .chart__empty {
      position: absolute; inset: 0; display: grid; place-items: center;
      font-size: 11px; color: var(--text-muted);
    }
  `],
})
export class LineChartComponent {
  readonly series = input.required<ChartSeries[]>();
  readonly unit = input<string>('');
  readonly digits = input<number>(1);
  /** Draws a recessive band showing the nominal operating range. */
  readonly nominal = input<{ min: number; max: number } | null>(null);
  /** Force the y-domain to include zero (for magnitudes such as current). */
  readonly zeroBased = input<boolean>(false);

  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;
  readonly plotW = W - PAD.left - PAD.right;

  readonly hover = signal<{
    x: number; leftPct: number; timeText: string;
    points: { key: string; label: string; color: string; y: number; text: string }[];
  } | null>(null);

  readonly hasData = computed(() => this.series().some((s) => s.points.length > 1));

  readonly ariaLabel = computed(() => {
    const names = this.series().map((s) => s.label).join(', ');
    return `Time series chart of ${names}${this.unit() ? ' in ' + this.unit() : ''}`;
  });

  /** Shared domain across every series - one axis, always. */
  private readonly domain = computed(() => {
    let t0 = Infinity, t1 = -Infinity, lo = Infinity, hi = -Infinity;
    for (const s of this.series()) {
      for (const p of s.points) {
        if (p.t < t0) t0 = p.t;
        if (p.t > t1) t1 = p.t;
        if (p.v < lo) lo = p.v;
        if (p.v > hi) hi = p.v;
      }
    }
    if (!Number.isFinite(t0)) return null;

    const band = this.nominal();
    if (band) { lo = Math.min(lo, band.min); hi = Math.max(hi, band.max); }
    if (this.zeroBased()) lo = Math.min(lo, 0);

    if (hi - lo < 1e-9) { hi = lo + 1; lo -= 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    if (t1 - t0 < 1000) t1 = t0 + 1000;
    return { t0, t1, lo, hi };
  });

  private readonly scale = computed(() => {
    const d = this.domain();
    if (!d) return null;
    const x = (t: number) => PAD.left + ((t - d.t0) / (d.t1 - d.t0)) * this.plotW;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + (1 - (v - d.lo) / (d.hi - d.lo)) * plotH;
    return { ...d, x, y };
  });

  readonly paths = computed(() => {
    const sc = this.scale();
    if (!sc) return [];
    return this.series().map((s) => {
      let d = '';
      let endX = 0, endY = 0;
      s.points.forEach((p, i) => {
        const px = sc.x(p.t), py = sc.y(p.v);
        d += `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`;
        endX = px; endY = py;
      });
      const last = s.points.at(-1);
      return {
        key: s.key,
        color: s.color,
        d,
        endX,
        endY,
        // Direct labels keep identity off colour alone; only for <= 3 series.
        endLabel: last && this.series().length <= 3 ? s.label : '',
      };
    });
  });

  readonly yTicks = computed(() => {
    const sc = this.scale();
    if (!sc) return [];
    const out: { v: number; y: number; text: string }[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = sc.lo + ((sc.hi - sc.lo) * i) / 4;
      out.push({ v, y: sc.y(v), text: this.fmt(v) });
    }
    return out;
  });

  readonly xTicks = computed(() => {
    const sc = this.scale();
    if (!sc) return [];
    const out: { x: number; text: string }[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = sc.t0 + ((sc.t1 - sc.t0) * i) / 3;
      out.push({ x: sc.x(t), text: this.clock(t) });
    }
    return out;
  });

  readonly bandRect = computed(() => {
    const sc = this.scale();
    const band = this.nominal();
    if (!sc || !band) return null;
    const yTop = sc.y(Math.min(band.max, sc.hi));
    const yBot = sc.y(Math.max(band.min, sc.lo));
    return { y: yTop, h: Math.max(0, yBot - yTop) };
  });

  onMove(ev: PointerEvent): void {
    const sc = this.scale();
    const target = ev.currentTarget as SVGSVGElement;
    if (!sc || !target) return;

    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    if (px < PAD.left || px > W - PAD.right) { this.hover.set(null); return; }

    const t = sc.t0 + ((px - PAD.left) / this.plotW) * (sc.t1 - sc.t0);
    const points = [];
    for (const s of this.series()) {
      const p = nearest(s.points, t);
      if (!p) continue;
      points.push({
        key: s.key, label: s.label, color: s.color,
        y: sc.y(p.v), text: `${this.fmt(p.v)}${this.unit() ? ' ' + this.unit() : ''}`,
      });
    }
    if (!points.length) { this.hover.set(null); return; }

    this.hover.set({
      x: px,
      leftPct: ((px - PAD.left) / this.plotW) * 100,
      timeText: this.clock(t),
      points,
    });
  }

  private fmt(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 10000) return Math.round(v).toLocaleString();
    return v.toFixed(this.digits());
  }

  private clock(t: number): string {
    return new Date(t).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }
}

/** Binary search for the sample nearest a timestamp. */
function nearest(points: Sample[], t: number): Sample | null {
  if (!points.length) return null;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1; else hi = mid;
  }
  const a = points[lo];
  const b = points[Math.max(0, lo - 1)];
  return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
}
