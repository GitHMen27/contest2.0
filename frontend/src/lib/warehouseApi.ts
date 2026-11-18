// lib/warehouseApi.ts
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getSession } from '@/lib/auth';
import { API_BASE_URL, API_CLIENT_KEY, BACKEND_CONFIGURED } from '@/lib/ragApi';
import type { EmployeeStatus, WarehouseEmployee, ZoneTone } from '@/types/warehouse';

/**
 * Клиент серверного хранилища цифрового двойника (ai-service, /warehouse/*).
 *
 * Сервер хранит сотрудников в PostgreSQL. Если сервера нет, сессия демонстрационная или запрос не удался,
 * интерфейс остаётся на локальном режиме (localStorage, lib/warehouseStore.ts), как и раньше.
 * Состояние загрузки живёт во внешнем хранилище с подпиской, по образцу lib/auth.ts.
 */

export const WAREHOUSE_SITE_ID = 'shushary';

const REQUEST_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 30_000;

const STATUSES: readonly string[] = ['working', 'busy', 'available', 'break', 'offline'];
const TONES: readonly string[] = ['amber', 'teal', 'blue', 'violet', 'green', 'rose', 'slate'];

export type RemoteStatus = 'idle' | 'loading' | 'online' | 'offline';

export interface RemoteWarehouse {
  status: RemoteStatus;
  /** Сотрудники, добавленные или изменённые администратором и сохранённые на сервере. */
  overrides: WarehouseEmployee[];
  /** demo: на сервере демонстрационные данные; live: реальные. null: сервер недоступен. */
  dataMode: 'demo' | 'live' | null;
  fetchedAt: number;
}

export type SyncResult = { ok: true } | { ok: false; message: string };

const INITIAL: RemoteWarehouse = { status: 'idle', overrides: [], dataMode: null, fetchedAt: 0 };

let snapshot: RemoteWarehouse = INITIAL;
const listeners = new Set<() => void>();

function publish(next: RemoteWarehouse) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RemoteWarehouse {
  return snapshot;
}

function getServerSnapshot(): RemoteWarehouse {
  return INITIAL;
}

// --- Разбор ответа сервера -------------------------------------------------------------------------------

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toEmployee(value: unknown): WarehouseEmployee | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const id = text(item.id);
  const firstName = text(item.firstName);
  const lastName = text(item.lastName);
  const position = text(item.position);
  const role = text(item.role);
  const department = text(item.department);
  const zoneId = text(item.zoneId);
  const task = text(item.task);
  const status = item.status;
  if (
    !id ||
    !firstName ||
    !lastName ||
    !position ||
    !role ||
    !department ||
    !zoneId ||
    !task ||
    typeof status !== 'string' ||
    !STATUSES.includes(status)
  ) {
    return null;
  }
  const patrol = strings(item.patrol);
  const tone = item.avatarTone;
  return {
    id,
    firstName,
    lastName,
    position,
    role,
    department,
    zoneId,
    status: status as EmployeeStatus,
    task,
    responsibilities: strings(item.responsibilities),
    contact: text(item.contact) ?? undefined,
    avatarTone: typeof tone === 'string' && TONES.includes(tone) ? (tone as ZoneTone) : undefined,
    online: typeof item.online === 'boolean' ? item.online : undefined,
    patrol: patrol.length > 0 ? patrol : undefined,
    manual: item.manual === true,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
  };
}

function parseState(data: unknown): { overrides: WarehouseEmployee[]; dataMode: 'demo' | 'live' } | null {
  if (typeof data !== 'object' || data === null) return null;
  const item = data as { employees?: unknown; dataMode?: unknown };
  if (!Array.isArray(item.employees)) return null;
  const overrides: WarehouseEmployee[] = [];
  for (const raw of item.employees) {
    const employee = toEmployee(raw);
    // Базовые (демо) сотрудники и так известны фронтенду и ходят по симуляции; сюда берём только правки администратора.
    if (employee && employee.manual) overrides.push(employee);
  }
  return { overrides, dataMode: item.dataMode === 'live' ? 'live' : 'demo' };
}

// --- Запросы -----------------------------------------------------------------------------------------------

function sessionToken(): string | null {
  const session = getSession();
  // Резервная демо-сессия сервер не знает: токен «demo-…» им не принимается.
  return session && !session.demo ? session.token : null;
}

function headers(token: string): Record<string, string> {
  const result: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (API_CLIENT_KEY) result['X-API-Key'] = API_CLIENT_KEY;
  return result;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function explain(response: Response): Promise<SyncResult> {
  let detail: string | null = null;
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') detail = data.detail;
  } catch {
    // тело ответа не JSON: покажем стандартное сообщение
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: detail ?? 'Недостаточно прав: войдите как администратор.' };
  }
  if (response.status === 429) {
    return { ok: false, message: detail ?? 'Слишком много запросов, попробуйте через минуту.' };
  }
  return { ok: false, message: detail ?? `Сервер ответил ошибкой ${response.status}.` };
}

const NETWORK_FAILURE: SyncResult = { ok: false, message: 'Не удалось связаться с сервером.' };

let inFlight: Promise<void> | null = null;

async function load(): Promise<void> {
  const token = sessionToken();
  if (!BACKEND_CONFIGURED || !token) {
    if (snapshot.status !== 'offline') publish({ ...INITIAL, status: 'offline' });
    return;
  }
  if (snapshot.status === 'idle') publish({ ...snapshot, status: 'loading' });

  let next: RemoteWarehouse = { ...INITIAL, status: 'offline', fetchedAt: Date.now() };
  try {
    const response = await call(`/warehouse/${WAREHOUSE_SITE_ID}`, { headers: headers(token) });
    if (response.ok) {
      const parsed = parseState(await response.json());
      if (parsed) {
        next = { status: 'online', overrides: parsed.overrides, dataMode: parsed.dataMode, fetchedAt: Date.now() };
      }
    }
  } catch {
    // сервер не ответил: остаёмся на локальных данных
  }

  const unchanged =
    snapshot.status === next.status &&
    snapshot.dataMode === next.dataMode &&
    JSON.stringify(snapshot.overrides) === JSON.stringify(next.overrides);
  if (!unchanged) publish(next);
}

/** Обновить состояние с сервера. Параллельные вызовы объединяются в один запрос. */
export function refreshWarehouse(): Promise<void> {
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

let subscribers = 0;
let pollTimer: number | null = null;

function startPolling(): () => void {
  subscribers += 1;
  if (subscribers === 1) {
    void refreshWarehouse();
    pollTimer = window.setInterval(() => {
      void refreshWarehouse();
    }, POLL_INTERVAL_MS);
  }
  return () => {
    subscribers -= 1;
    if (subscribers === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

/** Состояние серверного хранилища. Пока идёт загрузка или сервера нет, status не равен online. */
export function useWarehouseRemote(): RemoteWarehouse {
  useEffect(() => startPolling(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Правки сотрудников: с сервера, если он доступен, иначе локальные. */
export function resolveOverrides(local: WarehouseEmployee[], remote: RemoteWarehouse): WarehouseEmployee[] {
  return remote.status === 'online' ? remote.overrides : local;
}

// --- Запись (только администратор) ------------------------------------------------------------------------

function payloadOf(employee: WarehouseEmployee) {
  // Отправляем только данные сотрудника: вычисляемые поля симуляции (позиция, история) сервер не хранит.
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    position: employee.position,
    role: employee.role,
    department: employee.department,
    zoneId: employee.zoneId,
    status: employee.status,
    task: employee.task,
    responsibilities: employee.responsibilities,
    contact: employee.contact ?? null,
    avatarTone: employee.avatarTone,
    patrol: employee.patrol,
  };
}

export async function pushEmployee(employee: WarehouseEmployee): Promise<SyncResult> {
  const token = sessionToken();
  if (!BACKEND_CONFIGURED || !token) {
    return { ok: false, message: 'Сервер недоступен.' };
  }
  try {
    const response = await call(
      `/warehouse/${WAREHOUSE_SITE_ID}/employees/${encodeURIComponent(employee.id)}`,
      { method: 'PUT', headers: headers(token), body: JSON.stringify(payloadOf(employee)) },
    );
    if (!response.ok) return await explain(response);
    await refreshWarehouse();
    return { ok: true };
  } catch {
    return NETWORK_FAILURE;
  }
}

export async function removeEmployeeRemote(id: string): Promise<SyncResult> {
  const token = sessionToken();
  if (!BACKEND_CONFIGURED || !token) {
    return { ok: false, message: 'Сервер недоступен.' };
  }
  try {
    const response = await call(`/warehouse/${WAREHOUSE_SITE_ID}/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers(token),
    });
    // 404: сотрудника на сервере уже нет, цель достигнута
    if (!response.ok && response.status !== 404) return await explain(response);
    await refreshWarehouse();
    return { ok: true };
  } catch {
    return NETWORK_FAILURE;
  }
}

/**
 * Перенос локальных правок в серверное хранилище (ARCHITECTURE.md, 5.4). Возвращает id записей,
 * которые теперь есть на сервере, и локальную копию можно удалить. Неудавшиеся остаются в браузере.
 */
export async function migrateLocalEmployees(
  local: WarehouseEmployee[],
  remote: RemoteWarehouse,
): Promise<string[]> {
  if (remote.status !== 'online') return [];
  const remoteById = new Map(remote.overrides.map((employee) => [employee.id, employee]));
  const done: string[] = [];
  for (const employee of local) {
    const onServer = remoteById.get(employee.id);
    if (onServer && (onServer.updatedAt ?? 0) >= (employee.updatedAt ?? 0)) {
      done.push(employee.id);
      continue;
    }
    const result = await pushEmployee(employee);
    if (result.ok) done.push(employee.id);
  }
  return done;
}
