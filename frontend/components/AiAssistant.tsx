'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/logistics';

interface AiAssistantProps {
  messages: ChatMessage[];
  isTyping: boolean;
  suggestions: string[];
  onAsk: (question: string) => void;
  onOpenTech: () => void;
}

function SourceList({ sources }: { sources: NonNullable<ChatMessage['sources']> }) {
  return (
    <div className="mt-2.5 space-y-1.5">
      {sources.map((source, index) => (
        <details
          key={source.id}
          className="group rounded-lg border border-white/5 bg-slate-950/60 [&::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[10px] text-slate-400 transition hover:text-slate-200">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-purple-400/30 bg-purple-500/10 font-mono text-[9px] text-purple-300">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-slate-300">{source.doc}</span>
              <span className="text-slate-600"> · </span>
              {source.section}
            </span>
            <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
              {Math.round(source.score * 100)}%
            </span>
            <span className="text-slate-600 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-white/5 px-2.5 py-2">
            <p className="text-[10px] leading-relaxed text-slate-400">{source.excerpt}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {source.via.map((via) => (
                <span
                  key={via}
                  className={`rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                    via === 'vector'
                      ? 'bg-purple-500/10 text-purple-300'
                      : 'bg-cyan-500/10 text-cyan-300'
                  }`}
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

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-[9px] font-bold text-purple-300">
        AI
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/5 bg-slate-900/80 px-3 py-2.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400/80"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
        <span className="ml-1.5 text-[9px] text-slate-500">поиск по регламентам…</span>
      </div>
    </div>
  );
}

export function AiAssistant({ messages, isTyping, suggestions, onAsk, onOpenTech }: AiAssistantProps) {
  const [value, setValue] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-purple-600 to-indigo-600 text-[10px] font-black text-white shadow-lg shadow-purple-600/30">
            AI
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-slate-200">RAG-помощник</div>
            <div className="truncate text-[9px] text-slate-500">9 регламентов · 36 чанков</div>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300">
          <span className="h-1 w-1 animate-pulse rounded-full bg-amber-300" />
          demo
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div key={message.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  isUser
                    ? 'border border-slate-600 bg-slate-800 text-slate-300'
                    : 'border border-purple-400/30 bg-purple-500/10 text-purple-300'
                }`}
              >
                {isUser ? 'Я' : 'AI'}
              </div>
              <div className={`min-w-0 max-w-[88%] ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                    isUser
                      ? 'rounded-tr-sm bg-linear-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20'
                      : 'rounded-tl-sm border border-white/5 bg-slate-900/80 text-slate-300'
                  }`}
                >
                  {message.text}
                </div>
                {message.sources && message.sources.length > 0 ? (
                  <SourceList sources={message.sources} />
                ) : null}
                {!isUser && message.latencyMs ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-600">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {message.sources?.length ?? 0} источника · {(message.latencyMs / 1000).toFixed(1)} с ·
                    локальный снимок корпуса
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {messages.length === 1 && !isTyping ? (
          <div className="rounded-xl border border-purple-400/15 bg-purple-500/[0.04] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-purple-300">
                Попробуйте спросить
              </span>
              <span className="text-[8px] text-slate-600">4 готовых сценария</span>
            </div>
            <div className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onAsk(suggestion)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-white/5 bg-slate-950/50 px-2 py-1.5 text-left text-[10px] text-slate-400 transition hover:border-purple-400/30 hover:bg-purple-500/[0.06] hover:text-slate-200"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-purple-400/25 bg-purple-500/10 font-mono text-[8px] text-purple-300">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                  <span className="text-slate-700 transition group-hover:text-purple-300">→</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/5 pt-2">
              {['vector', 'fts', 'RRF', 'GigaChat-2', 'citations'].map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {isTyping ? <TypingIndicator /> : null}
      </div>

      <div className="border-t border-white/5 px-3 pb-3 pt-2">
        {messages.length > 1 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onAsk(suggestion)}
                disabled={isTyping}
                className="shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[9px] text-slate-400 transition hover:border-purple-400/40 hover:text-purple-200 disabled:opacity-50"
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
            className="min-w-0 flex-1 rounded-xl border border-white/8 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-purple-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!value.trim() || isTyping}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-purple-600 to-indigo-600 text-sm text-white shadow-lg shadow-purple-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Отправить вопрос"
          >
            ↑
          </button>
        </form>

        <button
          type="button"
          onClick={onOpenTech}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/8 py-1.5 text-[9px] text-slate-500 transition hover:border-purple-400/30 hover:text-purple-300"
        >
          <span>⚙</span> Как работает RAG и почему нет галлюцинаций
        </button>
      </div>
    </div>
  );
}
