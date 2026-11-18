// lib/opsApi.ts
import { API_BASE_URL, API_CLIENT_KEY, BACKEND_CONFIGURED } from '@/lib/ragApi';
import type { OperationsSnapshot } from '@/lib/operationsSnapshot';
import type { AiActionKind, AiProposal } from '@/types/operations';

export type OpsFailureKind = 'network' | 'timeout' | 'rate-limit' | 'auth' | 'validation' | 'server';

export type AssistOperationsResult =
  | {
      ok: true;
      answer: string;
      findings: string[];
      proposals: AiProposal[];
      generatedAt: number;
    }
  | { ok: false; kind: OpsFailureKind; message: string };

export type AiActionResult =
  | { ok: true; auditId: string; at: number; actor: string }
  | { ok: false; kind: OpsFailureKind; message: string };

export interface AiAuditEntry {
  id: string;
  at: number;
  actor: string;
  role: string;
  kind: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  result: string;
  source: string;
}

export type AiAuditResult =
  | { ok: true; entries: AiAuditEntry[] }
  | { ok: false; kind: OpsFailureKind; message: string };

const ASSIST_TIMEOUT_MS = 25_000;
const ACTION_TIMEOUT_MS = 15_000;

async function readDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map((item) => (typeof item === 'object' && item !== null ? (item as { msg?: unknown }).msg : null))
        .filter((msg): msg is string => typeof msg === 'string');
      return messages.length > 0 ? messages.join('; ') : null;
    }
    return null;
  } catch {
    return null;
  }
}

function headers(token?: string): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_CLIENT_KEY) result['X-API-Key'] = API_CLIENT_KEY;
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

function actionKind(value: unknown): value is AiActionKind {
  return (
    value === 'create_task' ||
    value === 'create_incident' ||
    value === 'assign_employee' ||
    value === 'change_incident_status' ||
    value === 'change_task_status'
  );
}

function isProposal(value: unknown): value is AiProposal {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<AiProposal>;
  return (
    typeof item.id === 'string' &&
    actionKind(item.kind) &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.reason === 'string' &&
    typeof item.summary === 'string' &&
    typeof item.payload === 'object' &&
    item.payload !== null &&
    typeof item.requiresAdmin === 'boolean'
  );
}

function isAssistResponse(value: unknown): value is {
  answer: string;
  findings: string[];
  proposals: AiProposal[];
  generatedAt: number;
} {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as {
    answer?: unknown;
    findings?: unknown;
    proposals?: unknown;
    generatedAt?: unknown;
  };
  return (
    typeof item.answer === 'string' &&
    Array.isArray(item.findings) &&
    item.findings.every((finding) => typeof finding === 'string') &&
    Array.isArray(item.proposals) &&
    item.proposals.every(isProposal) &&
    typeof item.generatedAt === 'number'
  );
}

/** Анализ операций. Только чтение: бэкенд не меняет данные. */
export async function assistOperations(
  question: string,
  snapshot: OperationsSnapshot,
): Promise<AssistOperationsResult> {
  if (!BACKEND_CONFIGURED) {
    return { ok: false, kind: 'network', message: 'Адрес бэкенда не задан.' };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ASSIST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/ai/assist`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ question, snapshot }),
      signal: controller.signal,
    });
    if (response.status === 429) {
      return {
        ok: false,
        kind: 'rate-limit',
        message: (await readDetail(response)) ?? 'Слишком много запросов, попробуйте через минуту.',
      };
    }
    if (response.status === 422) {
      return {
        ok: false,
        kind: 'validation',
        message: (await readDetail(response)) ?? 'Бэкенд не принял операционный снимок.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: 'server',
        message: (await readDetail(response)) ?? `Бэкенд ответил ошибкой ${response.status}.`,
      };
    }
    const data: unknown = await response.json();
    if (!isAssistResponse(data)) {
      return { ok: false, kind: 'server', message: 'Бэкенд вернул неожиданный формат AI-анализа.' };
    }
    return {
      ok: true,
      answer: data.answer,
      findings: data.findings,
      proposals: data.proposals,
      generatedAt: data.generatedAt,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'AI-анализ не ответил вовремя.' };
    }
    return { ok: false, kind: 'network', message: 'Не удалось связаться с AI-сервисом.' };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Подтверждённое действие. Требует токен администратора; сервер пишет аудит. */
export async function executeAiAction(proposal: AiProposal, token: string): Promise<AiActionResult> {
  if (!BACKEND_CONFIGURED) {
    return { ok: false, kind: 'network', message: 'Бэкенд не настроен: изменения недоступны.' };
  }
  if (!token) {
    return { ok: false, kind: 'auth', message: 'Нужен вход администратора.' };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/ai/action`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        kind: proposal.kind,
        title: proposal.title,
        summary: proposal.summary,
        payload: proposal.payload,
      }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        kind: 'auth',
        message: (await readDetail(response)) ?? 'Недостаточно прав: нужно войти как администратор.',
      };
    }
    if (response.status === 422) {
      return {
        ok: false,
        kind: 'validation',
        message: (await readDetail(response)) ?? 'Сервер отклонил параметры действия.',
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        kind: 'rate-limit',
        message: (await readDetail(response)) ?? 'Слишком много действий, попробуйте через минуту.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: 'server',
        message: (await readDetail(response)) ?? `Сервер ответил ошибкой ${response.status}.`,
      };
    }
    const data = (await response.json()) as {
      accepted?: unknown;
      auditId?: unknown;
      at?: unknown;
      actor?: unknown;
    };
    if (data.accepted !== true || typeof data.auditId !== 'string') {
      return { ok: false, kind: 'server', message: 'Сервер не подтвердил действие.' };
    }
    return {
      ok: true,
      auditId: data.auditId,
      at: typeof data.at === 'number' ? data.at : Date.now(),
      actor: typeof data.actor === 'string' ? data.actor : '',
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'Сервер не ответил вовремя.' };
    }
    return { ok: false, kind: 'network', message: 'Не удалось связаться с сервером.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchAiAudit(token: string, limit = 20): Promise<AiAuditResult> {
  if (!BACKEND_CONFIGURED) {
    return { ok: false, kind: 'network', message: 'Бэкенд не настроен.' };
  }
  if (!token) return { ok: false, kind: 'auth', message: 'Нужен вход администратора.' };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/ai/audit?limit=${Math.min(200, Math.max(1, limit))}`, {
      headers: headers(token),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        kind: 'auth',
        message: (await readDetail(response)) ?? 'Аудит доступен только администратору.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: 'server',
        message: (await readDetail(response)) ?? `Сервер ответил ошибкой ${response.status}.`,
      };
    }
    const data = (await response.json()) as { entries?: unknown };
    if (!Array.isArray(data.entries)) {
      return { ok: false, kind: 'server', message: 'Сервер вернул неожиданный формат аудита.' };
    }
    return { ok: true, entries: data.entries as AiAuditEntry[] };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'Аудит не ответил вовремя.' };
    }
    return { ok: false, kind: 'network', message: 'Не удалось получить аудит.' };
  } finally {
    window.clearTimeout(timer);
  }
}
