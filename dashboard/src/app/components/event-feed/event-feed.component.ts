import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitEvent } from '../../models/telemetry.models';

const ICONS: Record<string, string> = {
  EQUATOR_CROSSING: '↗',
  ORBITAL_SUNRISE: '☀',
  ORBITAL_SUNSET: '☾',
  REGION_CHANGE: '⌖',
};

const NAMES: Record<string, string> = {
  EQUATOR_CROSSING: 'Equator crossing',
  ORBITAL_SUNRISE: 'Orbital sunrise',
  ORBITAL_SUNSET: 'Orbital sunset',
  REGION_CHANGE: 'Region change',
};

/** Discrete orbital moments emitted by the Flink side output. */
@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="ev" role="list">
      @for (e of rows(); track e.id) {
        <li class="ev__row">
          <span class="ev__icon" aria-hidden="true">{{ e.icon }}</span>
          <div class="ev__body">
            <div class="ev__name">{{ e.name }}<span class="ev__orbit">orbit {{ e.orbit }}</span></div>
            <div class="ev__detail">{{ e.detail }}</div>
          </div>
          <time class="ev__time">{{ e.clock }}</time>
        </li>
      } @empty {
        <li class="ev__empty">
          No orbital events yet — equator and terminator crossings appear here
          as the station reaches them.
        </li>
      }
    </ul>
  `,
  styles: [`
    .ev { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px;
          max-height: var(--feed-h, 240px); overflow-y: auto; }
    .ev__row {
      display: grid; grid-template-columns: 16px 1fr auto; gap: 9px; align-items: start;
      padding: 7px 8px; border-radius: 7px; background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .ev__icon { color: var(--series-1); font-size: 12px; text-align: center; }
    .ev__body { min-width: 0; }
    .ev__name { font-size: 12px; font-weight: 600; color: var(--text-primary);
                display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
    .ev__orbit { font-size: 10px; font-weight: 500; color: var(--text-muted); }
    .ev__detail { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
    .ev__time { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .ev__empty { font-size: 11px; color: var(--text-muted); padding: 14px 4px; line-height: 1.5; }
  `],
})
export class EventFeedComponent {
  readonly events = input<OrbitEvent[]>([]);
  readonly limit = input<number>(30);

  readonly rows = computed(() =>
    this.events()
      .slice()
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, this.limit())
      .map((e, i) => ({
        id: `${e.type}-${e.tsMs}-${i}`,
        icon: ICONS[e.type] ?? '•',
        name: NAMES[e.type] ?? e.type,
        detail: e.detail,
        orbit: e.orbitNumber,
        clock: new Date(e.tsMs).toLocaleTimeString([], { hour12: false }),
      })),
  );
}
