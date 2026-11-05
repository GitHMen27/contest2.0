'use client';

import { useEffect } from 'react';

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const PIPELINE = [
  {
    step: '01',
    title: 'Корпус знаний',
    text: '9 md-документов с регламентами: отдых водителя, SLA, погода, приоритеты, CO₂.',
    accent: 'text-sky-300 border-sky-400/20 bg-sky-500/[0.06]',
  },
  {
    step: '02',
    title: 'Чанкинг',
    text: '36 смысловых чанков с заголовками и метаданными. Каждый чанк знает свой документ и раздел.',
    accent: 'text-cyan-300 border-cyan-400/20 bg-cyan-500/[0.06]',
  },
  {
    step: '03',
    title: 'Гибридный поиск',
    text: 'pgvector HNSW для семантики + PostgreSQL FTS для точных терминов. Результаты сливаются через RRF.',
    accent: 'text-purple-300 border-purple-400/20 bg-purple-500/[0.06]',
  },
  {
    step: '04',
    title: 'GigaChat + citations',
    text: 'Модель получает только найденные чанки и обязана ссылаться на источники [1], [2], [3].',
    accent: 'text-indigo-300 border-indigo-400/20 bg-indigo-500/[0.06]',
  },
  {
    step: '05',
    title: 'Ответ диспетчеру',
    text: 'FastAPI отдаёт ответ, источники, score и latency. UI показывает цитаты и позволяет раскрыть фрагмент.',
    accent: 'text-emerald-300 border-emerald-400/20 bg-emerald-500/[0.06]',
  },
];

const METRICS = [
  { value: '9', label: 'документов', hint: 'регламенты' },
  { value: '36', label: 'чанков', hint: 'в индексе' },
  { value: '29', label: 'тестов', hint: 'pytest' },
  { value: '2', label: 'канала', hint: 'vector + FTS' },
];

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#070b14] shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/5 bg-[#070b14]/95 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-purple-300">
                architecture
              </span>
              <span className="text-[10px] text-slate-500">demo → production</span>
            </div>
            <h2 id="how-it-works-title" className="mt-1.5 text-xl font-semibold text-white sm:text-2xl">
              Как работает RAG-помощник
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-500">
              Ответы не выдумываются моделью: сначала находится релевантный фрагмент регламента, затем
              GigaChat формулирует ответ и обязан показать источник.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition hover:border-white/20 hover:text-white"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <div className="text-2xl font-bold text-white">{metric.value}</div>
                <div className="text-[10px] font-medium text-slate-300">{metric.label}</div>
                <div className="text-[9px] text-slate-600">{metric.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-5">
            {PIPELINE.map((item) => (
              <div key={item.step} className={`rounded-xl border p-3 ${item.accent}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] opacity-70">{item.step}</span>
                  <span className="text-[9px] opacity-50">→</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-100">{item.title}</div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-purple-400/20 bg-linear-to-br from-purple-500/[0.08] to-indigo-500/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-300">
              <span>⟶</span> Путь запроса
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {['Вопрос диспетчера', 'Embedding', 'pgvector HNSW', 'FTS / GIN', 'RRF fusion', 'GigaChat-2', 'Ответ + citations'].map(
                (node, index) => (
                  <span key={node} className="flex items-center gap-1.5">
                    <span className="rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">
                      {node}
                    </span>
                    {index < 6 ? <span className="text-slate-600">→</span> : null}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.04] p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Почему ответам можно доверять
              </div>
              <ul className="space-y-1.5 text-[10px] leading-relaxed text-slate-400">
                <li>• Модель видит только найденные чанки, а не весь интернет.</li>
                <li>• Каждый ответ содержит документ, раздел и фрагмент текста.</li>
                <li>• Если релевантных чанков нет, помощник честно говорит об этом.</li>
                <li>• Гибридный поиск ловит и смысл, и точные термины вроде «4,5 часа».</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.04] p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                Что сейчас в demo-режиме
              </div>
              <ul className="space-y-1.5 text-[10px] leading-relaxed text-slate-400">
                <li>• Ответы берутся из локального снимка корпуса, без сети и без ключей.</li>
                <li>• Метрики latency и retrieval показаны как демонстрационные.</li>
                <li>• В production этот же UI вызывает <span className="font-mono text-amber-200">POST /rag/ask</span>.</li>
                <li>• Backend уже покрыт 29 тестами и готов к подключению.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3 font-mono text-[9px] leading-relaxed text-slate-500">
            <span className="text-emerald-400">POST</span> /rag/ask{' '}
            <span className="text-slate-600">{'{ "question": "Рейс 1800 км, одна смена" }'}</span>
            <br />
            <span className="text-purple-300">200 OK</span>{' '}
            <span className="text-slate-600">
              {'{ answer, sources: [{ doc, section, excerpt, score, via }], latency_ms }'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
