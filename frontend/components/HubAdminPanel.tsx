'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { Hub, HubStatus } from '@/types/logistics';

interface HubAdminPanelProps {
  hub: Hub | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<HubStatus, string> = {
  optimal: 'норма',
  warning: 'внимание',
  critical: 'перегрузка',
};

const STATUS_DOT: Record<HubStatus, string> = {
  optimal: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-rose-500',
};

const STATUS_TEXT: Record<HubStatus, string> = {
  optimal: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-rose-700',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5">
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-3 py-2.5 last:border-b-0">
      <span className="text-[11px] text-[var(--text)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative h-5 w-9 rounded-full transition ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-muted)]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--surface)] shadow-sm transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function HubAdminPanel({ hub, onClose }: HubAdminPanelProps) {
  const [accepting, setAccepting] = useState(true);
  const [shipping, setShipping] = useState(true);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!hub) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [hub]);

  if (!hub) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-[#160b20]/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hub-admin-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="header-brand flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold tracking-wide text-[var(--accent-contrast)]">
              WB
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
                Панель администратора
              </div>
              <h2 id="hub-admin-title" className="truncate text-base font-semibold text-[var(--text)]">
                {hub.name}
              </h2>
              <p className="truncate text-[11px] text-[var(--muted)]">{hub.city} · сортировочный центр</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель администратора"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[hub.status]}`} />
              Статус РЦ
            </div>
            <span className={`text-[11px] font-semibold ${STATUS_TEXT[hub.status]}`}>
              {STATUS_LABEL[hub.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Загрузка" value={`${hub.load}%`} />
            <Stat label="Свободно" value={`${100 - hub.load}%`} />
            <Stat label="Ворота" value="12 / 14" />
            <Stat label="Очередь" value="3 машины" />
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
            <Toggle label="Приёмка на склад" checked={accepting} onChange={() => setAccepting((value) => !value)} />
            <Toggle label="Отгрузка" checked={shipping} onChange={() => setShipping((value) => !value)} />
          </div>

          <p className="text-[10px] leading-relaxed text-[var(--muted-soft)]">
            Демо-панель: переключатели меняют состояние только в интерфейсе.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            {hub.siteUrl ? (
              <a
                href={hub.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[11px] font-medium text-[var(--text)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
              >
                Сайт точки <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="gradient-brand flex h-9 flex-1 items-center justify-center rounded-lg text-[11px] font-semibold text-[var(--accent-contrast)] transition"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
