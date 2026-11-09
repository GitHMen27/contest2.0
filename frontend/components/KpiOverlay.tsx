'use client';

interface KpiOverlayProps {
  activeShipments: number;
  networkLoad: number;
  criticalHubs: number;
  routeRisk: number | null;
}

function riskTone(risk: number | null): string {
  if (risk === null) return 'text-[var(--muted-soft)]';
  if (risk < 35) return 'text-emerald-700';
  if (risk < 65) return 'text-amber-700';
  return 'text-rose-700';
}

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <span className={`text-[13px] font-semibold ${valueClassName ?? 'text-[var(--text)]'}`}>{value}</span>
    </div>
  );
}

export function KpiOverlay({ activeShipments, networkLoad, criticalHubs, routeRisk }: KpiOverlayProps) {
  return (
    <div className="hidden shrink-0 items-center gap-6 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-2.5 lg:flex">
      <Stat label="В пути" value={String(activeShipments)} />
      <span className="h-4 w-px bg-[var(--line)]" />
      <Stat label="Загрузка сети" value={`${networkLoad}%`} />
      <span className="h-4 w-px bg-[var(--line)]" />
      <Stat
        label="Критичные РЦ"
        value={String(criticalHubs)}
        valueClassName={criticalHubs > 0 ? 'text-rose-700' : 'text-emerald-700'}
      />
      <span className="h-4 w-px bg-[var(--line)]" />
      <Stat
        label="Риск маршрута"
        value={routeRisk === null ? '—' : `${routeRisk}%`}
        valueClassName={riskTone(routeRisk)}
      />
    </div>
  );
}
