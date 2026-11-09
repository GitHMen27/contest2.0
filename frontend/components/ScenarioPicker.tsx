'use client';

import { ArrowRight } from 'lucide-react';
import type { DemoScenario } from '@/constants/demoKnowledge';

const ACCENT_DOT: Record<DemoScenario['accent'], string> = {
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-[var(--accent)]',
};

interface ScenarioPickerProps {
  scenarios: DemoScenario[];
  activeId: string | null;
  onSelect: (scenario: DemoScenario) => void;
}

export function ScenarioPicker({ scenarios, activeId, onSelect }: ScenarioPickerProps) {
  return (
    <section className="shrink-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--text)]">Сценарии</h2>
        <span className="text-[11px] text-[var(--muted-soft)]">{scenarios.length} кейса</span>
      </div>
      <div className="grid gap-2">
        {scenarios.map((scenario) => {
          const isActive = activeId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelect(scenario)}
              className={`group flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                isActive
                  ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_DOT[scenario.accent]}`} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[11px] font-medium ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                  }`}
                >
                  {scenario.title}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{scenario.subtitle}</span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className={`mt-0.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--muted-soft)]'
                }`}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
