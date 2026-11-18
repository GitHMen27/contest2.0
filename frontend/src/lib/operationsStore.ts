// lib/operationsStore.ts
'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { buildSeedState } from '@/constants/operations';
import { EMPTY_OPERATIONS_STATE } from '@/lib/operationsFormat';
import type {
  Incident,
  IncidentSeverity,
  OpsEvent,
  OpsSource,
  OperationsState,
  TaskPriority,
  TaskStatus,
  WarehouseTask,
} from '@/types/operations';

const STORAGE_KEY = 'wb-operations-v1';
const EVENT_NAME = 'wb-operations-store';
const MAX_EVENTS = 250;
const SSR_SNAPSHOT = JSON.stringify(EMPTY_OPERATIONS_STATE);

let cachedRaw: string | null = null;

function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseState(raw: string): OperationsState | null {
  try {
    const data = JSON.parse(raw) as Partial<OperationsState>;
    if (
      data.version !== 1 ||
      !Array.isArray(data.incidents) ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.events)
    ) {
      return null;
    }
    return {
      version: 1,
      incidents: data.incidents.filter(isRecord) as unknown as Incident[],
      tasks: data.tasks.filter(isRecord) as unknown as WarehouseTask[],
      events: data.events.filter(isRecord) as unknown as OpsEvent[],
    };
  } catch {
    return null;
  }
}

function readState(): OperationsState {
  if (typeof window === 'undefined') return EMPTY_OPERATIONS_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseState(raw);
      if (parsed) return parsed;
    }
  } catch {
    // приватный режим или заблокированное хранилище — работаем на демо-снимке
  }
  return buildSeedState(Date.now());
}

function getSnapshot(): string {
  if (cachedRaw === null) cachedRaw = JSON.stringify(readState());
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

function writeState(state: OperationsState) {
  const next: OperationsState = {
    ...state,
    events: state.events
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_EVENTS),
  };
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // остаёмся на значении в памяти
  }
  cachedRaw = raw;
  window.dispatchEvent(new Event(EVENT_NAME));
}

function mutate(updater: (state: OperationsState) => OperationsState) {
  const state = cachedRaw ? parseState(cachedRaw) ?? readState() : readState();
  writeState(updater(state));
}

export function useOperations(): OperationsState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => parseState(raw) ?? EMPTY_OPERATIONS_STATE, [raw]);
}

function event(input: Omit<OpsEvent, 'id' | 'at'> & { at?: number }): OpsEvent {
  return {
    id: makeId('evt'),
    at: input.at ?? Date.now(),
    type: input.type,
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    source: input.source,
    hubId: input.hubId,
    zoneId: input.zoneId,
    actor: input.actor,
    auditId: input.auditId,
  };
}

export function recordEvent(input: Omit<OpsEvent, 'id' | 'at'> & { at?: number }) {
  mutate((state) => ({ ...state, events: [event(input), ...state.events].slice(0, MAX_EVENTS) }));
}

export interface NewIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  category: Incident['category'];
  hubId: string;
  zoneId?: string;
  equipmentId?: string;
  owner: string;
  ownerId?: string;
  recommendation?: string;
  source?: OpsSource;
  actor?: string;
}

export function addIncident(input: NewIncidentInput): string {
  const id = makeId('inc');
  const now = Date.now();
  const incident: Incident = {
    id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: 'new',
    category: input.category,
    hubId: input.hubId,
    zoneId: input.zoneId,
    equipmentId: input.equipmentId,
    owner: input.owner,
    ownerId: input.ownerId,
    recommendation: input.recommendation,
    source: input.source ?? 'user',
    createdAt: now,
    updatedAt: now,
  };
  mutate((state) => ({
    ...state,
    incidents: [incident, ...state.incidents],
    events: [
      event({
        type: 'incident',
        title: `Новый инцидент: ${input.title}`,
        detail: input.description,
        severity: input.severity,
        source: input.source ?? 'user',
        hubId: input.hubId,
        zoneId: input.zoneId,
        actor: input.actor,
        at: now,
      }),
      ...state.events,
    ],
  }));
  return id;
}

export function updateIncident(
  id: string,
  patch: Partial<Pick<Incident, 'status' | 'owner' | 'ownerId' | 'severity' | 'recommendation'>>,
  actor?: string,
  source: OpsSource = 'user',
) {
  const now = Date.now();
  mutate((state) => {
    const current = state.incidents.find((item) => item.id === id);
    if (!current) return state;
    const next: Incident = { ...current, ...patch, updatedAt: now };
    const statusChanged = patch.status && patch.status !== current.status;
    return {
      ...state,
      incidents: state.incidents.map((item) => (item.id === id ? next : item)),
      events: statusChanged
        ? [
            event({
              type: 'incident',
              title: next.title,
              detail:
                next.status === 'resolved'
                  ? 'Инцидент закрыт. Решение зафиксировано в истории.'
                  : next.status === 'in_progress'
                    ? `Инцидент взят в работу${actor ? `: ${actor}` : ''}.`
                    : 'Статус инцидента изменён на «Новый».',
              severity: next.severity,
              source,
              hubId: next.hubId,
              zoneId: next.zoneId,
              actor,
              at: now,
            }),
            ...state.events,
          ]
        : state.events,
    };
  });
}

export interface NewTaskInput {
  title: string;
  description: string;
  assigneeId: string;
  zoneId: string;
  equipmentId?: string;
  priority: TaskPriority;
  dueAt: number;
  source?: OpsSource;
  actor?: string;
}

export function addTask(input: NewTaskInput): string {
  const id = makeId('task');
  const now = Date.now();
  const status: TaskStatus = 'new';
  const history =
    input.assigneeId.length > 0
      ? [
          {
            at: now,
            status,
            note: `Задача создана и назначена${input.actor ? `: ${input.actor}` : ''}`,
            actor: input.actor ?? 'Система',
          },
        ]
      : [{ at: now, status, note: 'Задача создана, исполнитель не назначен', actor: input.actor ?? 'Система' }];
  const task: WarehouseTask = {
    id,
    title: input.title,
    description: input.description,
    assigneeId: input.assigneeId,
    zoneId: input.zoneId,
    equipmentId: input.equipmentId,
    priority: input.priority,
    status,
    dueAt: input.dueAt,
    createdAt: now,
    updatedAt: now,
    source: input.source ?? 'user',
    history,
  };
  mutate((state) => ({
    ...state,
    tasks: [task, ...state.tasks],
    events: [
      event({
        type: 'task',
        title: `Новая задача: ${input.title}`,
        detail: `Приоритет: ${input.priority}. Срок: ${new Date(input.dueAt).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}.`,
        severity: input.priority === 'urgent' ? 'high' : 'info',
        source: input.source ?? 'user',
        hubId: 'shushary',
        zoneId: input.zoneId,
        actor: input.actor,
        at: now,
      }),
      ...state.events,
    ],
  }));
  return id;
}

export function updateTask(
  id: string,
  patch: Partial<Pick<WarehouseTask, 'title' | 'description' | 'assigneeId' | 'zoneId' | 'equipmentId' | 'priority' | 'dueAt' | 'status'>>,
  actor: string,
  note?: string,
  source: OpsSource = 'user',
) {
  const now = Date.now();
  mutate((state) => {
    const current = state.tasks.find((item) => item.id === id);
    if (!current) return state;
    const nextStatus = patch.status ?? current.status;
    const statusChanged = nextStatus !== current.status;
    const assigneeChanged = patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId;
    const next: WarehouseTask = {
      ...current,
      ...patch,
      updatedAt: now,
      history:
        statusChanged || assigneeChanged
          ? [
              ...current.history,
              {
                at: now,
                status: nextStatus,
                note:
                  note ??
                  (statusChanged
                    ? `Статус изменён на «${nextStatus}»`
                    : 'Изменён исполнитель задачи'),
                actor,
              },
            ]
          : current.history,
    };
    const eventTitle = statusChanged
      ? `Задача «${next.title}»: ${nextStatus}`
      : assigneeChanged
        ? `Задача «${next.title}»: новый исполнитель`
        : `Задача «${next.title}» обновлена`;
    return {
      ...state,
      tasks: state.tasks.map((item) => (item.id === id ? next : item)),
      events: [
        event({
          type: 'task',
          title: eventTitle,
          detail: note ?? (assigneeChanged ? `Исполнитель: ${patch.assigneeId || 'не назначен'}` : 'Параметры задачи изменены.'),
          severity: next.priority === 'urgent' ? 'high' : 'info',
          source,
          hubId: 'shushary',
          zoneId: next.zoneId,
          actor,
          at: now,
        }),
        ...state.events,
      ],
    };
  });
}

export function changeTaskStatus(id: string, status: TaskStatus, actor: string, note?: string) {
  updateTask(id, { status }, actor, note);
}

export function assignTask(id: string, assigneeId: string, actor: string, note?: string) {
  updateTask(id, { assigneeId }, actor, note ?? (assigneeId ? 'Назначен исполнитель задачи' : 'Исполнитель снят'));
}

export function openIncidentCount(state: Pick<OperationsState, 'incidents'>): number {
  return state.incidents.filter((incident) => incident.status !== 'resolved').length;
}
