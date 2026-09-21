import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sample } from '../../models/telemetry.models';

/**
 * A headline number, optionally with a sparkline.
 *
 * Per the form heuristic: when the job is "what is it right now", the answer is
 * a figure, not a chart. The sparkline is context, so it carries no axes and
 * no tooltip - the table view holds the underlying numbers.
 */
@Component({
  selector: 'app-stat-tile',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tile" [class.tile--alert]="alert()">
      <div class="tile__label">{{ label() }}</div>
      <div class="tile__value">
        <span class="tile__number" [class.tile__number--text]="isText()"
              [title]="display()">{{ display() }}</span>
        @if (unit()) { <span class="tile__unit">{{ unit() }}</span> }
      </div>
      @if (sub()) { <div class="tile__sub">{{ sub() }}</div> }
      @if (spark().length > 1) {
        <svg class="tile__spark" [attr.viewBox]="'0 0 100 28'" preserveAspectRatio="none"
             aria-hidden="true" focusable="false">
          <path [attr.d]="sparkPath()" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                vector-effect="non-scaling-stroke" />
        </svg>
      }
    </div>
  `,
  styles: [`
    .tile {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      position: relative;
      overflow: hidden;
    }
    .tile--alert { border-color: var(--status-critical); }
    .tile__label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tile__value { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
    .tile__number {
      font-size: 26px;
      font-weight: 600;
      line-height: 1.15;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Words need room to wrap; a truncated label reads as broken, whereas a
       truncated number is simply wrong. */
    .tile__number--text {
      font-size: 15px;
      line-height: 1.3;
      white-space: normal;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tile__unit { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
    .tile__sub {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tile__spark {
      margin-top: 6px;
      width: 100%;
      height: 26px;
      color: var(--series-1);
      opacity: 0.85;
    }
  `],
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input<number | string | null>(null);
  readonly unit = input<string>('');
  readonly sub = input<string>('');
  readonly digits = input<number>(1);
  readonly alert = input<boolean>(false);
  readonly spark = input<Sample[]>([]);

  /**
   * String values are labels and composites ("Eclipse 2m 54s", a lat/lon pair)
   * rather than headline figures, so anything beyond a short token gets the
   * smaller wrapping treatment. Numbers always stay at figure size.
   */
  readonly isText = computed(() => {
    const v = this.value();
    return typeof v === 'string' && v.length > 6;
  });

  readonly display = computed(() => {
    const v = this.value();
    if (v === null || v === undefined) return '--';
    if (typeof v === 'string') return v;
    if (!Number.isFinite(v)) return '--';
    return v.toLocaleString(undefined, {
      minimumFractionDigits: this.digits(),
      maximumFractionDigits: this.digits(),
    });
  });

  /** Sparkline scaled into a fixed 100x28 box; flat series render mid-height. */
  readonly sparkPath = computed(() => {
    const pts = this.spark();
    if (pts.length < 2) return '';
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const span = hi - lo;
    const n = pts.length - 1;
    return pts
      .map((p, i) => {
        const x = (i / n) * 100;
        const y = span < 1e-9 ? 14 : 25 - ((p.v - lo) / span) * 22;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join('');
  });
}
