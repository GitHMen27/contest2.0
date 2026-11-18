'use client';

import { ZONE_BY_ID } from '@/constants/warehouse';
import { loadHeat } from '@/lib/warehouseLayers';

const FLOW_STAGES = [
  { id: 'receiving', label: 'Приёмка', zoneId: 'receiving' },
  { id: 'qc', label: 'Контроль', zoneId: 'qc' },
  { id: 'storage', label: 'Хранение', zoneId: 'storage-a' },
  { id: 'picking', label: 'Комплектация', zoneId: 'picking' },
  { id: 'packing', label: 'Упаковка', zoneId: 'packing' },
  { id: 'docks', label: 'Отгрузка', zoneId: 'docks' },
] as const;

export function GoodsFlow({
  selectedZoneId,
  onSelectZone,
}: {
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
}) {
  const stages = FLOW_STAGES.map((stage) => {
    const zone = ZONE_BY_ID[stage.zoneId];
    return { ...stage, load: zone?.load ?? 0, zoneName: zone?.name ?? stage.label };
  });
  const bottleneck = stages.reduce((worst, stage) => (stage.load > worst.load ? stage : worst), stages[0]);

  return (
    <div className="absolute bottom-3 left-1/2 z-10 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 px-2 py-1.5 shadow-md backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-1">
        <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-soft)]">
          Поток товаров
        </span>
        <span className="truncate text-[8px] text-[var(--muted)]">
          узкое место: <span className="font-semibold text-[var(--text)]">{bottleneck.label}</span> ·{' '}
          {bottleneck.load}%
        </span>
      </div>
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
        {stages.map((stage, index) => {
          const heat = loadHeat(stage.load);
          const active = selectedZoneId === stage.zoneId;
          const isBottleneck = stage.id === bottleneck.id;
          return (
            <div key={stage.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectZone(stage.zoneId)}
                className={`group rounded-lg border px-1.5 py-1 text-left transition ${
                  active
                    ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                    : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'
                }`}
                title={`${stage.zoneName} · загрузка ${stage.load}%`}
              >
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: heat.color }}
                  />
                  <span className="text-[9px] font-medium text-[var(--text)]">{stage.label}</span>
                </span>
                <span
                  className={`mt-0.5 block text-[8px] tabular-nums ${
                    isBottleneck ? 'font-semibold text-rose-600' : 'text-[var(--muted-soft)]'
                  }`}
                >
                  {stage.load}%
                </span>
              </button>
              {index < stages.length - 1 ? (
                <span className="text-[10px] text-[var(--muted-soft)]" aria-hidden="true">
                  ›
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
