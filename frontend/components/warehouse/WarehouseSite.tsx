'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DEPARTMENTS,
  ROLES,
  WAREHOUSE_EQUIPMENT,
  ZONE_BY_ID,
  ZONES,
} from '@/constants/warehouse';
import { useNow } from '@/lib/useNow';
import { useWarehouseOverrides } from '@/lib/warehouseStore';
import { mergeEmployees } from '@/lib/warehouseSimulation';
import { matchesEmployee } from '@/lib/warehouseFormat';
import {
  buildRouteToEmployee,
  buildRouteToPoint,
  buildRouteToZone,
  findNearestAvailableEmployee,
} from '@/lib/warehouseRouting';
import type { RouteResult, WarehouseSelection } from '@/types/warehouse';
import { WarehouseHeader } from '@/components/warehouse/WarehouseHeader';
import { WarehouseMap } from '@/components/warehouse/WarehouseMap';
import { WarehouseMap3D } from '@/components/warehouse/WarehouseMap3D';
import { WarehouseViewToggle, type WarehouseView } from '@/components/warehouse/WarehouseViewToggle';
import { WarehouseSidebar, type WarehouseTab } from '@/components/warehouse/WarehouseSidebar';
import { Inspector } from '@/components/warehouse/Inspector';
import { IconClose, IconRoute } from '@/components/warehouse/icons';

export function WarehouseSite() {
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
  // По умолчанию показываем объёмную 3D-схему; 2D остаётся как привычный вид сверху.
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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)] text-[var(--text)] lg:h-[100dvh] lg:overflow-hidden">
      <WarehouseHeader mode="client" now={now} />

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_352px]">
        <aside className="hidden min-h-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
          <WarehouseSidebar
            mode="client"
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
            onAddEmployee={() => undefined}
            onEditEmployee={() => undefined}
          />
        </aside>

        <main className="relative h-[54vh] min-h-[380px] w-full shrink-0 border-b border-[var(--line)] lg:h-auto lg:min-h-0 lg:border-b-0">
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
            mode="client"
            now={now}
            canDelete={false}
            onSelectEmployee={selectEmployee}
            onSelectZone={selectZone}
            onBuildRoute={buildRoute}
            onClearRoute={() => setRoute(null)}
            onClose={clearSelection}
            onEditEmployee={() => undefined}
            onDeactivateEmployee={() => undefined}
            onDeleteEmployee={() => undefined}
          />
        </aside>

        <div className="border-t border-[var(--line)] bg-[var(--surface)] lg:hidden">
          <WarehouseSidebar
            mode="client"
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
            onAddEmployee={() => undefined}
            onEditEmployee={() => undefined}
          />
        </div>
      </div>

      {selection ? (
        <>
          <button
            type="button"
            onClick={clearSelection}
            className="fixed inset-0 z-40 bg-[#160b20]/45 backdrop-blur-[1px] xl:hidden"
            aria-label="Закрыть карточку"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[76vh] overflow-hidden rounded-t-2xl border-t border-[var(--line)] bg-[var(--surface)] shadow-2xl xl:hidden">
            <Inspector
              selection={selection}
              employee={employee}
              zone={zone}
              equipment={equipment}
              employees={employees}
              route={route}
              startNodeId={startNodeId}
              mode="client"
              now={now}
              canDelete={false}
              onSelectEmployee={selectEmployee}
              onSelectZone={selectZone}
              onBuildRoute={buildRoute}
              onClearRoute={() => setRoute(null)}
              onClose={clearSelection}
              onEditEmployee={() => undefined}
              onDeactivateEmployee={() => undefined}
              onDeleteEmployee={() => undefined}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
