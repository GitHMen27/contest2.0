'use client';

import { useEffect } from 'react';
import { ArrowRight, X } from 'lucide-react';

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const PIPELINE = [
  {
    step: '01',
    title: 'Корпус знаний',
    text: '9 md-документов с регламентами: отдых водителя, SLA, погода, приоритеты, CO₂.',
  },
  {
    step: '02',
    title: 'Чанкинг',
    text: '36 смысловых чанков с заголовками и метаданными. Каждый чанк знает свой документ и раздел.',
  },
  {
    step: '03',
    title: 'Гибридный поиск',
    text: 'pgvector HNSW для семантики + PostgreSQL FTS для точных терминов. Результаты сливаются через RRF.',
  },
  {
    step: '04',
    title: 'GigaChat + citations',
    text: 'Модель получает только найденные чанки и обязана ссылаться на источники [1], [2], [3].',
  },
  {
    step: '05',
    title: 'Ответ диспетчеру',
    text: 'FastAPI отдаёт ответ, источники, score и latency. UI показывает цитаты и позволяет раскрыть фрагмент.',
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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#160b20]/40 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl shadow-[#2a0f3a]/15"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--accent-soft-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                архитектура
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[var(--muted-soft)]">
                demo <ArrowRight className="h-3 w-3" aria-hidden="true" /> production
              </span>
            </div>
            <h2 id="how-it-works-title" className="mt-1.5 text-xl font-semibold text-[var(--text)] sm:text-2xl">
              Как работает RAG-помощник
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--muted)]">
              Ответы не выдумываются моделью: сначала находится релевантный фрагмент регламента, затем
              GigaChat формулирует ответ и обязан показать источник.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5">
                <div className="text-2xl font-semibold text-[var(--text)]">{metric.value}</div>
                <div className="text-[11px] font-medium text-[var(--muted)]">{metric.label}</div>
                <div className="text-[10px] text-[var(--muted-soft)]">{metric.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-5">
            {PIPELINE.map((item) => (
              <div key={item.step} className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[var(--muted-soft)]">{item.step}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--muted-soft)]" aria-hidden="true" />
                </div>
                <div className="text-[11px] font-semibold text-[var(--text)]">{item.title}</div>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 text-[10px] font-semibold text-[var(--muted)]">Путь запроса</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {['Вопрос диспетчера', 'Embedding', 'pgvector HNSW', 'FTS / GIN', 'RRF fusion', 'GigaChat-2', 'Ответ + citations'].map(
                (node, index) => (
                  <span key={node} className="flex items-center gap-1.5">
                    <span className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[var(--muted)]">
                      {node}
                    </span>
                    {index < 6 ? (
                      <ArrowRight className="h-3 w-3 shrink-0 text-[var(--muted-soft)]" aria-hidden="true" />
                    ) : null}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="mb-2 text-[11px] font-semibold text-emerald-800">
                Почему ответам можно доверять
              </div>
              <ul className="space-y-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
                <li>• Модель видит только найденные чанки, а не весь интернет.</li>
                <li>• Каждый ответ содержит документ, раздел и фрагмент текста.</li>
                <li>• Если релевантных чанков нет, помощник честно говорит об этом.</li>
                <li>• Гибридный поиск ловит и смысл, и точные термины вроде «4,5 часа».</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="mb-2 text-[11px] font-semibold text-amber-800">Что сейчас в demo-режиме</div>
              <ul className="space-y-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
                <li>• Ответы берутся из локального снимка корпуса, без сети и без ключей.</li>
                <li>• Метрики latency и retrieval показаны как демонстрационные.</li>
                <li>
                  • В production этот же UI вызывает{' '}
                  <span className="font-mono text-amber-800">POST /rag/ask</span>.
                </li>
                <li>• Backend уже покрыт 29 тестами и готов к подключению.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
            <span className="font-semibold text-emerald-700">POST</span> /rag/ask{' '}
            <span className="text-[var(--muted-soft)]">{'{ "question": "Рейс 1800 км, одна смена" }'}</span>
            <br />
            <span className="text-[var(--accent)]">200 OK</span>{' '}
            <span className="text-[var(--muted-soft)]">
              {'{ answer, sources: [{ doc, section, excerpt, score, via }], latency_ms }'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
