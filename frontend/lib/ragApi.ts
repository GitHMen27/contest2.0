import type { AiSource, RetrievalChannel } from '@/types/logistics';

/**
 * Клиент бэкенда RAG (FastAPI, ai-service).
 *
 * Адрес берётся из NEXT_PUBLIC_API_URL на этапе сборки (сайт собирается как статика, поэтому переменная
 * вшивается в код и после сборки не меняется). Если адрес не задан, чат работает на локальной демо-базе.
 * Обращаться к process.env нужно по полному имени: динамические обращения Next.js не подставляет.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
// Ключ виден в браузере всем, кто откроет сайт: это не секрет, а лишь отсекает случайные запросы.
const API_KEY = (process.env.NEXT_PUBLIC_API_KEY ?? '').trim();

const ASK_TIMEOUT_MS = 25_000; // бесплатный хостинг может «просыпаться» заметно дольше обычного ответа
const HEALTH_TIMEOUT_MS = 20_000;

export const BACKEND_CONFIGURED = API_URL.length > 0;
export const API_BASE_URL = API_URL;

interface BackendSource {
  doc: string;
  section: string;
  content: string;
  score: number;
  via: string[];
}

interface BackendAnswer {
  answer: string;
  sources: BackendSource[];
}

export interface BackendHealth {
  chunks: number | null;
  llmModel: string | null;
}

export type AskFailureKind = 'network' | 'timeout' | 'rate-limit' | 'auth' | 'validation' | 'server';

// Ограничения поля question в схеме бэкенда (QuestionRequest): minLength 3, maxLength 1000.
const QUESTION_MIN_LENGTH = 3;
const QUESTION_MAX_LENGTH = 1000;

export type AskResult =
  | { ok: true; text: string; sources: AiSource[]; latencyMs: number }
  | { ok: false; kind: AskFailureKind; message: string };

function isChannel(value: string): value is RetrievalChannel {
  return value === 'vector' || value === 'fts';
}

/** Приводит источники бэкенда к тому виду, который рисует интерфейс. */
export function toAiSources(sources: BackendSource[]): AiSource[] {
  return sources.map((source, index) => ({
    id: `live-${index}-${source.doc}-${source.section}`,
    doc: source.doc,
    section: source.section,
    excerpt: source.content,
    // Оценка после слияния поисков (RRF) это ранг, а не процент: интерфейс её не показывает.
    score: source.score,
    scoreKind: 'rrf' as const,
    via: source.via.filter(isChannel),
  }));
}

function isBackendAnswer(value: unknown): value is BackendAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BackendAnswer>;
  return typeof candidate.answer === 'string' && Array.isArray(candidate.sources);
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') return data.detail;
    // Ошибка валидации FastAPI (422): detail приходит массивом объектов с полем msg.
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

/** Задать вопрос бэкенду. Никогда не бросает исключение: всегда возвращает AskResult. */
export async function askBackend(question: string): Promise<AskResult> {
  if (!BACKEND_CONFIGURED) {
    return { ok: false, kind: 'network', message: 'Адрес бэкенда не задан (NEXT_PUBLIC_API_URL).' };
  }

  const text = question.trim().slice(0, QUESTION_MAX_LENGTH);
  if (text.length < QUESTION_MIN_LENGTH) {
    return {
      ok: false,
      kind: 'validation',
      message: `Вопрос слишком короткий: нужно минимум ${QUESTION_MIN_LENGTH} символа.`,
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const response = await fetch(`${API_URL}/rag/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: text }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const detail = await readDetail(response);
      return { ok: false, kind: 'rate-limit', message: detail ?? 'Слишком много запросов, попробуйте через минуту.' };
    }
    if (response.status === 422) {
      const detail = await readDetail(response);
      return { ok: false, kind: 'validation', message: detail ?? 'Бэкенд не принял вопрос.' };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'auth', message: 'Бэкенд не принял ключ доступа.' };
    }
    if (!response.ok) {
      const detail = await readDetail(response);
      return { ok: false, kind: 'server', message: detail ?? `Бэкенд ответил ошибкой ${response.status}.` };
    }

    const data: unknown = await response.json();
    if (!isBackendAnswer(data)) {
      return { ok: false, kind: 'server', message: 'Бэкенд вернул ответ в неожиданном формате.' };
    }

    return {
      ok: true,
      text: data.answer,
      sources: toAiSources(data.sources),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'Бэкенд не ответил вовремя.' };
    }
    return { ok: false, kind: 'network', message: 'Не удалось связаться с бэкендом.' };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Проверка, что бэкенд жив. Заодно «будит» бесплатный хостинг, который засыпает без запросов.
 * Возвращает null, если бэкенд недоступен.
 */
export async function pingBackend(): Promise<BackendHealth | null> {
  if (!BACKEND_CONFIGURED) return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { chunks?: unknown; llm_model?: unknown };
    return {
      chunks: typeof data.chunks === 'number' ? data.chunks : null,
      llmModel: typeof data.llm_model === 'string' ? data.llm_model : null,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
