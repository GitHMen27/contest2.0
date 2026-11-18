'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { verifyDemoCredentials } from '@/constants/demoAuth';
import { API_BASE_URL, BACKEND_CONFIGURED } from '@/lib/ragApi';

/**
 * Авторизация на сайте. Вход выполняет бэкенд (POST /auth/login): он проверяет пароль, сам определяет роль
 * и выдаёт подписанный токен. Браузер хранит только токен и показывает интерфейс по роли, которую подтвердил
 * сервер (GET /auth/me, GET /auth/admin-check). Подделать роль в браузере нельзя: токен подписан секретом сервера.
 */

export type Role = 'admin' | 'user';

export interface Session {
  token: string;
  username: string;
  role: Role;
  /** Время окончания действия токена, мс (Unix). */
  expiresAt: number;
  /**
   * Сессия создана резервным демо-входом на клиенте, потому что сервер авторизации недоступен.
   * В обычном режиме роль подтверждает сервер, и это поле отсутствует.
   */
  demo?: boolean;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

const STORAGE_KEY = 'wb-auth-v1';
const EVENT_NAME = 'wb-auth-store';
const SSR_SNAPSHOT = '__ssr__';
const REQUEST_TIMEOUT_MS = 20_000;

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
};

let cachedRaw: string | null = null;

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function getSnapshot(): string {
  if (cachedRaw === null) cachedRaw = readRaw();
  return cachedRaw;
}

function getServerSnapshot(): string {
  return SSR_SNAPSHOT;
}

function subscribe(listener: () => void) {
  const onChange = () => {
    cachedRaw = null;
    listener();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT_NAME, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT_NAME, onChange);
  };
}

function writeRaw(raw: string) {
  try {
    if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage может быть недоступен (приватный режим): остаёмся на значении в памяти.
  }
  cachedRaw = raw;
  window.dispatchEvent(new Event(EVENT_NAME));
}

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user';
}

function parseSession(raw: string): Session | null {
  if (!raw || raw === SSR_SNAPSHOT) return null;
  try {
    const data = JSON.parse(raw) as Partial<Session>;
    if (
      typeof data.token !== 'string' ||
      typeof data.username !== 'string' ||
      !isRole(data.role) ||
      typeof data.expiresAt !== 'number'
    ) {
      return null;
    }
    if (data.demo !== undefined && typeof data.demo !== 'boolean') return null;
    if (data.expiresAt <= Date.now()) return null;
    return {
      token: data.token,
      username: data.username,
      role: data.role,
      expiresAt: data.expiresAt,
      ...(data.demo ? { demo: true } : {}),
    };
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return parseSession(readRaw());
}

export function useAuth(): { status: AuthStatus; session: Session | null; isAdmin: boolean } {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    if (raw === SSR_SNAPSHOT) return { status: 'loading' as const, session: null, isAdmin: false };
    const session = parseSession(raw);
    return {
      status: session ? ('authenticated' as const) : ('anonymous' as const),
      session,
      isAdmin: session?.role === 'admin',
    };
  }, [raw]);
}

export function logout() {
  writeRaw('');
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    return typeof data.detail === 'string' ? data.detail : null;
  } catch {
    return null;
  }
}

export type LoginResult =
  | { ok: true; role: Role; demo?: boolean }
  | { ok: false; message: string };

const DEMO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Резервный вход, когда сервер авторизации недоступен (старый бэкенд без /auth/login, 503 или нет сети).
 * Нужен, чтобы демо-сайт открывался; в обычном режиме роль всё равно подтверждает сервер.
 */
async function demoLogin(username: string, password: string): Promise<LoginResult | null> {
  const role = await verifyDemoCredentials(username, password);
  if (!role) return null;
  const session: Session = {
    token: `demo-${Date.now()}`,
    username: username.trim(),
    role,
    expiresAt: Date.now() + DEMO_SESSION_TTL_MS,
    demo: true,
  };
  writeRaw(JSON.stringify(session));
  return { ok: true, role, demo: true };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  if (!BACKEND_CONFIGURED) {
    const demo = await demoLogin(username, password);
    return demo ?? { ok: false, message: 'Адрес сервера не задан (NEXT_PUBLIC_API_URL): вход недоступен.' };
  }

  try {
    const response = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    if (!response.ok) {
      const detail = await readDetail(response);
      if (response.status === 401) return { ok: false, message: detail ?? 'Неверный логин или пароль.' };
      if (response.status === 429) return { ok: false, message: detail ?? 'Слишком много попыток, попробуйте через минуту.' };
      if (response.status === 422) return { ok: false, message: 'Введите логин и пароль.' };
      // 404 — бэкенд ещё без модуля авторизации, 503 — вход не настроен на сервере.
      if (response.status === 404 || response.status === 503) {
        const demo = await demoLogin(username, password);
        if (demo) return demo;
      }
      return { ok: false, message: detail ?? `Сервер ответил ошибкой ${response.status}.` };
    }

    const data = (await response.json()) as {
      access_token?: unknown;
      username?: unknown;
      role?: unknown;
      expires_in?: unknown;
    };
    if (
      typeof data.access_token !== 'string' ||
      typeof data.username !== 'string' ||
      !isRole(data.role) ||
      typeof data.expires_in !== 'number'
    ) {
      return { ok: false, message: 'Сервер вернул ответ в неожиданном формате.' };
    }

    const session: Session = {
      token: data.access_token,
      username: data.username,
      role: data.role,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    writeRaw(JSON.stringify(session));
    return { ok: true, role: session.role };
  } catch (error) {
    // Сервер недоступен — пробуем резервный демо-вход, иначе демо-сайт останется запертым.
    const demo = await demoLogin(username, password);
    if (demo) return demo;
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: 'Сервер не ответил вовремя. Попробуйте ещё раз.' };
    }
    return { ok: false, message: 'Не удалось связаться с сервером.' };
  }
}

/**
 * Сверяет сохранённый токен с сервером при открытии сайта.
 * Просроченный или недействительный токен удаляется; изменившуюся роль сервер переопределяет.
 * При сетевой ошибке сессия остаётся как есть.
 */
export async function verifySession(): Promise<void> {
  const session = getSession();
  // Демо-сессию сервер проверить не может: она живёт до истечения срока в браузере.
  if (!session || session.demo || !BACKEND_CONFIGURED) return;

  try {
    const response = await request('/auth/me', { headers: { Authorization: `Bearer ${session.token}` } });
    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }
    if (!response.ok) return;
    const data = (await response.json()) as { username?: unknown; role?: unknown };
    if (isRole(data.role) && typeof data.username === 'string' && (data.role !== session.role || data.username !== session.username)) {
      writeRaw(JSON.stringify({ ...session, role: data.role, username: data.username }));
    }
  } catch {
    // Нет связи с сервером: оставляем сессию, интерфейс всё равно ограничен ролью из токена.
  }
}

/**
 * Подтверждение роли администратора на сервере перед админ-страницами.
 * true: сервер подтвердил; false: сервер отказал (роль в браузере устарела или подделана); null: нет связи.
 */
export async function confirmAdmin(): Promise<boolean | null> {
  const session = getSession();
  if (!session) return false;
  // Резервная демо-сессия уже проверена при входе по паролю и живёт без сервера.
  if (session.demo) return session.role === 'admin';
  if (!BACKEND_CONFIGURED) return false;

  try {
    const response = await request('/auth/admin-check', { headers: { Authorization: `Bearer ${session.token}` } });
    if (response.ok) return true;
    if (response.status === 401) {
      logout();
      return false;
    }
    if (response.status === 403) {
      await verifySession();
      return false;
    }
    return null;
  } catch {
    return null;
  }
}
