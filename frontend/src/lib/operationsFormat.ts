// lib/operationsFormat.ts
import type { Incident, IncidentSeverity, OperationsState, TaskStatus, WarehouseTask } from '@/types/operations';

export const EMPTY_OPERATIONS_STATE: OperationsState = {
  version: 1,
  incidents: [],
  tasks: [],
  events: [],
};

const MINUTE = 60_000;
const HOUR = 3_600_000;

export function formatOpsTime(at: number): string {
  return new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatOpsDateTime(at: number): string {
  return new Date(at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOpsRelative(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  if (delta < MINUTE) return 'только что';
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE);
    return `${minutes} мин назад`;
  }
  if (delta < 24 * HOUR) {
    const hours = Math.floor(delta / HOUR);
    return `${hours} ч назад`;
  }
  const days = Math.floor(delta / (24 * HOUR));
  if (days === 1) return 'вчера';
  return `${days} дн назад`;
}

export function formatDue(at: number, now: number): string {
  const delta = at - now;
  const abs = Math.abs(delta);
  if (abs < HOUR) {
    const minutes = Math.max(1, Math.round(abs / MINUTE));
    return delta < 0 ? `просрочено на ${minutes} мин` : `через ${minutes} мин`;
  }
  if (abs < 24 * HOUR) {
    const hours = Math.round(abs / HOUR);
    return delta < 0 ? `просрочено на ${hours} ч` : `через ${hours} ч`;
  }
  return formatOpsDateTime(at);
}

export function isTaskOverdue(task: WarehouseTask, now: number): boolean {
  return task.status !== 'done' && task.dueAt < now;
}

export function taskStatusRank(status: TaskStatus): number {
  return status === 'blocked' ? 0 : status === 'in_progress' ? 1 : status === 'new' ? 2 : 3;
}

export function incidentSeverityRank(severity: IncidentSeverity): number {
  return severity === 'critical' ? 0 : severity === 'high' ? 1 : severity === 'medium' ? 2 : 3;
}

export function sortIncidents(incidents: Incident[]): Incident[] {
  return [...incidents].sort(
    (a, b) =>
      Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
      incidentSeverityRank(a.severity) - incidentSeverityRank(b.severity) ||
      b.updatedAt - a.updatedAt,
  );
}

export function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} млн ₽`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} тыс ₽`;
  return `${Math.round(value)} ₽`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
