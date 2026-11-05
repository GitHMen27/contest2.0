'use client';

import React from 'react';
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
  glow: string;
}

function getRiskTone(score: number): RiskTone {
  if (score < 35) {
    return {
      label: 'Низкий',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      stroke: '#34d399',
      glow: 'shadow-[0_0_24px_-8px_rgba(52,211,153,0.65)]',
    };
  }
  if (score < 65) {
    return {
      label: 'Средний',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      stroke: '#fbbf24',
      glow: 'shadow-[0_0_24px_-8px_rgba(251,191,36,0.65)]',
    };
  }
  return {
    label: 'Высокий',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    stroke: '#fb7185',
    glow: 'shadow-[0_0_24px_-8px_rgba(251,113,133,0.65)]',
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/50 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-100">{value}</div>
      {hint ? <div className="text-[9px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export const AiAnalyticsCard: React.FC<AiAnalyticsCardProps> = ({ analytics, isLoading, onAsk }) => {
  if (isLoading) {
    return (
      <div className="shrink-0 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="mb-3 h-4 w-1/2 rounded bg-slate-800" />
        <div className="mb-2 h-24 rounded bg-slate-800" />
        <div className="h-4 w-3/4 rounded bg-slate-800" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="shrink-0 rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/40 p-5 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg">
          🧠
        </div>
        <div className="text-sm font-medium text-slate-300">AI-анализ маршрута</div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Выберите разные РЦ отправления и назначения, чтобы увидеть риск, топливо и рекомендации по регламентам.
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
    <section
      className={`relative shrink-0 overflow-hidden rounded-2xl border bg-slate-900/70 p-4 shadow-2xl backdrop-blur-xl ${tone.border}`}
    >
      <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400" />
            </span>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-purple-300">
              AI-анализ маршрута
            </h2>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            правило-ориентированная модель · 3 регламента
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone.border} ${tone.bg} ${tone.text}`}
        >
          Риск {tone.label.toLowerCase()}
        </span>
      </div>

      <div className="relative mt-3 flex items-center gap-4">
        <div className={`relative h-[88px] w-[88px] shrink-0 rounded-full ${tone.glow}`}>
          <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="8" />
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
            <span className={`text-xl font-bold ${tone.text}`}>{analytics.riskScore}%</span>
            <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">риск</span>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          <Metric label="Расстояние" value={`${analytics.distanceKm.toLocaleString('ru-RU')} км`} />
          <Metric label="В пути" value={`${analytics.estimatedHours} ч`} hint={`${analytics.optimalSpeedKmh} км/ч`} />
          <Metric label="Топливо" value={`${analytics.fuelConsumptionLitres} л`} hint="32 л / 100 км" />
          <Metric label="CO₂" value={`${analytics.co2EmissionsKg} кг`} hint="2,68 кг / л" />
        </div>
      </div>

      <div className="relative mt-3 rounded-xl border border-purple-500/15 bg-purple-500/[0.06] p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-purple-300">
          <span>✦</span> Рекомендация системы
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300">{analytics.recommendation}</p>
      </div>

      <details className="group relative mt-3 rounded-xl border border-white/5 bg-slate-950/40 [&::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[10px] text-slate-400 transition hover:text-slate-200">
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Факторы риска</span>
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-400">
            {analytics.activeRisks.length}
          </span>
          <span className="ml-auto text-slate-600 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-1 border-t border-white/5 p-1.5">
          {analytics.activeRisks.map((risk) => (
            <div
              key={risk.type ?? risk.message}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug ${
                risk.severity === 'high'
                  ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-200'
                  : risk.severity === 'medium'
                    ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200'
                    : 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200'
              }`}
            >
              <span className="mt-px">{risk.severity === 'low' ? '✓' : '▲'}</span>
              <span>{risk.message}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Основание:</span>
        {analytics.ruleSources.map((doc) => (
          <span
            key={doc}
            className="rounded border border-slate-700/80 bg-slate-800/50 px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
          >
            {doc}
          </span>
        ))}
      </div>

      {onAsk ? (
        <button
          type="button"
          onClick={() => onAsk(question)}
          className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/30 bg-linear-to-r from-purple-600/20 to-indigo-600/20 px-3 py-2 text-[11px] font-medium text-purple-100 transition hover:border-purple-300/60 hover:from-purple-600/30 hover:to-indigo-600/30"
        >
          <span>🤖</span>
          Спросить RAG-помощника
          <span className="text-purple-300">→</span>
        </button>
      ) : null}
    </section>
  );
};
