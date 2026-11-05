'use client';

import type { ActiveShipment } from '@/types/logistics';

interface LiveFeedProps {
  shipments: ActiveShipment[];
}

export function LiveFeed({ shipments }: LiveFeedProps) {
  const priorityCount = shipments.filter((shipment) => shipment.isPriority).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Live feed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {priorityCount > 0 ? (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-300">
              {priorityCount} приоритет
            </span>
          ) : null}
          <span className="rounded-full border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-slate-500">
            {shipments.length} в пути
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5">
        {shipments.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/5 bg-white/[0.02] text-base">
              🛰
            </div>
            <div className="text-[10px] text-slate-500">Инициализация потока данных…</div>
          </div>
        ) : (
          shipments.map((shipment) => (
            <div
              key={shipment.id}
              className={`rounded-xl border px-2.5 py-2 transition-all ${
                shipment.isPriority
                  ? 'border-amber-400/40 bg-amber-500/[0.07] shadow-[0_0_24px_-14px_rgba(251,191,36,0.8)]'
                  : 'border-white/5 bg-slate-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate font-mono text-[10px] font-semibold ${
                    shipment.isPriority ? 'text-amber-200' : 'text-slate-300'
                  }`}
                >
                  {shipment.id}
                </span>
                {shipment.isPriority ? (
                  <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-950">
                    ⚡ приоритет
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[8px] text-slate-500">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {shipment.statusText}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">
                {shipment.fromName} <span className="text-slate-600">→</span> {shipment.toName}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-100 ${
                      shipment.isPriority
                        ? 'bg-linear-to-r from-amber-400 to-orange-400'
                        : 'bg-linear-to-r from-purple-500 to-indigo-400'
                    }`}
                    style={{ width: `${Math.min(shipment.progress, 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[8px] text-slate-500">
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
