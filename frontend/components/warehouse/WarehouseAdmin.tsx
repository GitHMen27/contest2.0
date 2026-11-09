'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BASE_EMPLOYEES,
  DEPARTMENTS,
  ROLES,
  WAREHOUSE_EQUIPMENT,
  ZONE_BY_ID,
  ZONES,
} from '@/constants/warehouse';
import { useNow } from '@/lib/useNow';
import {
  deleteWarehouseEmployee,
  saveWarehouseEmployee,
  useWarehouseOverrides,
} from '@/lib/warehouseStore';
import { mergeEmployees } from '@/lib/warehouseSimulation';
import { matchesEmployee } from '@/lib/warehouseFormat';
import {
  buildRouteToEmployee,
  buildRouteToPoint,
  buildRouteToZone,
  findNearestAvailableEmployee,
} from '@/lib/warehouseRouting';
import type {
  RouteResult,
  SimulatedEmployee,
  WarehouseEmployee,
  WarehouseSelection,
} from '@/types/warehouse';
import { WarehouseHeader } from '@/components/warehouse/WarehouseHeader';
import { WarehouseMap } from '@/components/warehouse/WarehouseMap';
import { WarehouseMap3D } from '@/components/warehouse/WarehouseMap3D';
import { WarehouseViewToggle, type WarehouseView } from '@/components/warehouse/WarehouseViewToggle';
import { WarehouseSidebar, type WarehouseTab } from '@/components/warehouse/WarehouseSidebar';
import { Inspector } from '@/components/warehouse/Inspector';
import { EmployeeFormModal } from '@/components/warehouse/EmployeeFormModal';
import { IconClose, IconEdit, IconRoute, IconUsers } from '@/components/warehouse/icons';

const BASE_IDS = new Set(BASE_EMPLOYEES.map((employee) => employee.id));

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'accent' | 'ok' | 'warn' | 'muted';
}) {
  const color =
    tone === 'accent'
      ? 'text-[var(--accent)]'
      : tone === 'ok'
        ? 'text-emerald-700'
        : tone === 'warn'
          ? 'text-amber-700'
          : 'text-[var(--text)]';
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
      <div className="text-[9px] text-[var(--muted-soft)]">{label}</div>
      <div className={`mt-0.5 text-[16px] font-semibold leading-none tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[8px] text-[var(--muted-soft)]">{hint}</div> : null}
    </div>
  );
}

export function WarehouseAdmin() {
  const now = useNow();
  const overrides = useWarehouseOverrides();
  const employees = useMemo(() => mergeEmployees(now, overrides), [now, overrides]);

  const [selection, setSelection] = useState<WarehouseSelection>(null);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [tab, setTab] = useState<WarehouseTab>('people');
  const [startNodeId, setStartNodeId] = useState('entrance');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseEmployee | null>(null);
  const [view, setView] = useState<WarehouseView>('3d');

  const employee =
    selection?.kind === 'employee'
      ? employees.find((item) => item.id === selection.id) ?? null
      : null;
  const zone = selection?.kind === 'zone' ? ZONE_BY_ID[selection.id] ?? null : null;
  const equipment =
    selection?.kind === 'equipment'
      ? WAREHOUSE_EQUIPMENT.find((item) => item.id === selection.id) ?? null
      : null;

  const filtersActive = query.trim() !== '' || department !== 'all' || role !== 'all' || status !== 'all';
  const focusIds = useMemo(() => {
    if (!filtersActive) return null;
    return new Set(
      employees.filter((item) => matchesEmployee(item, query, department, role, status)).map((item) => item.id),
    );
  }, [employees, query, department, role, status, filtersActive]);

  const stats = useMemo(() => {
    const count = (value: SimulatedEmployee['status']) =>
      employees.filter((item) => item.status === value).length;
    return {
      total: employees.length,
      available: count('available'),
      busy: count('busy'),
      offline: count('offline'),
      moving: employees.filter((item) => item.moving).length,
      localChanges: overrides.length,
      lastChange: [...overrides].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null,
    };
  }, [employees, overrides]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setRoute(null);
  }, []);

  const selectEmployee = useCallback((id: string) => {
    setSelection({ kind: 'employee', id });
    setRoute(null);
  }, []);

  const selectZone = useCallback((id: string) => {
    setSelection({ kind: 'zone', id });
    setRoute(null);
  }, []);

  const selectEquipment = useCallback((id: string) => {
    setSelection({ kind: 'equipment', id });
    setRoute(null);
  }, []);

  const buildRoute = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'employee') {
      const target = employees.find((item) => item.id === selection.id);
      if (target) setRoute(buildRouteToEmployee(startNodeId, target));
      return;
    }
    if (selection.kind === 'zone') {
      const target = ZONE_BY_ID[selection.id];
      if (target) setRoute(buildRouteToZone(startNodeId, target));
      return;
    }
    const target = WAREHOUSE_EQUIPMENT.find((item) => item.id === selection.id);
    if (target) setRoute(buildRouteToPoint(startNodeId, target.location, target.name));
  }, [employees, selection, startNodeId]);

  const nearestAvailable = useCallback(() => {
    const result = findNearestAvailableEmployee(employees, startNodeId);
    if (!result) return;
    setSelection({ kind: 'employee', id: result.employee.id });
    setRoute(result.route);
  }, [employees, startNodeId]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((target: SimulatedEmployee) => {
    setEditing(target);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const saveEmployee = useCallback(
    (next: WarehouseEmployee) => {
      saveWarehouseEmployee(next);
      setSelection({ kind: 'employee', id: next.id });
      closeForm();
    },
    [closeForm],
  );

  const deactivateEmployee = useCallback(
    (target: SimulatedEmployee) => {
      const confirmed = window.confirm(
        `Отключить ${target.firstName} ${target.lastName}? Сотрудник останется в списке со статусом «Не в сети».`,
      );
      if (!confirmed) return;
      saveWarehouseEmployee({
        ...target,
        status: 'offline',
        online: false,
        task: 'Деактивирован администратором',
        updatedAt: Date.now(),
      });
      setRoute(null);
    },
    [],
  );

  const removeEmployee = useCallback(
    (target: SimulatedEmployee) => {
      if (BASE_IDS.has(target.id)) return;
      const confirmed = window.confirm(`Удалить ${target.firstName} ${target.lastName} из демо-списка?`);
      if (!confirmed) return;
      deleteWarehouseEmployee(target.id);
      setSelection(null);
      setRoute(null);
    },
    [],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)] text-[var(--text)] lg:h-[100dvh] lg:overflow-hidden">
      <WarehouseHeader mode="admin" now={now} />

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2 sm:px-5">
        <div className="grid w-full grid-cols-3 gap-1.5 sm:w-auto sm:grid-cols-5">
          <StatCard label="Всего" value={stats.total} hint="в демо-списке" />
          <StatCard label="Доступны" value={stats.available} tone="accent" hint="для обращения" />
          <StatCard label="Заняты" value={stats.busy} tone="warn" hint="выполняют операцию" />
          <StatCard label="Не в сети" value={stats.offline} tone="muted" hint="нет данных" />
          <StatCard label="В движении" value={stats.moving} tone="ok" hint="сейчас" />
        </div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-[9px] text-[var(--muted)]">
            Локальные правки: <span className="font-medium text-[var(--text)]">{stats.localChanges}</span>
          </span>
          {stats.lastChange ? (
            <span className="max-w-[260px] truncate text-[9px] text-[var(--muted-soft)]">
              последнее: {stats.lastChange.firstName} {stats.lastChange.lastName}
            </span>
          ) : (
            <span className="text-[9px] text-[var(--muted-soft)]">изменений пока нет</span>
          )}
          <span className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-[9px] text-[var(--muted-soft)]">
            <IconEdit className="h-3 w-3" />
            демо-данные
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_352px]">
        <aside className="hidden min-h-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
          <WarehouseSidebar
            mode="admin"
            employees={employees}
            zones={ZONES}
            equipment={WAREHOUSE_EQUIPMENT}
            query={query}
            onQuery={setQuery}
            department={department}
            onDepartment={setDepartment}
            role={role}
            onRole={setRole}
            status={status}
            onStatus={setStatus}
            departments={DEPARTMENTS}
            roles={ROLES}
            tab={tab}
            onTab={setTab}
            selection={selection}
            now={now}
            startNodeId={startNodeId}
            onStartNode={setStartNodeId}
            onSelectEmployee={selectEmployee}
            onSelectZone={selectZone}
            onSelectEquipment={selectEquipment}
            onNearestAvailable={nearestAvailable}
            onAddEmployee={openCreate}
            onEditEmployee={openEdit}
          />
        </aside>

        <main className="relative h-[50vh] min-h-[360px] w-full shrink-0 border-b border-[var(--line)] lg:h-auto lg:min-h-0 lg:border-b-0">
          <WarehouseViewToggle view={view} onChange={setView} />

          {view === '3d' ? (
            <WarehouseMap3D
              employees={employees}
              selected={selection}
              focusIds={focusIds}
              route={route}
              onSelectZone={selectZone}
              onSelectEmployee={selectEmployee}
              onSelectEquipment={selectEquipment}
            />
          ) : (
            <WarehouseMap
              employees={employees}
              selected={selection}
              focusIds={focusIds}
              route={route}
              onSelectZone={selectZone}
              onSelectEmployee={selectEmployee}
              onSelectEquipment={selectEquipment}
            />
          )}

          <div className="pointer-events-none absolute left-3 top-20 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-1 text-[9px] text-[var(--muted)] shadow-sm backdrop-blur">
            <span className="font-medium text-[var(--text)]">Административный режим</span> · полные
            данные и история
          </div>

          {route ? (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--priority-line)] bg-[var(--surface)]/95 px-2.5 py-1.5 shadow-md backdrop-blur sm:gap-3">
              <IconRoute className="h-3.5 w-3.5 shrink-0 text-[var(--priority)]" />
              <span className="hidden max-w-[220px] truncate text-[10px] text-[var(--muted)] sm:block">
                {route.fromLabel} → <span className="font-medium text-[var(--text)]">{route.toLabel}</span>
              </span>
              <span className="text-[10px] font-medium tabular-nums text-[var(--text)]">
                {route.distanceMeters} м · {route.durationMinutes} мин
              </span>
              <button
                type="button"
                onClick={() => setRoute(null)}
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                aria-label="Сбросить маршрут"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </main>

        <aside className="hidden min-h-0 flex-col border-l border-[var(--line)] bg-[var(--surface)] xl:flex">
          <Inspector
            selection={selection}
            employee={employee}
            zone={zone}
            equipment={equipment}
            employees={employees}
            route={route}
            startNodeId={startNodeId}
            mode="admin"
            now={now}
            canDelete={Boolean(employee && !BASE_IDS.has(employee.id))}
            onSelectEmployee={selectEmployee}
            onSelectZone={selectZone}
            onBuildRoute={buildRoute}
            onClearRoute={() => setRoute(null)}
            onClose={clearSelection}
            onEditEmployee={openEdit}
            onDeactivateEmployee={deactivateEmployee}
            onDeleteEmployee={removeEmployee}
          />
        </aside>

        <div className="border-t border-[var(--line)] bg-[var(--surface)] lg:hidden">
          <WarehouseSidebar
            mode="admin"
            employees={employees}
            zones={ZONES}
            equipment={WAREHOUSE_EQUIPMENT}
            query={query}
            onQuery={setQuery}
            department={department}
            onDepartment={setDepartment}
            role={role}
            onRole={setRole}
            status={status}
            onStatus={setStatus}
            departments={DEPARTMENTS}
            roles={ROLES}
            tab={tab}
            onTab={setTab}
            selection={selection}
            now={now}
            startNodeId={startNodeId}
            onStartNode={setStartNodeId}
            onSelectEmployee={selectEmployee}
            onSelectZone={selectZone}
            onSelectEquipment={selectEquipment}
            onNearestAvailable={nearestAvailable}
            onAddEmployee={openCreate}
            onEditEmployee={openEdit}
          />
        </div>
      </div>

      <div className="hidden shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-1.5 text-[9px] text-[var(--muted-soft)] lg:flex">
        <span className="flex items-center gap-1.5">
          <IconUsers className="h-3 w-3" />
          Панель администратора: сотрудники, зоны и техника. Позиции симулируются.
        </span>
        <span>
          Изменения хранятся только в этом браузере · {new Date(now).toLocaleDateString('ru-RU')}
        </span>
      </div>

      {selection ? (
        <>
          <button
            type="button"
            onClick={clearSelection}
            className="fixed inset-0 z-40 bg-[#160b20]/45 backdrop-blur-[1px] xl:hidden"
            aria-label="Закрыть карточку"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-hidden rounded-t-2xl border-t border-[var(--line)] bg-[var(--surface)] shadow-2xl xl:hidden">
            <Inspector
              selection={selection}
              employee={employee}
              zone={zone}
              equipment={equipment}
              employees={employees}
              route={route}
              startNodeId={startNodeId}
              mode="admin"
              now={now}
              canDelete={Boolean(employee && !BASE_IDS.has(employee.id))}
              onSelectEmployee={selectEmployee}
              onSelectZone={selectZone}
              onBuildRoute={buildRoute}
              onClearRoute={() => setRoute(null)}
              onClose={clearSelection}
              onEditEmployee={openEdit}
              onDeactivateEmployee={deactivateEmployee}
              onDeleteEmployee={removeEmployee}
            />
          </div>
        </>
      ) : null}

      {formOpen ? (
        <EmployeeFormModal
          key={editing?.id ?? 'new'}
          initial={editing}
          onSave={saveEmployee}
          onClose={closeForm}
        />
      ) : null}
    </div>
  );
}
