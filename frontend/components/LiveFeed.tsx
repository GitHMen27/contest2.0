'use client';

import type { ActiveShipment } from '@/types/logistics';

interface LiveFeedProps {
  shipments: ActiveShipment[];
}

export function LiveFeed({ shipments }: LiveFeedProps) {
  const priorityCount = shipments.filter((shipment) => shipment.isPriority).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-[var(--text)]">Активные рейсы</span>
        </div>
        <div className="flex items-center gap-1.5">
          {priorityCount > 0 ? (
            <span className="rounded-full bg-[var(--priority-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--priority)]">
              {priorityCount} приоритет
            </span>
          ) : null}
          <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
            {shipments.length} в пути
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {shipments.length === 0 ? (
          <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1.5 text-center">
            <div className="text-[11px] text-[var(--muted)]">Поток данных запускается…</div>
            <div className="text-[10px] text-[var(--muted-soft)]">Рейсы появятся через несколько секунд</div>
          </div>
        ) : (
          shipments.map((shipment) => (
            <div
              key={shipment.id}
              className={`rounded-lg border px-3 py-2.5 ${
                shipment.isPriority ? 'border-[var(--priority-line)] bg-[var(--priority-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate font-mono text-[11px] font-medium ${
                    shipment.isPriority ? 'text-[var(--priority)]' : 'text-[var(--text)]'
                  }`}
                >
                  {shipment.id}
                </span>
                {shipment.isPriority ? (
                  <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--priority)] ring-1 ring-[var(--priority-line)]">
                    приоритет
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--muted)]">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    {shipment.statusText}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                {shipment.fromName} <span className="text-[var(--muted-soft)]">→</span> {shipment.toName}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className={`h-full rounded-full transition-all duration-100 ${
                      shipment.isPriority ? 'bg-[var(--priority)]' : 'bg-[var(--accent)]'
                    }`}
                    style={{ width: `${Math.min(shipment.progress, 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[9px] text-[var(--muted-soft)]">
                  {Math.round(shipment.progress)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
