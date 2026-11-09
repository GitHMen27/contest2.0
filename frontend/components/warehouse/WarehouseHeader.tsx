'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { useAuth } from '@/lib/auth';
import { WAREHOUSE_INFO } from '@/constants/warehouse';
import { DemoBadge } from '@/components/warehouse/shared';
import {
  IconArrowUpRight,
  IconMap,
  IconShield,
  IconWarehouse,
} from '@/components/warehouse/icons';

export function WarehouseHeader({ mode, now }: { mode: 'client' | 'admin'; now: number }) {
  const { isAdmin } = useAuth();
  const clock = new Date(now).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <header className="header-brand relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide text-[var(--accent-contrast)]"
          title="Вернуться к карте сети РЦ"
        >
          WB
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[13px] font-semibold text-[var(--text)]">
              {WAREHOUSE_INFO.shortName}
            </h1>
            <span className="hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] text-[var(--muted)] sm:inline-flex">
              <IconWarehouse className="h-3 w-3" />
              цифровой двойник
            </span>
          </div>
          <p className="hidden truncate text-[10px] text-[var(--muted)] md:block">
            {WAREHOUSE_INFO.city} · {WAREHOUSE_INFO.address}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          склад открыт
        </span>
        <span className="hidden text-[11px] tabular-nums text-[var(--muted)] sm:block">{clock}</span>
        <DemoBadge compact />
        <ThemeToggle />

        {mode === 'admin' || isAdmin ? (
          <Link
            href={mode === 'admin' ? '/shushary' : '/shushary/admin'}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[10px] font-medium text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          >
            {mode === 'admin' ? (
              <>
                <IconMap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Клиентский режим</span>
                <span className="sm:hidden">Клиент</span>
              </>
            ) : (
              <>
                <IconShield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Админ-панель</span>
                <span className="sm:hidden">Админ</span>
              </>
            )}
          </Link>
        ) : null}

        <Link
          href="/"
          className="hidden h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)] sm:flex"
          title="Карта сети распределительных центров"
        >
          Сеть РЦ
          <IconArrowUpRight className="h-3 w-3" />
        </Link>

        <UserMenu />
      </div>
    </header>
  );
}
