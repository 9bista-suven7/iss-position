import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Alert } from '../../models/telemetry.models';

/**
 * Alert list. Severity is carried by an icon and a written label as well as
 * colour, so it survives colourblindness, greyscale print and forced-colors.
 */
@Component({
  selector: 'app-alert-feed',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="feed" role="list">
      @for (a of rows(); track a.id) {
        <li class="feed__row" [attr.data-sev]="a.sev">
          <span class="feed__icon" aria-hidden="true">{{ a.icon }}</span>
          <div class="feed__body">
            <div class="feed__head">
              <span class="feed__sev">{{ a.sevLabel }}</span>
              <span class="feed__title">{{ a.title }}</span>
            </div>
            <div class="feed__msg">{{ a.message }}</div>
          </div>
          <time class="feed__time" [attr.datetime]="a.iso">{{ a.clock }}</time>
        </li>
      } @empty {
        <li class="feed__empty">No alerts — all monitored channels nominal.</li>
      }
    </ul>
  `,
  styles: [`
    .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px;
            max-height: var(--feed-h, 260px); overflow-y: auto; }
    .feed__row {
      display: grid; grid-template-columns: 18px 1fr auto; gap: 9px;
      align-items: start; padding: 8px 9px;
      border: 1px solid var(--border); border-left-width: 3px;
      border-radius: 7px; background: var(--surface-2);
    }
    .feed__row[data-sev='critical'] { border-left-color: var(--status-critical); }
    .feed__row[data-sev='warning']  { border-left-color: var(--status-warning); }
    .feed__row[data-sev='info']     { border-left-color: var(--status-good); }
    .feed__row[data-sev='resolved'] { border-left-color: var(--baseline); opacity: 0.72; }
    .feed__icon { font-size: 12px; line-height: 1.5; text-align: center; }
    .feed__row[data-sev='critical'] .feed__icon { color: var(--status-critical); }
    .feed__row[data-sev='warning']  .feed__icon { color: var(--status-warning); }
    .feed__row[data-sev='info']     .feed__icon { color: var(--status-good); }
    .feed__body { min-width: 0; }
    .feed__head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
    .feed__sev {
      font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--text-muted);
    }
    .feed__title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .feed__msg { font-size: 11px; color: var(--text-secondary); margin-top: 2px; line-height: 1.45; }
    .feed__time {
      font-size: 10px; color: var(--text-muted);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .feed__empty { font-size: 11px; color: var(--text-muted); padding: 14px 4px; }
  `],
})
export class AlertFeedComponent {
  readonly alerts = input<Alert[]>([]);
  readonly limit = input<number>(40);

  readonly rows = computed(() =>
    this.alerts()
      .slice()
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, this.limit())
      .map((a, i) => {
        const sev = a.resolved ? 'resolved' : a.severity;
        return {
          id: `${a.key}-${a.tsMs}-${i}`,
          sev,
          sevLabel: a.resolved ? 'Resolved' : a.severity,
          icon: a.resolved ? '✓' : a.severity === 'critical' ? '▲' : a.severity === 'warning' ? '●' : 'ℹ',
          title: a.title,
          message: a.message,
          clock: new Date(a.tsMs).toLocaleTimeString([], { hour12: false }),
          iso: new Date(a.tsMs).toISOString(),
        };
      }),
  );
}
