'use client';

import {
  EMPLOYEE_STATUS_META,
  EQUIPMENT_KIND_META,
  EQUIPMENT_STATUS_META,
  QUICK_ACTIONS,
  START_OPTIONS,
  ZONE_TONES,
} from '@/constants/warehouse';
import { relativeTime, fullName, matchesEmployee } from '@/lib/warehouseFormat';
import type {
  SimulatedEmployee,
  WarehouseEquipment,
  WarehouseSelection,
  WarehouseZone,
} from '@/types/warehouse';
import { EmployeeAvatar, statusRank } from '@/components/warehouse/shared';
import {
  IconBox,
  IconClose,
  IconEdit,
  IconFilter,
  IconForklift,
  IconGate,
  IconPallet,
  IconPlus,
  IconSearch,
  IconTarget,
  IconTruck,
  IconUsers,
} from '@/components/warehouse/icons';

export type WarehouseTab = 'people' | 'zones' | 'equipment';

const EQUIPMENT_ICONS = {
  forklift: IconForklift,
  truck: IconTruck,
  pallet: IconPallet,
  gate: IconGate,
} as const;

interface WarehouseSidebarProps {
  mode: 'client' | 'admin';
  employees: SimulatedEmployee[];
  zones: WarehouseZone[];
  equipment: WarehouseEquipment[];
  query: string;
  onQuery: (value: string) => void;
  department: string;
  onDepartment: (value: string) => void;
  role: string;
  onRole: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  departments: string[];
  roles: string[];
  tab: WarehouseTab;
  onTab: (tab: WarehouseTab) => void;
  selection: WarehouseSelection;
  now: number;
  startNodeId: string;
  onStartNode: (id: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectZone: (id: string) => void;
  onSelectEquipment: (id: string) => void;
  onNearestAvailable: () => void;
  onAddEmployee: () => void;
  onEditEmployee: (employee: SimulatedEmployee) => void;
}

function countByStatus(employees: SimulatedEmployee[], status: string) {
  if (status === 'all') return employees.length;
  return employees.filter((employee) => employee.status === status).length;
}

export function WarehouseSidebar({
  mode,
  employees,
  zones,
  equipment,
  query,
  onQuery,
  department,
  onDepartment,
  role,
  onRole,
  status,
  onStatus,
  departments,
  roles,
  tab,
  onTab,
  selection,
  now,
  startNodeId,
  onStartNode,
  onSelectEmployee,
  onSelectZone,
  onSelectEquipment,
  onNearestAvailable,
  onAddEmployee,
  onEditEmployee,
}: WarehouseSidebarProps) {
  const filtered = employees
    .filter((employee) => matchesEmployee(employee, query, department, role, status))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || fullName(a).localeCompare(fullName(b), 'ru'));

  const visibleZones = zones.filter((zone) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return `${zone.name} ${zone.shortName} ${zone.purpose} ${zone.state}`.toLowerCase().includes(normalized);
  });

  const visibleEquipment = equipment.filter((item) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return `${item.name} ${item.task} ${EQUIPMENT_KIND_META[item.kind].label}`.toLowerCase().includes(normalized);
  });

  const filterCount = (department !== 'all' ? 1 : 0) + (role !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-[var(--line)] p-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-soft)]" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Сотрудник, должность, задача или зона"
            className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] pl-8 pr-8 text-[11px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
            aria-label="Поиск по складу"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--muted-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              aria-label="Очистить поиск"
            >
              <IconClose className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onQuery(action.query);
                onTab('people');
              }}
              className={`rounded-full border px-2 py-0.5 text-[9px] transition ${
                query === action.query
                  ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
            <IconFilter className="h-3 w-3" />
            Фильтры
            {filterCount > 0 ? (
              <span className="rounded-full bg-[var(--accent-soft-2)] px-1.5 text-[8px] text-[var(--accent)]">
                {filterCount}
              </span>
            ) : null}
          </span>
          {filterCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                onDepartment('all');
                onRole('all');
                onStatus('all');
              }}
              className="text-[9px] text-[var(--muted-soft)] transition hover:text-[var(--text)]"
            >
              сбросить
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={department}
            onChange={(event) => onDepartment(event.target.value)}
            className="h-8 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
            aria-label="Фильтр по отделу"
          >
            <option value="all">Все отделы</option>
            {departments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(event) => onRole(event.target.value)}
            className="h-8 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
            aria-label="Фильтр по роли"
          >
            <option value="all">Все роли</option>
            {roles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onStatus('all')}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] transition ${
              status === 'all'
                ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Все · {employees.length}
          </button>
          {(Object.keys(EMPLOYEE_STATUS_META) as Array<keyof typeof EMPLOYEE_STATUS_META>).map((key) => {
            const meta = EMPLOYEE_STATUS_META[key];
            const count = countByStatus(employees, key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onStatus(status === key ? 'all' : key)}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] transition ${
                  status === key
                    ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                title={meta.description}
              >
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: meta.color }} />
                {meta.short} · {count}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onNearestAvailable}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[9px] text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--accent)]"
          >
            <IconTarget className="h-3 w-3" />
            Ближайший доступный
          </button>
          {mode === 'admin' ? (
            <button
              type="button"
              onClick={onAddEmployee}
              className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[var(--accent-line-2)] bg-[var(--accent-soft)] px-2 text-[9px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft-2)]"
            >
              <IconPlus className="h-3 w-3" />
              Добавить
            </button>
          ) : null}
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1">
          <span className="shrink-0 text-[9px] text-[var(--muted-soft)]">Старт</span>
          <select
            value={startNodeId}
            onChange={(event) => onStartNode(event.target.value)}
            className="h-5 min-w-0 flex-1 cursor-pointer bg-transparent text-[9px] text-[var(--text)] outline-none"
            aria-label="Стартовая точка маршрута"
          >
            {START_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex shrink-0 items-center border-b border-[var(--line)] px-2 pt-1.5">
        {(
          [
            { id: 'people', label: 'Люди', count: filtered.length, icon: IconUsers },
            { id: 'zones', label: 'Зоны', count: visibleZones.length, icon: IconBox },
            { id: 'equipment', label: 'Техника', count: visibleEquipment.length, icon: IconTruck },
          ] as const
        ).map((item) => {
          const ItemIcon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-1 py-1.5 text-[10px] transition ${
                active
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <ItemIcon className="h-3 w-3" />
              {item.label}
              <span className={`rounded-full px-1 text-[8px] ${active ? 'bg-[var(--accent-soft-2)] text-[var(--accent)]' : 'bg-[var(--surface-muted)] text-[var(--muted-soft)]'}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'people' ? (
          filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[10px] leading-relaxed text-[var(--muted-soft)]">
              Никого не нашли. Попробуйте другой запрос или сбросьте фильтры.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((employee) => {
                const active = selection?.kind === 'employee' && selection.id === employee.id;
                const meta = EMPLOYEE_STATUS_META[employee.status];
                return (
                  <div
                    key={employee.id}
                    className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
                      active
                        ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                        : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectEmployee(employee.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <EmployeeAvatar employee={employee} size={28} muted={employee.status === 'offline'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[10.5px] font-medium text-[var(--text)]">
                            {fullName(employee)}
                          </span>
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: meta.color }}
                            title={meta.label}
                          />
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">
                          {employee.position} ·{' '}
                          {mode === 'admin' ? employee.department : relativeTime(employee.lastUpdate, now)}
                        </span>
                      </span>
                    </button>
                    {mode === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => onEditEmployee(employee)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--muted-soft)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Редактировать ${fullName(employee)}`}
                      >
                        <IconEdit className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : tab === 'zones' ? (
          <div className="space-y-1">
            {visibleZones.map((zone) => {
              const active = selection?.kind === 'zone' && selection.id === zone.id;
              const tone = ZONE_TONES[zone.tone];
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelectZone(zone.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                      : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border"
                    style={{ backgroundColor: tone.soft, borderColor: tone.color, color: tone.color }}
                  >
                    <IconBox className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-[var(--text)]">{zone.shortName}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">{zone.state}</span>
                  </span>
                  <span className="shrink-0 text-[9px] tabular-nums text-[var(--muted-soft)]">{zone.load}%</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleEquipment.map((item) => {
              const active = selection?.kind === 'equipment' && selection.id === item.id;
              const meta = EQUIPMENT_STATUS_META[item.status];
              const ItemIcon = EQUIPMENT_ICONS[item.kind];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectEquipment(item.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)]'
                      : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-[var(--surface)]"
                    style={{ borderColor: meta.color, color: meta.color }}
                  >
                    <ItemIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-[var(--text)]">{item.name}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">{item.task}</span>
                  </span>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px]" style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}>
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
