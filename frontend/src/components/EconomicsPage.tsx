'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Fuel,
  Info,
  Route,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { ModuleHeader } from '@/components/ModuleHeader';
import {
  ECONOMY_ASSUMPTIONS,
  ECONOMY_TARIFFS,
  HUB_OPERATIONS,
} from '@/constants/economics';
import { useOperations } from '@/lib/operationsStore';
import { computeNetworkPerformance } from '@/lib/networkMetrics';
import { formatCompactMoney, formatMoney, formatNumber } from '@/lib/operationsFormat';

type SortMode = 'cost' | 'sla';

const COST_SEGMENTS = [
  { key: 'fuel', label: 'Топливо', color: 'bg-amber-500' },
  { key: 'driver', label: 'Водители', color: 'bg-sky-500' },
  { key: 'toll', label: 'Платные участки', color: 'bg-violet-500' },
  { key: 'idle', label: 'Простой', color: 'bg-rose-500' },
  { key: 'order', label: 'Обработка заказов', color: 'bg-emerald-500' },
  { key: 'overhead', label: 'Накладные РЦ', color: 'bg-slate-400' },
  { key: 'incident', label: 'Инциденты', color: 'bg-red-600' },
] as const;

function slaTone(value: number): string {
  return value >= 94 ? 'text-emerald-700' : value >= 90 ? 'text-amber-700' : 'text-rose-700';
}

function loadTone(value: number): string {
  return value >= 90 ? 'bg-rose-500' : value >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
}

export function EconomicsPage() {
  const { incidents } = useOperations();
  const metrics = useMemo(() => computeNetworkPerformance(incidents), [incidents]);
  const [sortMode, setSortMode] = useState<SortMode>('cost');
  const [selectedId, setSelectedId] = useState('shushary');

  const totals = useMemo(() => {
    return metrics.hubs.reduce(
      (sum, item) => {
        const trips = item.tripsPerDay;
        const toll =
          Math.max(0, item.tripCost - item.fuelCost - item.driverCost) * trips;
        return {
          fuel: sum.fuel + item.fuelCost * trips,
          driver: sum.driver + item.driverCost * trips,
          toll: sum.toll + toll,
          idle: sum.idle + item.idleCost,
          order: sum.order + item.orderCost,
          overhead: sum.overhead + item.overhead,
          incident: sum.incident + item.incidentLoss,
          trips: sum.trips + trips,
          orders: sum.orders + item.ordersPerDay,
        };
      },
      {
        fuel: 0,
        driver: 0,
        toll: 0,
        idle: 0,
        order: 0,
        overhead: 0,
        incident: 0,
        trips: 0,
        orders: 0,
      },
    );
  }, [metrics.hubs]);

  const totalCost = Math.max(
    1,
    totals.fuel + totals.driver + totals.toll + totals.idle + totals.order + totals.overhead + totals.incident,
  );
  const sortedHubs = useMemo(
    () =>
      [...metrics.hubs].sort((a, b) =>
        sortMode === 'cost' ? a.costPerOrder - b.costPerOrder : b.sla - a.sla,
      ),
    [metrics.hubs, sortMode],
  );
  const selected = metrics.hubs.find((item) => item.hub.id === selectedId) ?? metrics.hubs[0];
  const selectedToll = Math.max(
    0,
    selected.tripCost - selected.fuelCost - selected.driverCost,
  );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)] text-[var(--text)]">
      <ModuleHeader
        title="Экономика сети"
        subtitle="Стоимость рейсов, топлива, простоя и заказов по каждому РЦ"
        badge={
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-medium text-amber-800">
            <Wallet className="h-2.5 w-2.5" />
            демо-тарифы
          </span>
        }
        icon={<Wallet className="h-4 w-4" />}
      />

      <main className="mx-auto w-full max-w-6xl space-y-3 px-3 py-3 sm:px-4">
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Расходы сети</div>
              <CircleDollarSign className="h-3.5 w-3.5 text-[var(--accent)]" />
            </div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums">{formatCompactMoney(metrics.dailyCost)}</div>
            <div className="mt-0.5 text-[8px] text-[var(--muted)]">в сутки · демо-расчёт</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Стоимость заказа</div>
              <BarChart3 className="h-3.5 w-3.5 text-[var(--accent)]" />
            </div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums">{formatMoney(metrics.costPerOrder)}</div>
            <div className="mt-0.5 text-[8px] text-[var(--muted)]">средневзвешенно по сети</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Заказы и рейсы</div>
              <Route className="h-3.5 w-3.5 text-[var(--accent)]" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold tabular-nums">{formatNumber(metrics.ordersPerDay)}</span>
              <span className="text-[9px] text-[var(--muted)]">заказов</span>
            </div>
            <div className="mt-0.5 text-[8px] text-[var(--muted)]">{metrics.tripsPerDay} рейсов в сутки</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">SLA сети</div>
              <span className={`text-[20px] font-semibold tabular-nums ${slaTone(metrics.sla)}`}>
                {formatNumber(metrics.sla, 1)}%
              </span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className={`h-full rounded-full ${metrics.sla >= 94 ? 'bg-emerald-500' : metrics.sla >= 90 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.min(100, metrics.sla)}%` }}
              />
            </div>
            <div className="mt-1 text-[8px] text-[var(--muted)]">
              {metrics.openIncidents} открытых инцидентов · {formatCompactMoney(metrics.incidentLoss)} потерь
            </div>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Fuel className="h-3.5 w-3.5 text-amber-600" />
                Структура расходов сети
              </h2>
              <span className="text-[8px] text-[var(--muted-soft)]">нажмите на сегмент в легенде для расшифровки ниже</span>
            </div>

            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              {COST_SEGMENTS.map((segment) => {
                const value = totals[segment.key];
                const share = (value / totalCost) * 100;
                if (share <= 0) return null;
                return (
                  <div
                    key={segment.key}
                    className={`${segment.color} h-full`}
                    style={{ width: `${share}%` }}
                    title={`${segment.label}: ${formatMoney(value)}`}
                  />
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {COST_SEGMENTS.map((segment) => {
                const value = totals[segment.key];
                const share = Math.round((value / totalCost) * 1000) / 10;
                return (
                  <div key={segment.key} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${segment.color}`} />
                      <span className="truncate text-[8px] text-[var(--muted)]">{segment.label}</span>
                    </div>
                    <div className="mt-0.5 text-[9.5px] font-semibold tabular-nums">{formatCompactMoney(value)}</div>
                    <div className="text-[7.5px] text-[var(--muted-soft)]">{formatNumber(share, 1)}%</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-[var(--line-soft)] pt-2 text-[8px] text-[var(--muted-soft)]">
              <span>Итого в сутки: {formatMoney(metrics.dailyCost)}</span>
              <span>Проверка: {formatMoney(totalCost)}</span>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
                Сравнение РЦ
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSortMode('cost')}
                  className={`rounded-full border px-2 py-0.5 text-[8px] transition ${
                    sortMode === 'cost'
                      ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  по стоимости
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('sla')}
                  className={`rounded-full border px-2 py-0.5 text-[8px] transition ${
                    sortMode === 'sla'
                      ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  по SLA
                </button>
              </div>
            </div>

            <div className="mt-2 space-y-1">
              {sortedHubs.map((item) => (
                <button
                  key={item.hub.id}
                  type="button"
                  onClick={() => setSelectedId(item.hub.id)}
                  className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${
                    selected.hub.id === item.hub.id
                      ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line-soft)] bg-[var(--surface-soft)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${loadTone(item.load)}`} />
                      <span className="truncate text-[9.5px] font-medium text-[var(--text)]">{item.hub.name}</span>
                    </span>
                    <span className="shrink-0 text-[8px] text-[var(--muted)]">{item.load}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[8px] text-[var(--muted)]">
                    <span>{formatMoney(item.costPerOrder)} / заказ</span>
                    <span className={slaTone(item.sla)}>SLA {formatNumber(item.sla, 1)}%</span>
                    <span className="tabular-nums">{formatCompactMoney(item.dailyCost)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {selected ? (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-[11px] font-semibold">{selected.hub.name}</h2>
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[8px] text-[var(--muted)]">
                    {HUB_OPERATIONS[selected.hub.id]?.note ?? 'демо-РЦ'}
                  </span>
                </div>
                <p className="mt-0.5 text-[8.5px] text-[var(--muted)]">
                  {selected.hub.city} · {HUB_OPERATIONS[selected.hub.id]?.docks ?? '—'} доков · маршрут от Москвы{' '}
                  {selected.routeKm} км
                </p>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] text-amber-800">
                формулы открыты
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] p-2.5">
                <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Стоимость одного рейса
                </div>
                <div className="mt-1.5 space-y-1 text-[9px] text-[var(--muted)]">
                  <div className="flex justify-between gap-2">
                    <span>Топливо: {selected.routeKm} км × 32 л/100 км × 62 ₽</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.fuelCost)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Водитель: {selected.routeKm} км / 55 км/ч + 2 ч × 850 ₽</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.driverCost)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Платные участки: {selected.routeKm} км × 4,5 ₽</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selectedToll)}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-[var(--line)] pt-1 font-medium text-[var(--text)]">
                    <span>Итого за рейс</span>
                    <span className="tabular-nums">{formatMoney(selected.tripCost)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] p-2.5">
                <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Стоимость суток
                </div>
                <div className="mt-1.5 space-y-1 text-[9px] text-[var(--muted)]">
                  <div className="flex justify-between gap-2">
                    <span>{selected.tripsPerDay} рейсов × {formatMoney(selected.tripCost)}</span>
                    <span className="tabular-nums text-[var(--text)]">
                      {formatMoney(selected.tripsPerDay * selected.tripCost)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Простой: {selected.idleHours} ч × 1 200 ₽</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.idleCost)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Заказы: {formatNumber(selected.ordersPerDay)} × 45 ₽</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.orderCost)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Накладные РЦ</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.overhead)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Потери от инцидентов</span>
                    <span className="tabular-nums text-[var(--text)]">{formatMoney(selected.incidentLoss)}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-[var(--line)] pt-1 font-medium text-[var(--text)]">
                    <span>Итого в сутки</span>
                    <span className="tabular-nums">{formatMoney(selected.dailyCost)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                <div className="text-[8px] text-[var(--muted-soft)]">Пропускная</div>
                <div className="mt-0.5 text-[11px] font-semibold tabular-nums">{selected.throughput} паллет/ч</div>
              </div>
              <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                <div className="text-[8px] text-[var(--muted-soft)]">Стоимость заказа</div>
                <div className="mt-0.5 text-[11px] font-semibold tabular-nums">{formatMoney(selected.costPerOrder)}</div>
              </div>
              <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                <div className="text-[8px] text-[var(--muted-soft)]">SLA</div>
                <div className={`mt-0.5 text-[11px] font-semibold tabular-nums ${slaTone(selected.sla)}`}>
                  {formatNumber(selected.sla, 1)}%
                </div>
              </div>
              <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                <div className="text-[8px] text-[var(--muted-soft)]">Открытые инциденты</div>
                <div className={`mt-0.5 text-[11px] font-semibold tabular-nums ${selected.openIncidents > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {selected.openIncidents}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)]">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text)]">
              <Info className="h-3.5 w-3.5 text-[var(--muted)]" />
              Как считаются деньги
            </div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {ECONOMY_ASSUMPTIONS.map((assumption) => (
                <li key={assumption} className="flex items-start gap-1.5 text-[8.5px] leading-relaxed text-[var(--muted)]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                  {assumption}
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-[var(--line)] pt-2 text-[8px] leading-relaxed text-[var(--muted-soft)]">
              Тарифы: {ECONOMY_TARIFFS.fuelPricePerLitre} ₽/л, {ECONOMY_TARIFFS.fuelLitresPer100Km} л/100 км,{' '}
              {ECONOMY_TARIFFS.driverHourly} ₽/ч водителя, {ECONOMY_TARIFFS.tollPerKm} ₽/км,{' '}
              {ECONOMY_TARIFFS.idleHour} ₽/ч простоя, {ECONOMY_TARIFFS.orderProcessing} ₽/заказ,{' '}
              {formatMoney(ECONOMY_TARIFFS.hubOverheadPerDay)} накладных. Это демонстрационные значения, не
              коммерческие данные.
            </p>
          </section>

          <section className="flex flex-col justify-between rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
            <div>
              <h2 className="text-[10px] font-semibold text-[var(--accent)]">Проверить сценарий</h2>
              <p className="mt-1 text-[9px] leading-relaxed text-[var(--muted)]">
                Симулятор покажет, как изменятся SLA, стоимость заказа и пропускная способность при перегрузке,
                нехватке смены или задержке рейсов.
              </p>
            </div>
            <Link
              href="/simulator"
              className="mt-2 flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-line-2)] bg-[var(--surface)] text-[9px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft-2)]"
            >
              Открыть симулятор
              <ArrowRight className="h-3 w-3" />
            </Link>
          </section>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-3 pb-3 text-[8px] text-[var(--muted-soft)] sm:px-4">
        Демо-экономика: расчёт по публичным допущениям и демо-инцидентам. Не является бухгалтерской или
        оперативной отчётностью.
      </footer>
    </div>
  );
}
