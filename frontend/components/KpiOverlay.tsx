'use client';

interface KpiOverlayProps {
  activeShipments: number;
  networkLoad: number;
  criticalHubs: number;
  routeRisk: number | null;
}

function riskTone(risk: number | null): string {
  if (risk === null) return 'text-slate-400';
  if (risk < 35) return 'text-emerald-300';
  if (risk < 65) return 'text-amber-300';
  return 'text-rose-300';
}

export function KpiOverlay({ activeShipments, networkLoad, criticalHubs, routeRisk }: KpiOverlayProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[1000] hidden w-[300px] grid-cols-2 gap-1.5 lg:grid">
      <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 p-2.5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">В пути</span>
          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
        </div>
        <div className="mt-1 text-xl font-semibold text-white">{activeShipments}</div>
        <div className="text-[8px] text-slate-500">активных рейсов</div>
      </div>

      <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 p-2.5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Сеть РЦ</span>
          <span className="text-[8px] text-slate-500">6 РЦ</span>
        </div>
        <div className="mt-1 text-xl font-semibold text-white">{networkLoad}%</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-linear-to-r from-emerald-400 via-amber-400 to-rose-400"
            style={{ width: `${networkLoad}%` }}
          />
        </div>
      </div>

      <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 p-2.5 shadow-xl backdrop-blur-xl">
        <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Критичных РЦ</span>
        <div className={`mt-1 text-xl font-semibold ${criticalHubs > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
          {criticalHubs}
        </div>
        <div className="text-[8px] text-slate-500">требуют внимания</div>
      </div>

      <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 p-2.5 shadow-xl backdrop-blur-xl">
        <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Риск маршрута</span>
        <div className={`mt-1 text-xl font-semibold ${riskTone(routeRisk)}`}>
          {routeRisk === null ? '—' : `${routeRisk}%`}
        </div>
        <div className="text-[8px] text-slate-500">по выбранному плечу</div>
      </div>
    </div>
  );
}
