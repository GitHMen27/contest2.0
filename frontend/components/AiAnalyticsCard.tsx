'use client';

import React from 'react';
import { AiAnalyticsResult } from '@/types/logistics';

interface AiAnalyticsCardProps {
  analytics: AiAnalyticsResult | null;
  isLoading?: boolean;
}

export const AiAnalyticsCard: React.FC<AiAnalyticsCardProps> = ({ analytics, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-slate-400 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-1/2 mb-3"></div>
        <div className="h-8 bg-slate-800 rounded mb-2"></div>
        <div className="h-4 bg-slate-800 rounded w-3/4"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4 text-slate-500 text-sm text-center">
        Выберите пункт отправления и назначения для запуска AI-анализа маршрута.
      </div>
    );
  }

  // Определение цвета в зависимости от уровня риска
  const getRiskColor = (score: number) => {
    if (score < 25) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (score < 60) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-4 text-slate-200 shadow-xl">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
          </span>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-indigo-400">
            AI Logistic Engine
          </h3>
        </div>
        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getRiskColor(analytics.riskScore)}`}>
          Риск: {analytics.riskScore}%
        </span>
      </div>

      {/* Метрики: Топливо, CO2, Время */}
      <div className="grid grid-cols-3 gap-2 py-1 border-y border-slate-800/80">
        <div className="text-center p-2 rounded-lg bg-slate-800/40">
          <div className="text-xs text-slate-400">Время</div>
          <div className="font-bold text-slate-100 text-sm mt-0.5">{analytics.estimatedHours} ч</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-800/40">
          <div className="text-xs text-slate-400">Топливо</div>
          <div className="font-bold text-slate-100 text-sm mt-0.5">{analytics.fuelConsumptionLitres} л</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-800/40">
          <div className="text-xs text-slate-400">Выбросы CO₂</div>
          <div className="font-bold text-slate-100 text-sm mt-0.5">{analytics.co2EmissionsKg} кг</div>
        </div>
      </div>

      {/* Рекомендация от AI */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-400">Рекомендация системы:</div>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/30 p-3 rounded-lg border border-slate-800">
          {analytics.recommendation}
        </p>
      </div>

      {/* Предупреждения на маршруте */}
      {analytics.activeRisks.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-medium text-slate-400">Факторы риска:</div>
          <div className="space-y-1.5">
            {analytics.activeRisks.map((risk, index) => (
              <div key={index} className="flex items-start gap-2 text-xs bg-rose-950/20 border border-rose-900/30 p-2 rounded text-rose-300">
                <span>⚠️</span>
                <span>{risk.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};