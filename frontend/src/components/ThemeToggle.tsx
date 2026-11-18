'use client';

import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const toggleTheme = () => {
    const root = document.documentElement;
    const nextIsDark = !root.classList.contains('dark');
    root.classList.toggle('dark', nextIsDark);
    try {
      window.localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
    } catch {
      // Приватный режим может запрещать localStorage — тема всё равно переключится.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Переключить тему"
      title="Переключить тему"
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] ${className}`}
    >
      <Sun aria-hidden="true" className="hidden h-4 w-4 dark:block" />
      <Moon aria-hidden="true" className="h-4 w-4 dark:hidden" />
    </button>
  );
}
