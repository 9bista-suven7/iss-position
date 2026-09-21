import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TelemetryEvent, TelemetryStat } from '../../models/telemetry.models';

const GROUPS = ['all', 'power', 'arrays', 'joints', 'thermal', 'atmosphere', 'gnc', 'state'] as const;
type Group = (typeof GROUPS)[number];

/**
 * Every channel as numbers.
 *
 * This is the table view the accessibility pass requires: it is where a reader
 * goes when a colour is hard to tell apart, and it is the only place the
 * windowed min/max/stddev from Flink are readable directly.
 */
@Component({
  selector: 'app-channel-table',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ct">
      <div class="ct__filters" role="group" aria-label="Filter channels by subsystem">
        @for (g of groups; track g) {
          <button type="button" class="ct__chip" [class.ct__chip--on]="group() === g"
                  [attr.aria-pressed]="group() === g" (click)="group.set(g)">{{ g }}</button>
        }
        <input class="ct__search" type="search" placeholder="Filter channels…"
               aria-label="Filter channels by name" [value]="query()"
               (input)="query.set($any($event.target).value)" />
      </div>

      <div class="ct__scroll">
        <table class="ct__table">
          <caption class="visually-hidden">
            Live telemetry channels with current value, nominal range and windowed statistics
          </caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Group</th>
              <th scope="col" class="num">Value</th>
              <th scope="col">Unit</th>
              <th scope="col" class="num">Nominal</th>
              <th scope="col" class="num">Win min</th>
              <th scope="col" class="num">Win max</th>
              <th scope="col" class="num">σ</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.channel) {
              <tr [class.ct__row--breach]="r.breach">
                <th scope="row" class="ct__name">{{ r.label }}</th>
                <td class="ct__group">{{ r.group }}</td>
                <td class="num ct__value">{{ r.value }}</td>
                <td class="ct__unit">{{ r.unit }}</td>
                <td class="num ct__dim">{{ r.nominal }}</td>
                <td class="num ct__dim">{{ r.min }}</td>
                <td class="num ct__dim">{{ r.max }}</td>
                <td class="num ct__dim">{{ r.sd }}</td>
                <td>
                  <span class="ct__state" [attr.data-state]="r.breach ? 'breach' : 'ok'">
                    <span aria-hidden="true">{{ r.breach ? '▲' : '✓' }}</span>
                    {{ r.breach ? 'Out of range' : 'Nominal' }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="ct__empty">No channels match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .ct { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
    .ct__filters { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .ct__chip {
      font: inherit; font-size: 11px; text-transform: capitalize;
      padding: 3px 9px; border-radius: 999px; cursor: pointer;
      border: 1px solid var(--border); background: var(--surface-2); color: var(--text-secondary);
    }
    .ct__chip--on { background: var(--series-1); border-color: var(--series-1); color: #fff; }
    .ct__search {
      font: inherit; font-size: 11px; padding: 4px 9px; margin-left: auto;
      border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text-primary); min-width: 140px;
    }
    .ct__scroll { overflow: auto; max-height: var(--table-h, 340px); }
    .ct__table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .ct__table thead th {
      position: sticky; top: 0; z-index: 1;
      background: var(--surface-1); color: var(--text-muted);
      font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
      text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--baseline);
      white-space: nowrap;
    }
    .ct__table td, .ct__table tbody th {
      padding: 5px 8px; border-bottom: 1px solid var(--grid);
      text-align: left; font-weight: 400; white-space: nowrap;
    }
    .num { text-align: right !important; font-variant-numeric: tabular-nums; }
    .ct__name { color: var(--text-primary); font-weight: 500; }
    .ct__value { color: var(--text-primary); font-weight: 600; }
    .ct__unit, .ct__group { color: var(--text-secondary); }
    .ct__dim { color: var(--text-muted); }
    .ct__row--breach .ct__value { color: var(--status-critical); }
    .ct__state { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-muted); }
    .ct__state[data-state='breach'] { color: var(--status-critical); font-weight: 600; }
    .ct__empty { color: var(--text-muted); padding: 16px 8px; text-align: center; }
  `],
})
export class ChannelTableComponent {
  readonly channels = input<TelemetryEvent[]>([]);
  readonly stats = input<Map<string, TelemetryStat>>(new Map());

  readonly groups = GROUPS;
  readonly group = signal<Group>('all');
  readonly query = signal('');

  readonly rows = computed(() => {
    const g = this.group();
    const q = this.query().trim().toLowerCase();
    const stats = this.stats();

    return this.channels()
      .filter((c) => c.group !== 'signal')
      .filter((c) => g === 'all' || c.group === g)
      .filter((c) => !q || c.label.toLowerCase().includes(q) || c.channel.toLowerCase().includes(q))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))
      .map((c) => {
        const s = stats.get(c.channel);
        const breach =
          c.value !== null && c.nominalMin !== null && c.nominalMax !== null &&
          (c.value < c.nominalMin || c.value > c.nominalMax);
        return {
          channel: c.channel,
          label: c.label,
          group: c.group,
          unit: c.unit,
          value: c.valueText ?? (c.value === null ? '--' : fmt(c.value)),
          nominal: c.nominalMin === null ? '--' : `${fmt(c.nominalMin)} – ${fmt(c.nominalMax!)}`,
          min: s ? fmt(s.min) : '--',
          max: s ? fmt(s.max) : '--',
          sd: s ? fmt(s.stdDev) : '--',
          breach,
        };
      });
  });
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '--';
  if (Math.abs(v) >= 10000) return Math.round(v).toLocaleString();
  return Number(v.toFixed(2)).toString();
}
