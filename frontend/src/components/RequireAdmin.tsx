'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { confirmAdmin, logout, useAuth } from '@/lib/auth';

type Check = 'pending' | 'ok' | 'denied' | 'offline';

function Message({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-[var(--text)]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-xl shadow-[#2a0f3a]/10">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft-2)] text-[var(--accent)]">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-base font-semibold">{title}</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">{text}</p>
        <div className="mt-5 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * Пускает на страницу только администратора. Роль из браузера не берётся на веру:
 * сервер подтверждает её запросом /auth/admin-check.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [check, setCheck] = useState<Check>('pending');

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void confirmAdmin().then((result) => {
      if (cancelled) return;
      setCheck(result === true ? 'ok' : result === false ? 'denied' : 'offline');
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin || check === 'denied') {
    return (
      <Message title="Доступ только для администратора" text="Эта страница доступна только администратору. Вы вошли как обычный пользователь.">
        <Link href="/shushary" className="gradient-brand rounded-lg py-2.5 text-[12px] font-medium">
          Вернуться на карту склада
        </Link>
        <button
          type="button"
          onClick={logout}
          className="cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2.5 text-[12px] font-medium text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
        >
          Войти под другой учётной записью
        </button>
      </Message>
    );
  }

  if (check === 'offline') {
    return (
      <Message title="Не удалось проверить права" text="Нет связи с сервером, поэтому права администратора не подтверждены. Проверьте соединение и обновите страницу.">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="gradient-brand cursor-pointer rounded-lg py-2.5 text-[12px] font-medium"
        >
          Обновить страницу
        </button>
      </Message>
    );
  }

  if (check === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-label="Проверяем права" />
      </div>
    );
  }

  return <>{children}</>;
}
