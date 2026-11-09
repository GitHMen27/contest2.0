'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  EMPLOYEE_STATUS_META,
  EQUIPMENT_STATUS_META,
  MAP_HEIGHT,
  MAP_WIDTH,
  WAREHOUSE_EQUIPMENT,
  WAREHOUSE_GRAPH,
  ZONES,
  ZONE_TONES,
} from '@/constants/warehouse';
import { initials } from '@/lib/warehouseFormat';
import { routeToSvgPoints } from '@/lib/warehouseRouting';
import type {
  EquipmentKind,
  RouteResult,
  SimulatedEmployee,
  WarehouseSelection,
} from '@/types/warehouse';
import {
  IconForklift,
  IconGate,
  IconPallet,
  IconTruck,
  IconZoomIn,
  IconZoomOut,
  IconTarget,
} from '@/components/warehouse/icons';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface WarehouseMapProps {
  employees: SimulatedEmployee[];
  selected: WarehouseSelection;
  focusIds: Set<string> | null;
  route: RouteResult | null;
  onSelectZone: (id: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectEquipment: (id: string) => void;
}

interface ViewState {
  x: number;
  y: number;
  k: number;
}

const INITIAL_VIEW: ViewState = { x: 0, y: 0, k: 1 };

function clampView(view: ViewState): ViewState {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k));
  return {
    k,
    x: Math.min(0, Math.max(-MAP_WIDTH * (k - 1), view.x)),
    y: Math.min(0, Math.max(-MAP_HEIGHT * (k - 1), view.y)),
  };
}

const EQUIPMENT_ICONS: Record<EquipmentKind, typeof IconForklift> = {
  forklift: IconForklift,
  truck: IconTruck,
  pallet: IconPallet,
  gate: IconGate,
};

function ZoneDecoration({ zoneId, rect, color }: { zoneId: string; rect: { x: number; y: number; width: number; height: number }; color: string }) {
  const common = { fill: 'none', stroke: color, strokeOpacity: 0.26, strokeWidth: 1.4 };

  if (zoneId === 'storage-a' || zoneId === 'storage-b') {
    const columns = Math.floor((rect.width - 32) / 52);
    return (
      <g>
        {Array.from({ length: columns }, (_, index) => (
          <rect
            key={index}
            x={rect.x + 18 + index * 52}
            y={rect.y + 74}
            width={30}
            height={rect.height - 116}
            rx={3}
            {...common}
          />
        ))}
      </g>
    );
  }

  if (zoneId === 'parking') {
    return (
      <g>
        {Array.from({ length: 4 }, (_, index) => (
          <rect
            key={index}
            x={rect.x + 18 + index * 58}
            y={rect.y + 64}
            width={44}
            height={28}
            rx={4}
            {...common}
          />
        ))}
        <path
          d={`M ${rect.x + 18} ${rect.y + rect.height - 42} H ${rect.x + rect.width - 18}`}
          stroke={color}
          strokeOpacity={0.2}
          strokeDasharray="8 8"
        />
      </g>
    );
  }

  if (zoneId === 'docks') {
    return (
      <g>
        {Array.from({ length: 4 }, (_, index) => (
          <rect
            key={index}
            x={rect.x + 20 + index * 58}
            y={rect.y + rect.height - 16}
            width={42}
            height={8}
            rx={2}
            fill={color}
            fillOpacity={0.3}
          />
        ))}
      </g>
    );
  }

  if (zoneId === 'receiving' || zoneId === 'shipping' || zoneId === 'picking') {
    return (
      <g>
        {Array.from({ length: 6 }, (_, index) => (
          <rect
            key={index}
            x={rect.x + 20 + (index % 3) * 46}
            y={rect.y + 76 + Math.floor(index / 3) * 42}
            width={32}
            height={26}
            rx={3}
            {...common}
          />
        ))}
      </g>
    );
  }

  if (zoneId === 'office' || zoneId === 'docs') {
    return (
      <g>
        {Array.from({ length: 4 }, (_, index) => (
          <rect
            key={index}
            x={rect.x + 26 + (index % 2) * 62}
            y={rect.y + 78 + Math.floor(index / 2) * 44}
            width={44}
            height={22}
            rx={4}
            {...common}
          />
        ))}
      </g>
    );
  }

  if (zoneId === 'qc') {
    return (
      <g>
        <path
          d={`M ${rect.x + 60} ${rect.y + 120} H ${rect.x + rect.width - 60}`}
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={2}
          strokeDasharray="3 5"
        />
        <circle cx={rect.x + rect.width / 2} cy={rect.y + 120} r={13} fill="none" stroke={color} strokeOpacity={0.3} />
      </g>
    );
  }

  return null;
}

export function WarehouseMap({
  employees,
  selected,
  focusIds,
  route,
  onSelectZone,
  onSelectEmployee,
  onSelectEquipment,
}: WarehouseMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; view: ViewState; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const employeesRef = useRef(employees);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const viewRef = useRef(view);

  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const selectedEmployee = useMemo(
    () => (selected?.kind === 'employee' ? employees.find((item) => item.id === selected.id) ?? null : null),
    [employees, selected],
  );

  // При выборе сотрудника показываем его участок крупнее.
  useEffect(() => {
    if (!selected || selected.kind !== 'employee') return;
    const employee = employeesRef.current.find((item) => item.id === selected.id);
    if (!employee) return;
    const k = 2;
    setView(
      clampView({
        k,
        x: MAP_WIDTH / 2 - employee.location.x * k,
        y: MAP_HEIGHT / 2 - employee.location.y * k,
      }),
    );
  }, [selected]);

  const zoomAt = useCallback((nextK: number, anchorX = MAP_WIDTH / 2, anchorY = MAP_HEIGHT / 2) => {
    setView((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextK));
      const ratio = k / current.k;
      return clampView({
        k,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio,
      });
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());
      const current = viewRef.current;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const ratio = k / current.k;
      setView(
        clampView({
          k,
          x: local.x - (local.x - current.x) * ratio,
          y: local.y - (local.y - current.y) * ratio,
        }),
      );
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-interactive="true"]')) return;
    movedRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      view: viewRef.current,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = MAP_WIDTH / bounds.width;
    const dx = (event.clientX - drag.startX) * scale;
    const dy = (event.clientY - drag.startY) * scale;
    if (Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      movedRef.current = true;
    }
    setView(clampView({ k: drag.view.k, x: drag.view.x + dx, y: drag.view.y + dy }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleZone = (id: string) => {
    if (movedRef.current) return;
    onSelectZone(id);
  };

  const handleEmployee = (id: string) => {
    if (movedRef.current) return;
    onSelectEmployee(id);
  };

  const handleEquipment = (id: string) => {
    if (movedRef.current) return;
    onSelectEquipment(id);
  };

  const orderedZones = useMemo(() => {
    const corridors = ZONES.filter((zone) => zone.id === 'corridors');
    const rest = ZONES.filter((zone) => zone.id !== 'corridors');
    return [...corridors, ...rest];
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]"
      style={{ touchAction: 'none' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ fontFamily: 'inherit' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label="Интерактивная схема распределительного центра Шушары"
      >
        <defs>
          <pattern id="warehouse-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--line-soft)" strokeWidth="1" />
          </pattern>
          <pattern id="warehouse-grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="var(--line)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="var(--surface-muted)" />
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#warehouse-grid)" opacity={0.7} />
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#warehouse-grid-major)" opacity={0.5} />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect
            x={24}
            y={18}
            width={1152}
            height={764}
            rx={10}
            fill="var(--surface)"
            stroke="var(--line-strong)"
            strokeWidth={3}
          />
          <rect
            x={31}
            y={25}
            width={1138}
            height={750}
            rx={7}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1}
            strokeDasharray="2 6"
          />
          <text x={42} y={46} fontSize={10} fill="var(--muted-soft)" letterSpacing="1.4">
            СКЛАДСКОЙ КОМПЛЕКС · 104 000 М² · 14 ДОКОВ
          </text>

          {orderedZones.map((zone) => {
            const tone = ZONE_TONES[zone.tone];
            const isSelected = selected?.kind === 'zone' && selected.id === zone.id;
            const isCorridor = zone.id === 'corridors';
            const rect = zone.rect;
            return (
              <g
                key={zone.id}
                role="button"
                tabIndex={0}
                data-interactive="true"
                className="warehouse-zone outline-none"
                onClick={() => handleZone(zone.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleZone(zone.id);
                  }
                }}
                aria-label={`${zone.name}. ${zone.state}`}
              >
                <rect
                  className="zone-shape"
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  rx={isCorridor ? 4 : 10}
                  fill={tone.fill}
                  stroke={tone.color}
                  strokeOpacity={isSelected ? 0.95 : 0.5}
                  strokeWidth={isSelected ? 2.6 : 1.3}
                  strokeDasharray={zone.status === 'closed' ? '7 6' : undefined}
                />
                {!isCorridor ? (
                  <>
                    <ZoneDecoration zoneId={zone.id} rect={rect} color={tone.color} />
                    <text
                      x={rect.x + 14}
                      y={rect.y + 26}
                      fontSize={rect.width < 220 ? 11 : 12.5}
                      fontWeight={600}
                      fill="var(--text)"
                    >
                      {zone.shortName}
                    </text>
                    <text
                      x={rect.x + 14}
                      y={rect.y + 41}
                      fontSize={9}
                      fill="var(--muted)"
                    >
                      {zone.status === 'warning' ? 'высокая нагрузка' : zone.status === 'closed' ? 'закрыто' : 'работает'}
                    </text>
                    {zone.id !== 'office' && zone.id !== 'docs' && zone.id !== 'parking' ? (
                      <>
                        <rect
                          x={rect.x + 14}
                          y={rect.y + rect.height - 22}
                          width={rect.width - 28}
                          height={4}
                          rx={2}
                          fill="var(--surface-muted)"
                        />
                        <rect
                          x={rect.x + 14}
                          y={rect.y + rect.height - 22}
                          width={((rect.width - 28) * zone.load) / 100}
                          height={4}
                          rx={2}
                          fill={tone.color}
                          fillOpacity={0.9}
                        />
                        <text
                          x={rect.x + rect.width - 14}
                          y={rect.y + rect.height - 27}
                          fontSize={9}
                          textAnchor="end"
                          fill="var(--muted)"
                        >
                          {zone.load}%
                        </text>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <path
                      d={`M ${rect.x + 14} ${rect.y + rect.height / 2} H ${rect.x + rect.width - 14}`}
                      stroke={tone.color}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      strokeDasharray="10 8"
                    />
                    <text x={rect.x + 14} y={rect.y + rect.height / 2 - 8} fontSize={8.5} fill="var(--muted)">
                      главный проход · 6 м
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {Object.values(WAREHOUSE_GRAPH).map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={2.6}
              fill="var(--line-strong)"
              opacity={0.7}
            />
          ))}

          {route ? (
            <g pointerEvents="none">
              <polyline
                points={routeToSvgPoints(route.points)}
                fill="none"
                stroke="var(--priority)"
                strokeWidth={13}
                strokeOpacity={0.14}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={routeToSvgPoints(route.points)}
                fill="none"
                stroke="var(--priority)"
                strokeWidth={4}
                strokeDasharray="11 8"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="route-line-priority"
              />
              {route.points.length > 0 ? (
                <>
                  <circle
                    cx={route.points[0].x}
                    cy={route.points[0].y}
                    r={6}
                    fill="var(--surface)"
                    stroke="var(--priority)"
                    strokeWidth={2.5}
                  />
                  <circle
                    cx={route.points[route.points.length - 1].x}
                    cy={route.points[route.points.length - 1].y}
                    r={7}
                    fill="var(--priority)"
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </g>
          ) : null}

          {WAREHOUSE_EQUIPMENT.map((item) => {
            const isSelected = selected?.kind === 'equipment' && selected.id === item.id;
            const Icon = EQUIPMENT_ICONS[item.kind];
            const meta = EQUIPMENT_STATUS_META[item.status];
            return (
              <g
                key={item.id}
                transform={`translate(${item.location.x} ${item.location.y})`}
                data-interactive="true"
                className="warehouse-equipment"
                onClick={() => handleEquipment(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleEquipment(item.id);
                  }
                }}
                aria-label={`${item.name}. ${meta.label}`}
              >
                <title>{`${item.name} · ${meta.label} · ${item.task}`}</title>
                {isSelected ? <circle r={19} fill="none" stroke="var(--accent)" strokeWidth={2} /> : null}
                <rect
                  x={-12}
                  y={-12}
                  width={24}
                  height={24}
                  rx={item.kind === 'truck' ? 7 : 5}
                  fill="var(--surface)"
                  stroke={meta.color}
                  strokeWidth={1.6}
                />
                <Icon x={-8} y={-8} width={16} height={16} style={{ color: meta.color }} />
                <circle cx={9} cy={-9} r={3.2} fill={meta.color} stroke="var(--surface)" strokeWidth={1.4} />
              </g>
            );
          })}

          {employees.map((employee) => {
            const statusMeta = EMPLOYEE_STATUS_META[employee.status];
            const tone = ZONE_TONES[employee.avatarTone ?? 'slate'];
            const isSelected = selected?.kind === 'employee' && selected.id === employee.id;
            const dimmed = focusIds !== null && !focusIds.has(employee.id) && !isSelected;
            const offline = employee.status === 'offline';

            return (
              <g
                key={employee.id}
                transform={`translate(${employee.location.x} ${employee.location.y})`}
                data-interactive="true"
                className="warehouse-employee"
                opacity={dimmed ? 0.24 : 1}
                onClick={() => handleEmployee(employee.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleEmployee(employee.id);
                  }
                }}
                aria-label={`${employee.firstName} ${employee.lastName}, ${employee.position}, ${statusMeta.label}`}
              >
                <title>{`${employee.firstName} ${employee.lastName} · ${employee.position} · ${employee.task}`}</title>
                {employee.moving ? (
                  <circle r={17} fill={statusMeta.color} opacity={0.14} className="warehouse-pulse" />
                ) : null}
                {isSelected ? (
                  <circle r={17} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
                ) : null}
                <circle
                  r={11.5}
                  fill="var(--surface)"
                  stroke={statusMeta.color}
                  strokeWidth={2.4}
                  strokeDasharray={offline ? '3 2.5' : undefined}
                />
                <circle r={8.4} fill={offline ? 'var(--surface-muted)' : tone.soft} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={7.6}
                  fontWeight={700}
                  fill={offline ? 'var(--muted-soft)' : tone.color}
                >
                  {initials(employee)}
                </text>
                <circle cx={8} cy={8} r={3} fill={statusMeta.color} stroke="var(--surface)" strokeWidth={1.2} />
                {isSelected ? (
                  <text
                    textAnchor="middle"
                    y={28}
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--text)"
                    stroke="var(--surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {employee.firstName} {employee.lastName}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-14 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-1 text-[9px] font-medium text-[var(--muted)] shadow-sm backdrop-blur">
          2D-схема · вид сверху
        </span>
        <span className="rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-1 text-[9px] text-[var(--muted-soft)] shadow-sm backdrop-blur">
          {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : 'масштаб и перемещение — мышью'}
        </span>
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)]/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => zoomAt(view.k * 1.25)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          aria-label="Приблизить карту"
        >
          <IconZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(view.k / 1.25)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          aria-label="Отдалить карту"
        >
          <IconZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView(INITIAL_VIEW)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          aria-label="Сбросить масштаб"
        >
          <IconTarget className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2.5 py-1.5 text-[9px] text-[var(--muted)] shadow-sm backdrop-blur sm:flex">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-[var(--surface)]" />
          сотрудник
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-[var(--muted-soft)] bg-[var(--surface)]" />
          техника
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-[var(--priority)]" />
          маршрут
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-1 text-[9px] tabular-nums text-[var(--muted-soft)] shadow-sm backdrop-blur">
        {Math.round(view.k * 100)}%
      </div>
    </div>
  );
}
