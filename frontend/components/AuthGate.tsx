'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Loader2, LogIn, ShieldCheck, User } from 'lucide-react';
import { DEMO_USER_HINT } from '@/constants/demoAuth';
import { login, logout, useAuth, verifySession } from '@/lib/auth';

function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Введите логин и пароль.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await login(username, password);
    if (!result.ok) {
      setError(result.message);
      setPassword('');
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 text-[var(--text)]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold tracking-wide">
            WB
          </div>
          <h1 className="mt-4 text-lg font-semibold">WB Логистика</h1>
          <p className="mt-1 text-[12px] text-[var(--muted)]">Войдите, чтобы открыть диспетчерскую</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl shadow-[#2a0f3a]/10"
        >
          <label className="block">
            <span className="mb-1 block text-[11px] text-[var(--muted)]">Логин</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              disabled={busy}
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-60"
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-[var(--muted)]">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={busy}
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-60"
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-snug text-rose-700"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="gradient-brand mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Проверяем…' : 'Войти'}
          </button>

          {/* Пароль администратора в интерфейсе не показываем: его выдаёт владелец демо. */}
          <button
            type="button"
            onClick={() => {
              setUsername(DEMO_USER_HINT.username);
              setPassword(DEMO_USER_HINT.password);
              setError(null);
            }}
            disabled={busy}
            className="mt-2 w-full cursor-pointer rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-[10px] text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            Демо-вход пользователя: {DEMO_USER_HINT.username} / {DEMO_USER_HINT.password}
          </button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-[var(--muted)]">
          <div className="flex items-start gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
            <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-soft)]" aria-hidden="true" />
            <span>Пользователь: карта, рейсы и помощник</span>
          </div>
          <div className="flex items-start gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span>Администратор: ещё и админ-панели</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Пока пользователь не вошёл, сайт не показывается: вместо него экран входа. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  const token = session?.token ?? null;
  const expiresAt = session?.expiresAt ?? null;

  // При открытии сайта сверяем токен с сервером: просроченный или недействительный сбрасывается.
  useEffect(() => {
    if (token) void verifySession();
  }, [token]);

  // Сессия заканчивается ровно по сроку токена.
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(logout, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-label="Загрузка" />
      </div>
    );
  }

  if (status === 'anonymous') return <LoginScreen />;

  return <>{children}</>;
}
