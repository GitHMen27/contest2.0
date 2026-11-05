'use client';

import type { DemoScenario } from '@/constants/demoKnowledge';

const ACCENTS: Record<
  DemoScenario['accent'],
  { dot: string; idle: string; active: string; text: string }
> = {
  amber: {
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]',
    idle: 'border-amber-500/15 hover:border-amber-400/40 hover:bg-amber-500/[0.04]',
    active: 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_30px_-14px_rgba(251,191,36,0.8)]',
    text: 'text-amber-300',
  },
  rose: {
    dot: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]',
    idle: 'border-rose-500/15 hover:border-rose-400/40 hover:bg-rose-500/[0.04]',
    active: 'border-rose-400/60 bg-rose-500/10 shadow-[0_0_30px_-14px_rgba(251,113,133,0.8)]',
    text: 'text-rose-300',
  },
  sky: {
    dot: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]',
    idle: 'border-sky-500/15 hover:border-sky-400/40 hover:bg-sky-500/[0.04]',
    active: 'border-sky-400/60 bg-sky-500/10 shadow-[0_0_30px_-14px_rgba(56,189,248,0.8)]',
    text: 'text-sky-300',
  },
};

interface ScenarioPickerProps {
  scenarios: DemoScenario[];
  activeId: string | null;
  onSelect: (scenario: DemoScenario) => void;
}

export function ScenarioPicker({ scenarios, activeId, onSelect }: ScenarioPickerProps) {
  return (
    <section className="shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Сценарии для жюри
        </h2>
        <span className="rounded border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-500">
          3 кейса
        </span>
      </div>
      <div className="grid gap-1.5">
        {scenarios.map((scenario) => {
          const accent = ACCENTS[scenario.accent];
          const isActive = activeId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelect(scenario)}
              className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                isActive ? accent.active : accent.idle
              }`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-semibold ${isActive ? accent.text : 'text-slate-200'}`}>
                  {scenario.title}
                </span>
                <span className="mt-0.5 block truncate text-[9px] text-slate-500">{scenario.subtitle}</span>
              </span>
              <span
                className={`mt-0.5 text-xs transition-transform group-hover:translate-x-0.5 ${
                  isActive ? accent.text : 'text-slate-600'
                }`}
              >
                →
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
