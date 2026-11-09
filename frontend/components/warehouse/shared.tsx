'use client';

import type { ReactNode } from 'react';
import { EMPLOYEE_STATUS_META, ZONE_TONES } from '@/constants/warehouse';
import { initials } from '@/lib/warehouseFormat';
import type { EmployeeStatus, WarehouseEmployee, ZoneStatus, ZoneTone } from '@/types/warehouse';

const STATUS_ORDER: EmployeeStatus[] = ['available', 'working', 'busy', 'break', 'offline'];

export function statusRank(status: EmployeeStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function EmployeeAvatar({
  employee,
  size = 36,
  muted = false,
  className = '',
}: {
  employee: Pick<WarehouseEmployee, 'firstName' | 'lastName' | 'avatarTone'>;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const tone = ZONE_TONES[(employee.avatarTone ?? 'slate') as ZoneTone];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: muted ? 'var(--surface-muted)' : tone.soft,
        borderColor: muted ? 'var(--line)' : tone.color,
        color: muted ? 'var(--muted-soft)' : tone.color,
        fontSize: Math.max(9, Math.round(size * 0.32)),
      }}
      aria-hidden="true"
    >
      {initials(employee)}
    </span>
  );
}

export function EmployeeStatusPill({
  status,
  compact = false,
}: {
  status: EmployeeStatus;
  compact?: boolean;
}) {
  const meta = EMPLOYEE_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        compact ? 'px-1.5' : ''
      }`}
      style={{
        color: meta.color,
        borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function ZoneStatusPill({ status }: { status: ZoneStatus }) {
  const map = {
    active: { label: 'Открыто', color: '#12b76a' },
    warning: { label: 'Высокая нагрузка', color: '#f79009' },
    closed: { label: 'Закрыто', color: '#f04438' },
  } as const;
  const meta = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        color: meta.color,
        borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 9%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="shrink-0 text-[var(--muted-soft)]">{label}</span>
      <span className="min-w-0 text-right font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}

export function PanelTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function DemoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]"
      title="Демонстрационный режим: координаты и статусы сотрудников симулируются. Реальное позиционирование BLE/UWB не подключено."
    >
      <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
      {compact ? 'демо' : 'демо-симуляция'}
    </span>
  );
}
