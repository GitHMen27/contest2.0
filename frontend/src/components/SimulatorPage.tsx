'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FlaskConical,
  Gauge,
  RotateCcw,
  Sparkles,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { ModuleHeader } from '@/components/ModuleHeader';
import { HUBS } from '@/constants/hubs';
import { useOperations } from '@/lib/operationsStore';
import { formatCompactMoney, formatMoney, formatNumber } from '@/lib/operationsFormat';
import { runSimulation, type SimulatorInput } from '@/lib/simulator';

const DEFAULT_INPUT: SimulatorInput = {
  hubId: 'shushary',
  overloadPct: 12,
  staffShortage: 2,
  equipmentBreakdown: 1,
  tripDelayMin: 25,
  redistributionPct: 0,
};

const PRESETS: Array<{ label: string; hint: string; patch: Partial<SimulatorInput> }> = [
  {
    label: 'Перегрузка',
    hint: '+18 п.п. к загрузке',
    patch: { overloadPct: 18, staffShortage: 0, equipmentBreakdown: 0, tripDelayMin: 0, redistributionPct: 0 },
  },
  {
    label: 'Нехватка смены',
    hint: '−4 сотрудника',
    patch: { overloadPct: 4, staffShortage: 4, equipmentBreakdown: 0, tripDelayMin: 10, redistributionPct: 0 },
  },
  {
    label: 'Авария техники',
    hint: '3 единицы',
    patch: { overloadPct: 6, staffShortage: 0, equipmentBreakdown: 3, tripDelayMin: 0, redistributionPct: 0 },
  },
  {
    label: 'Задержки рейсов',
    hint: '+60 минут',
    patch: { overloadPct: 2, staffShortage: 1, equipmentBreakdown: 0, tripDelayMin: 60, redistributionPct: 0 },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function MetricCard({
  label,
  hint,
  before,
  after,
  format,
  inverse = false,
}: {
  label: string;
  hint: string;
  before: number;
  after: number;
  format: (value: number) => string;
  inverse?: boolean;
}) {
  const delta = after - before;
  const better = inverse ? delta < 0 : delta > 0;
  const neutral = Math.abs(delta) < 0.01;
  const deltaText =
    Math.abs(delta) < 0.01
      ? 'без изменений'
      : `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">{label}</div>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${
            neutral
              ? 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted)]'
              : better
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {deltaText}
        </span>
      </div>
      <div className="mt-1.5 flex items-end gap-1.5">
        <span className="text-[19px] font-semibold leading-none tabular-nums text-[var(--text)]">
          {format(after)}
        </span>
        <span className="pb-0.5 text-[9px] text-[var(--muted-soft)]">после</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[9px] text-[var(--muted)]">
        <span>до: {format(before)}</span>
        <ArrowRight className="h-2.5 w-2.5" />
        <span className="truncate">{hint}</span>
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-end justify-between gap-2">
        <span className="text-[10px] font-medium text-[var(--text)]">{label}</span>
        <span className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--muted)]">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 h-1.5 w-full cursor-pointer accent-[var(--accent)]"
      />
      <div className="mt-0.5 text-[8px] leading-snug text-[var(--muted-soft)]">{hint}</div>
    </label>
  );
}

function ComparisonBar({
  label,
  before,
  after,
  max,
  tone,
  format,
}: {
  label: string;
  before: number;
  after: number;
  max: number;
  tone: 'accent' | 'emerald' | 'amber' | 'rose';
  format: (value: number) => string;
}) {
  const toneClass = {
    accent: 'bg-[var(--accent)]',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[tone];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[9px]">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="tabular-nums text-[var(--muted)]">
          {format(before)} <ArrowRight className="mx-0.5 inline h-2.5 w-2.5" /> {format(after)}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full rounded-full bg-[var(--line-strong)]" style={{ width: `${clamp((before / max) * 100, 0, 100)}%` }} />
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${clamp((after / max) * 100, 0, 100)}%` }} />
        </div>
      </div>
      <div className="mt-0.5 flex justify-between text-[7.5px] uppercase tracking-[0.06em] text-[var(--muted-soft)]">
        <span>до</span>
        <span>после</span>
      </div>
    </div>
  );
}

export function SimulatorPage() {
  const { incidents } = useOperations();
  const [input, setInput] = useState<SimulatorInput>(DEFAULT_INPUT);
  const result = useMemo(() => runSimulation(input, incidents), [input, incidents]);
  const selectedHub = HUBS.find((hub) => hub.id === input.hubId) ?? HUBS[0];
  const riskTone =
    result.riskLevel === 'critical'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : result.riskLevel === 'attention'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  const riskLabel =
    result.riskLevel === 'critical'
      ? 'Критический сценарий'
      : result.riskLevel === 'attention'
        ? 'Требует внимания'
        : 'Устойчивый сценарий';

  const update = <K extends keyof SimulatorInput>(key: K, value: SimulatorInput[K]) => {
    setInput((previous) => ({ ...previous, [key]: value }));
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)] text-[var(--text)]">
      <ModuleHeader
        title="Симулятор сценариев"
        subtitle="Проверка перегрузки, смены, техники и задержек без изменения основной системы"
        badge={
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-medium text-amber-800">
            <FlaskConical className="h-2.5 w-2.5" />
            симуляция · не меняет данные
          </span>
        }
        icon={<FlaskConical className="h-4 w-4" />}
      />

      <main className="mx-auto grid w-full max-w-6xl gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-4">
        <section className="space-y-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-semibold text-[var(--text)]">Параметры сценария</h2>
                <p className="mt-0.5 text-[9px] text-[var(--muted)]">Изменения только в этой вкладке</p>
              </div>
              <button
                type="button"
                onClick={() => setInput(DEFAULT_INPUT)}
                className="flex h-7 items-center gap-1 rounded-lg border border-[var(--line)] px-2 text-[9px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text)]"
              >
                <RotateCcw className="h-3 w-3" />
                Сброс
              </button>
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] font-medium text-[var(--text)]">Распределительный центр</span>
              <select
                value={input.hubId}
                onChange={(event) => update('hubId', event.target.value)}
                className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
              >
                {HUBS.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name} · {hub.load}%
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3 space-y-3">
              <Slider
                label="Дополнительная загрузка"
                hint="Поток, который приходит сверх текущего"
                value={input.overloadPct}
                min={0}
                max={30}
                step={1}
                unit="п.п."
                onChange={(value) => update('overloadPct', value)}
              />
              <Slider
                label="Нехватка сотрудников"
                hint="Сколько человек смены недоступно"
                value={input.staffShortage}
                min={0}
                max={8}
                step={1}
                unit="чел."
                onChange={(value) => update('staffShortage', value)}
              />
              <Slider
                label="Аварийная техника"
                hint="Единицы, выведенные из строя"
                value={input.equipmentBreakdown}
                min={0}
                max={4}
                step={1}
                unit="ед."
                onChange={(value) => update('equipmentBreakdown', value)}
              />
              <Slider
                label="Задержка рейсов"
                hint="Средняя дополнительная задержка"
                value={input.tripDelayMin}
                min={0}
                max={120}
                step={5}
                unit="мин"
                onChange={(value) => update('tripDelayMin', value)}
              />
              <Slider
                label="Перераспределение потока"
                hint="Сколько потока уходит на соседний РЦ"
                value={input.redistributionPct}
                min={0}
                max={25}
                step={1}
                unit="п.п."
                onChange={(value) => update('redistributionPct', value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Быстрые сценарии
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setInput({ ...DEFAULT_INPUT, hubId: input.hubId, ...preset.patch })}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1.5 text-left transition hover:border-[var(--accent-line-2)] hover:bg-[var(--accent-soft)]"
                >
                  <span className="block text-[9px] font-medium text-[var(--text)]">{preset.label}</span>
                  <span className="mt-0.5 block text-[8px] text-[var(--muted-soft)]">{preset.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-medium text-[var(--muted)]">
              <Gauge className="h-3 w-3" />
              Базовая точка: {selectedHub.name}
            </div>
            <p className="mt-1 text-[8.5px] leading-relaxed text-[var(--muted-soft)]">
              В расчёте участвуют текущие открытые инциденты из демо-центра. Симуляция читает их, но не меняет
              статусы, задачи или карту.
            </p>
          </div>
        </section>

        <section className="min-w-0 space-y-3">
          <div className={`rounded-xl border px-3 py-2.5 ${riskTone}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {result.riskLevel === 'stable' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <div>
                  <div className="text-[11px] font-semibold">{riskLabel}</div>
                  <div className="text-[8.5px] opacity-80">
                    {selectedHub.name} · загрузка {result.before.load}% → {result.after.load}% · SLA{' '}
                    {formatNumber(result.before.sla, 1)}% → {formatNumber(result.after.sla, 1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] opacity-80">
                <span className="rounded-full border border-current/20 bg-white/30 px-1.5 py-0.5">
                  {formatCompactMoney(result.before.dailyCost)} / сут
                </span>
                <ArrowRight className="h-2.5 w-2.5" />
                <span className="rounded-full border border-current/20 bg-white/30 px-1.5 py-0.5 font-semibold">
                  {formatCompactMoney(result.after.dailyCost)} / сут
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="SLA"
              hint="целевой уровень 94%"
              before={result.before.sla}
              after={result.after.sla}
              format={(value) => `${formatNumber(value, 1)}%`}
            />
            <MetricCard
              label="Пропускная"
              hint="паллет/ч"
              before={result.before.throughput}
              after={result.after.throughput}
              format={(value) => formatNumber(value)}
            />
            <MetricCard
              label="Заказы"
              hint="в сутки"
              before={result.before.ordersPerDay}
              after={result.after.ordersPerDay}
              format={(value) => formatNumber(value)}
            />
            <MetricCard
              label="Стоимость заказа"
              hint="демо-тарифы"
              before={result.before.costPerOrder}
              after={result.after.costPerOrder}
              format={(value) => formatMoney(value)}
              inverse
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--text)]">
                  <BarChart3 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Сравнение «до / после»
                </h2>
                <span className="text-[8px] text-[var(--muted-soft)]">серая шкала — до</span>
              </div>
              <div className="mt-3 space-y-3">
                <ComparisonBar
                  label="Загрузка"
                  before={result.before.load}
                  after={result.after.load}
                  max={140}
                  tone={result.after.load >= 95 ? 'rose' : result.after.load >= 85 ? 'amber' : 'emerald'}
                  format={(value) => `${Math.round(value)}%`}
                />
                <ComparisonBar
                  label="Пропускная способность"
                  before={result.before.throughput}
                  after={result.after.throughput}
                  max={Math.max(result.before.throughput, result.after.throughput, 1) * 1.15}
                  tone="accent"
                  format={(value) => formatNumber(value)}
                />
                <ComparisonBar
                  label="SLA"
                  before={result.before.sla}
                  after={result.after.sla}
                  max={100}
                  tone={result.after.sla >= 94 ? 'emerald' : result.after.sla >= 90 ? 'amber' : 'rose'}
                  format={(value) => `${formatNumber(value, 1)}%`}
                />
                <ComparisonBar
                  label="Ожидание на доке"
                  before={result.before.waitMin}
                  after={result.after.waitMin}
                  max={Math.max(result.before.waitMin, result.after.waitMin, 1) * 1.15}
                  tone={result.after.waitMin > result.before.waitMin * 1.5 ? 'rose' : 'amber'}
                  format={(value) => `${formatNumber(value, 1)} мин`}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-[var(--line-soft)] pt-2.5">
                <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                  <div className="text-[8px] text-[var(--muted-soft)]">Рейсов в сутки</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold tabular-nums">
                    <Truck className="h-3 w-3 text-[var(--muted)]" />
                    {result.before.tripsPerDay} <ArrowRight className="h-2.5 w-2.5 text-[var(--muted-soft)]" />{' '}
                    {result.after.tripsPerDay}
                  </div>
                </div>
                <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                  <div className="text-[8px] text-[var(--muted-soft)]">Расходы в сутки</div>
                  <div className="mt-0.5 text-[10px] font-semibold tabular-nums">
                    {formatCompactMoney(result.after.dailyCost)}
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-3">
              <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <h2 className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--text)]">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Риски сценария
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {result.risks.map((risk) => (
                    <li key={risk} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--muted)]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--accent)]">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI-рекомендации
                  </h2>
                  <span className="rounded-full border border-[var(--accent-line-2)] bg-[var(--surface)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">
                    демо-модель
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {result.recommendations.map((recommendation) => (
                    <li key={recommendation} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--muted)]">
                      <span className="mt-0.5 text-[var(--accent)]">→</span>
                      {recommendation}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-[var(--accent-line)] pt-1.5 text-[8px] leading-snug text-[var(--muted-soft)]">
                  Рекомендации сформированы правилами по демо-параметрам. Кнопок применения здесь нет: сценарий
                  не изменяет карту, инциденты и задачи.
                </p>
              </section>
            </div>
          </div>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[10.5px] font-semibold text-[var(--text)]">Модель и допущения</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] text-amber-800">
                <Users className="h-2.5 w-2.5" />
                прозрачные формулы
              </span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[9px] font-medium text-[var(--accent)]">
                Показать формулы расчёта
              </summary>
              <ul className="mt-2 space-y-1.5 border-t border-[var(--line-soft)] pt-2">
                {result.assumptions.map((assumption) => (
                  <li key={assumption} className="flex items-start gap-1.5 text-[8.5px] leading-relaxed text-[var(--muted)]">
                    <Wrench className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[var(--muted-soft)]" />
                    {assumption}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-3 pb-3 text-[8px] text-[var(--muted-soft)] sm:px-4">
        Демонстрационная модель. Все числа — оценка, а не оперативная отчётность. Основные данные сайта не
        изменяются.
      </footer>
    </div>
  );
}
