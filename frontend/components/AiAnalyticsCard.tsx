'use client';

import React from 'react';
import { ArrowRight, Check, ChevronDown, TriangleAlert } from 'lucide-react';
import type { AiAnalyticsResult } from '@/types/logistics';

interface AiAnalyticsCardProps {
  analytics: AiAnalyticsResult | null;
  isLoading?: boolean;
  onAsk?: (question: string) => void;
}

interface RiskTone {
  label: string;
  text: string;
  border: string;
  bg: string;
  stroke: string;
}

function getRiskTone(score: number): RiskTone {
  if (score < 35) {
    return {
      label: 'Низкий',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      stroke: '#12b76a',
    };
  }
  if (score < 65) {
    return {
      label: 'Средний',
      text: 'text-amber-700',
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      stroke: '#f79009',
    };
  }
  return {
    label: 'Высокий',
    text: 'text-rose-700',
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    stroke: '#f04438',
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2.5 py-2">
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-[var(--text)]">{value}</div>
      {hint ? <div className="text-[10px] text-[var(--muted-soft)]">{hint}</div> : null}
    </div>
  );
}

export const AiAnalyticsCard: React.FC<AiAnalyticsCardProps> = ({ analytics, isLoading, onAsk }) => {
  if (isLoading) {
    return (
      <div className="shrink-0 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="mb-3 h-4 w-1/2 rounded bg-[var(--surface-muted)]" />
        <div className="mb-2 h-24 rounded bg-[var(--surface-muted)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--surface-muted)]" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="shrink-0 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-5 text-center">
        <div className="text-[13px] font-medium text-[var(--text)]">AI-анализ маршрута</div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
          Выберите разные РЦ отправления и назначения, чтобы увидеть риск, топливо и рекомендации по
          регламентам.
        </p>
      </div>
    );
  }

  const tone = getRiskTone(analytics.riskScore);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - analytics.riskScore / 100);
  const question = `Рейс ${analytics.distanceKm} км, ${analytics.estimatedHours} ч в пути. Что говорят регламенты про дальние рейсы, отдых водителя и ограничения?`;

  return (
    <section className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text)]">AI-анализ маршрута</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">правила · 3 регламента</p>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone.border} ${tone.bg} ${tone.text}`}
        >
          Риск {tone.label.toLowerCase()}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={tone.stroke}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-lg font-semibold ${tone.text}`}>{analytics.riskScore}%</span>
            <span className="text-[9px] text-[var(--muted)]">риск</span>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          <Metric label="Расстояние" value={`${analytics.distanceKm.toLocaleString('ru-RU')} км`} />
          <Metric label="В пути" value={`${analytics.estimatedHours} ч`} hint={`${analytics.optimalSpeedKmh} км/ч`} />
          <Metric label="Топливо" value={`${analytics.fuelConsumptionLitres} л`} hint="32 л / 100 км" />
          <Metric label="CO₂" value={`${analytics.co2EmissionsKg} кг`} hint="2,68 кг / л" />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
        <div className="mb-1 text-[10px] font-semibold text-[var(--accent)]">Рекомендация</div>
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">{analytics.recommendation}</p>
      </div>

      <details className="group mt-3 rounded-lg border border-[var(--line)] [&::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10px] text-[var(--muted)] transition hover:text-[var(--text)]">
          <span>Факторы риска</span>
          <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
            {analytics.activeRisks.length}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-[var(--muted-soft)] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-1 border-t border-[var(--line)] p-2">
          {analytics.activeRisks.map((risk) => (
            <div
              key={risk.type ?? risk.message}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug ${
                risk.severity === 'high'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : risk.severity === 'medium'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {risk.severity === 'low' ? (
                <Check className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{risk.message}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[var(--muted)]">Основание:</span>
        {analytics.ruleSources.map((doc) => (
          <span
            key={doc}
            className="rounded border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--muted)]"
          >
            {doc}
          </span>
        ))}
      </div>

      {onAsk ? (
        <button
          type="button"
          onClick={() => onAsk(question)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-line-2)] bg-[var(--surface)] px-3 py-2 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
        >
          Спросить RAG-помощника
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
};
