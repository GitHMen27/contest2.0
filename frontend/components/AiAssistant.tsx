'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, ChevronRight, CircleHelp, X } from 'lucide-react';
import type { ChatMessage } from '@/types/logistics';

/** demo-only: адрес бэкенда не задан; checking: проверяем; online: бэкенд отвечает; offline: не отвечает (работает демо-база). */
export type BackendStatus = 'demo-only' | 'checking' | 'online' | 'offline';

interface AiAssistantProps {
  messages: ChatMessage[];
  isTyping: boolean;
  suggestions: string[];
  onAsk: (question: string) => void;
  onOpenTech: () => void;
  backendStatus: BackendStatus;
  chunks: number | null;
  modelLabel: string | null;
  onClose?: () => void;
}

const STATUS_BADGE: Record<BackendStatus, { label: string; className: string; dot: string }> = {
  'demo-only': {
    label: 'demo',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  checking: {
    label: 'проверка',
    className: 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted)]',
    dot: 'bg-[var(--muted-soft)]',
  },
  online: {
    label: 'live',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  offline: {
    label: 'offline',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
};

/** 1 источник, 2 источника, 5 источников. */
function pluralSources(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} источников`;
  if (last === 1) return `${count} источник`;
  if (last >= 2 && last <= 4) return `${count} источника`;
  return `${count} источников`;
}

/** Ссылки вида [1], [2] в ответе модели рисуем как маленькие метки, как номера источников под ответом. */
function renderWithCitations(text: string): React.ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, index) =>
    /^\[\d+\]$/.test(part) ? (
      <sup
        key={index}
        className="mx-0.5 rounded border border-[var(--accent-line)] bg-[var(--accent-soft-2)] px-1 font-mono text-[9px] text-[var(--accent)]"
      >
        {part.slice(1, -1)}
      </sup>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

function SourceList({ sources }: { sources: NonNullable<ChatMessage['sources']> }) {
  return (
    <div className="mt-2 space-y-1.5">
      {sources.map((source, index) => (
        <details
          key={source.id}
          className="group rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10px] text-[var(--muted)] transition hover:text-[var(--text)]">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--accent-line)] bg-[var(--surface)] font-mono text-[9px] text-[var(--accent)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-[var(--text)]">{source.doc}</span>
              <span className="text-[var(--muted-soft)]"> · </span>
              {source.section}
            </span>
            {source.scoreKind !== 'rrf' ? (
              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                {Math.round(source.score * 100)}%
              </span>
            ) : null}
            <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-soft)] transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="border-t border-[var(--line)] px-2.5 py-2">
            <p className="text-[10px] leading-relaxed text-[var(--muted)]">{source.excerpt}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {source.via.map((via) => (
                <span
                  key={via}
                  className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--muted)] ring-1 ring-[var(--line)]"
                >
                  {via}
                </span>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function SuggestionChoices({
  suggestions,
  onAsk,
  disabled,
}: {
  suggestions: string[];
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[var(--accent)]">Выберите вопрос</span>
        <span className="text-[10px] text-[var(--muted-soft)]">{suggestions.length} из 4</span>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAsk(suggestion)}
            disabled={disabled}
            className="group flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-left text-[10px] text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-soft)] font-mono text-[8px] text-[var(--muted)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{suggestion}</span>
            <ArrowRight className="h-3 w-3 text-[var(--muted-soft)] transition group-hover:text-[var(--accent)]" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft-2)] text-[9px] font-bold text-[var(--accent)]">
        AI
      </div>
      <div className="flex items-center gap-1 rounded-xl rounded-tl-sm border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted-soft)]"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
        <span className="ml-1.5 text-[10px] text-[var(--muted)]">поиск по регламентам…</span>
      </div>
    </div>
  );
}

export function AiAssistant({
  messages,
  isTyping,
  suggestions,
  onAsk,
  onOpenTech,
  backendStatus,
  chunks,
  modelLabel,
  onClose,
}: AiAssistantProps) {
  const [value, setValue] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const badge = STATUS_BADGE[backendStatus];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = value.trim();
    if (!question || isTyping) return;
    onAsk(question);
    setValue('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft-2)] text-[10px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent-line)]">
            AI
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-[var(--text)]">RAG-помощник</div>
            <div className="truncate text-[10px] text-[var(--muted)]">9 регламентов · {chunks ?? 36} чанков</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}
            title={
              backendStatus === 'online'
                ? 'Ответы генерирует настоящий бэкенд: поиск по базе и языковая модель'
                : backendStatus === 'offline'
                  ? 'Бэкенд не отвечает: чат отвечает из локальной демо-базы'
                  : backendStatus === 'checking'
                    ? 'Проверяем, доступен ли бэкенд'
                    : 'Чат работает на локальной демо-базе'
            }
          >
            <span className={`h-1 w-1 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть RAG-помощника"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div key={message.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                  isUser
                    ? 'border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--muted)]'
                    : 'border border-[var(--accent-line)] bg-[var(--accent-soft-2)] text-[var(--accent)]'
                }`}
              >
                {isUser ? 'Я' : 'AI'}
              </div>
              <div className={`min-w-0 max-w-[88%] ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                    isUser
                      ? 'gradient-brand rounded-tr-sm text-[var(--accent-contrast)]'
                      : message.refusal || message.origin === 'error'
                        ? 'rounded-tl-sm border border-amber-200 bg-amber-50 text-amber-900'
                        : 'rounded-tl-sm border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--text)]'
                  }`}
                >
                  {isUser ? message.text : renderWithCitations(message.text)}
                </div>
                {message.sources && message.sources.length > 0 ? (
                  <SourceList sources={message.sources} />
                ) : null}
                {!isUser && message.note ? (
                  <div className="mt-1 text-[10px] leading-snug text-amber-700">{message.note}</div>
                ) : null}
                {!isUser && message.latencyMs ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--muted-soft)]">
                    <span
                      className={`h-1 w-1 rounded-full ${message.origin === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    />
                    {message.sources && message.sources.length > 0
                      ? pluralSources(message.sources.length)
                      : 'источников нет'}{' '}
                    · {(message.latencyMs / 1000).toFixed(1)} с ·{' '}
                    {message.origin === 'live' ? 'ответ бэкенда' : 'локальный снимок корпуса'}
                  </div>
                ) : null}
                {!isUser && message.suggestions && message.suggestions.length > 0 ? (
                  <SuggestionChoices suggestions={message.suggestions} onAsk={onAsk} disabled={isTyping} />
                ) : null}
              </div>
            </div>
          );
        })}

        {messages.length === 1 && !isTyping ? (
          <div className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[var(--accent)]">Попробуйте спросить</span>
              <span className="text-[10px] text-[var(--muted-soft)]">4 сценария</span>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onAsk(suggestion)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-left text-[10px] text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--text)]"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-soft)] font-mono text-[8px] text-[var(--muted)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--muted-soft)] transition group-hover:text-[var(--accent)]" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--accent-line)] pt-2">
              {['vector', 'fts', 'RRF', modelLabel ?? 'LLM', 'citations'].map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--muted)] ring-1 ring-[var(--line)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {isTyping ? <TypingIndicator /> : null}
      </div>

      <div className="border-t border-[var(--line)] px-3 pb-3 pt-2">
        {messages.length > 1 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onAsk(suggestion)}
                disabled={isTyping}
                className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Спросить по регламентам…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
          />
          <button
            type="submit"
            disabled={!value.trim() || isTyping}
            className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm text-[var(--accent-contrast)] transition disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Отправить вопрос"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <button
          type="button"
          onClick={onOpenTech}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--accent)]"
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" /> Как работает RAG и почему нет галлюцинаций
        </button>
      </div>
    </div>
  );
}
