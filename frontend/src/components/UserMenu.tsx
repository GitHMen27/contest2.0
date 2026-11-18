'use client';

import { LogOut, ShieldCheck, User } from 'lucide-react';
import { ROLE_LABEL, logout, useAuth } from '@/lib/auth';

/** Имя, роль и кнопка «Выйти» для шапки. */
export function UserMenu() {
  const { session, isAdmin } = useAuth();
  if (!session) return null;

  const RoleIcon = isAdmin ? ShieldCheck : User;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div
        className="hidden items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 sm:flex"
        title={`${session.username} · ${ROLE_LABEL[session.role]}${session.demo ? ' · демо-сессия' : ''}`}
      >
        <RoleIcon className={`h-3.5 w-3.5 ${isAdmin ? 'text-[var(--accent)]' : 'text-[var(--muted-soft)]'}`} aria-hidden="true" />
        <span className="max-w-[110px] truncate text-[11px] font-medium text-[var(--text)]">{session.username}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            isAdmin ? 'bg-[var(--accent-soft-2)] text-[var(--accent)]' : 'bg-[var(--surface-muted)] text-[var(--muted)]'
          }`}
        >
          {ROLE_LABEL[session.role]}
        </span>
      </div>
      <button
        type="button"
        onClick={logout}
        aria-label="Выйти"
        title="Выйти"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
