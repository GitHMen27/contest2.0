'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';

/** Единая шапка автономных модулей: без прямых ссылок на цифровой двойник. */
export function ModuleHeader({
  title,
  subtitle,
  badge,
  icon,
}: {
  title: string;
  subtitle: string;
  badge: ReactNode;
  icon: ReactNode;
}) {
  return (
    <header className="header-brand relative z-30 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide"
          title="Вернуться к карте сети РЦ"
        >
          WB
        </Link>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[13px] font-semibold text-[var(--text)]">{title}</h1>
            {badge}
          </div>
          <p className="hidden truncate text-[10px] text-[var(--muted)] sm:block">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[10px] font-medium text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">К карте сети</span>
          <span className="sm:hidden">Карта</span>
        </Link>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
