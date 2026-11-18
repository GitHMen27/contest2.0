'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FlaskConical, LayoutGrid, Wallet } from 'lucide-react';

const MODULES = [
  {
    href: '/simulator',
    label: 'Симулятор',
    hint: 'Сценарии и сравнение «до/после»',
    Icon: FlaskConical,
  },
  {
    href: '/economics',
    label: 'Экономика',
    hint: 'Рейсы, топливо, простой и SLA',
    Icon: Wallet,
  },
];

/** Компактное меню разделов в шапке: не добавляет визуального шума на карту. */
export function ModulesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
        title="Дополнительные разделы"
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Модули</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[1600] mt-1.5 w-64 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl shadow-[#2a0f3a]/15"
        >
          {MODULES.map(({ href, label, hint, Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-[var(--surface-soft)]"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-[var(--text)]">{label}</span>
                <span className="mt-0.5 block text-[9px] leading-snug text-[var(--muted)]">{hint}</span>
              </span>
            </Link>
          ))}
          <div className="mt-1 border-t border-[var(--line-soft)] px-2.5 py-1.5 text-[8px] leading-snug text-[var(--muted-soft)]">
            Демо-разделы. Симулятор не изменяет данные системы.
          </div>
        </div>
      ) : null}
    </div>
  );
}
