// lib/warehouseFormat.ts
import { ZONE_BY_ID, ZONE_TONES } from '@/constants/warehouse';
import type { SimulatedEmployee, WarehouseEmployee } from '@/types/warehouse';

export function initials(employee: Pick<WarehouseEmployee, 'firstName' | 'lastName'>): string {
  const first = employee.firstName.trim().charAt(0);
  const last = employee.lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || '—';
}

export function fullName(employee: Pick<WarehouseEmployee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatShortTime(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(timestamp: number, now: number): string {
  if (!timestamp) return 'нет данных';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'только что';
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  return `${hours} ч назад`;
}

export function zoneName(zoneId: string): string {
  return ZONE_BY_ID[zoneId]?.name ?? 'Вне зоны';
}

export function employeeAvatarStyle(employee: WarehouseEmployee) {
  const tone = ZONE_TONES[employee.avatarTone ?? 'slate'];
  return {
    backgroundColor: tone.soft,
    color: tone.color,
    borderColor: tone.color,
  };
}

export function searchText(employee: SimulatedEmployee): string {
  return [
    employee.firstName,
    employee.lastName,
    employee.location,
    employee.role,
    employee.department,
    employee.task,
    ...employee.responsibilities,
    zoneName(employee.currentZoneId),
    zoneName(employee.zoneId),
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesEmployee(
  employee: SimulatedEmployee,
  query: string,
  department: string,
  role: string,
  status: string,
): boolean {
  if (department !== 'all' && employee.department !== department) return false;
  if (role !== 'all' && employee.role !== role) return false;
  if (status !== 'all' && employee.status !== status) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = searchText(employee);
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function formatMeters(meters: number): string {
  return `${meters} м`;
}

export function zoneStatusLabel(status: 'active' | 'warning' | 'closed'): string {
  if (status === 'active') return 'Открыто';
  if (status === 'warning') return 'Высокая нагрузка';
  return 'Закрыто';
}

export function zoneStatusColor(status: 'active' | 'warning' | 'closed'): string {
  if (status === 'active') return '#12b76a';
  if (status === 'warning') return '#f79009';
  return '#f04438';
}
