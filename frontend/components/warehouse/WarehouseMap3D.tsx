'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  EMPLOYEE_STATUS_META,
  EQUIPMENT_STATUS_META,
  MAP_HEIGHT,
  MAP_WIDTH,
  WAREHOUSE_EQUIPMENT,
  ZONES,
  ZONE_TONES,
} from '@/constants/warehouse';
import { initials } from '@/lib/warehouseFormat';
import type {
  EquipmentKind,
  Point,
  RouteResult,
  SimulatedEmployee,
  WarehouseSelection,
  WarehouseZone,
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

/**
 * 3D-схема РЦ Шушары: те же зоны, сотрудники, техника и маршруты, что на 2D-карте,
 * но в изометрической проекции с объёмными зонами. Без сторонних 3D-библиотек: чистый SVG.
 *
 * Проекция: мировые координаты склада (x, y в системе 2D-карты) переводятся в экран формулами
 *   sx = (x - y) * cos30,  sy = (x + y) * sin30 - z.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const PAD = 40;
const PAD_TOP = 90;
const OFFSET_X = MAP_HEIGHT * COS + PAD;
const OFFSET_Y = PAD_TOP;
const VIEW_W = (MAP_WIDTH + MAP_HEIGHT) * COS + PAD * 2;
const VIEW_H = (MAP_WIDTH + MAP_HEIGHT) * SIN + PAD_TOP + PAD;

function project(x: number, y: number, z = 0): Point {
  return { x: (x - y) * COS + OFFSET_X, y: (x + y) * SIN - z + OFFSET_Y };
}

function poly(points: [number, number, number][]): string {
  return points
    .map(([x, y, z]) => {
      const p = project(x, y, z);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

/** Высота «здания» зоны в условных единицах: чем выше, тем крупнее объём на схеме. */
const ZONE_HEIGHT: Record<string, number> = {
  corridors: 0,
  parking: 2,
  docks: 8,
  'storage-a': 30,
  'storage-b': 30,
  receiving: 20,
  shipping: 20,
  picking: 22,
  qc: 18,
  office: 26,
  docs: 16,
};

function zoneHeight(zoneId: string): number {
  return ZONE_HEIGHT[zoneId] ?? 18;
}

/** Высота крыши в точке (x, y): на ней «стоят» маркеры сотрудников и техники. */
function heightAt(x: number, y: number): number {
  for (const zone of ZONES) {
    if (zone.id === 'corridors') continue;
    const r = zone.rect;
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return zoneHeight(zone.id);
  }
  return 0;
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
    x: Math.min(0, Math.max(-VIEW_W * (k - 1), view.x)),
    y: Math.min(0, Math.max(-VIEW_H * (k - 1), view.y)),
  };
}

const EQUIPMENT_ICONS: Record<EquipmentKind, typeof IconForklift> = {
  forklift: IconForklift,
  truck: IconTruck,
  pallet: IconPallet,
  gate: IconGate,
};

interface IsoBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  height: number;
  color: string;
  topFill: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  dashed?: boolean;
  topClassName?: string;
}

/** Параллелепипед: две видимые боковые грани и крыша. */
function IsoBox({
  x,
  y,
  w,
  h,
  z,
  height,
  color,
  topFill,
  strokeOpacity = 0.5,
  strokeWidth = 1.3,
  dashed = false,
  topClassName,
}: IsoBoxProps) {
  const x2 = x + w;
  const y2 = y + h;
  const top = z + height;
  const front = poly([[x, y2, z], [x2, y2, z], [x2, y2, top], [x, y2, top]]);
  const side = poly([[x2, y, z], [x2, y2, z], [x2, y2, top], [x2, y, top]]);
  const roof = poly([[x, y, top], [x2, y, top], [x2, y2, top], [x, y2, top]]);

  return (
    <g strokeLinejoin="round">
      {height > 0 ? (
        <>
          <polygon points={front} fill="var(--surface-muted)" />
          <polygon points={front} fill={color} fillOpacity={0.3} stroke={color} strokeOpacity={0.35} strokeWidth={1} />
          <polygon points={side} fill="var(--surface-muted)" />
          <polygon points={side} fill={color} fillOpacity={0.5} stroke={color} strokeOpacity={0.35} strokeWidth={1} />
        </>
      ) : null}
      <polygon points={roof} fill="var(--surface)" />
      <polygon
        className={topClassName}
        points={roof}
        fill={topFill}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? '7 6' : undefined}
      />
    </g>
  );
}

/** Стеллажи на крыше складских зон: придают схеме объём. */
function Racks({ zone, color }: { zone: WarehouseZone; color: string }) {
  if (zone.id !== 'storage-a' && zone.id !== 'storage-b') return null;
  const { rect } = zone;
  const base = zoneHeight(zone.id);
  const columns = Math.floor((rect.width - 32) / 52);
  const depth = rect.height - 116;
  if (columns <= 0 || depth <= 0) return null;

  return (
    <g>
      {Array.from({ length: columns }, (_, index) => (
        <IsoBox
          key={index}
          x={rect.x + 18 + index * 52}
          y={rect.y + 74}
          w={30}
          h={depth}
          z={base}
          height={14}
          color={color}
          topFill="var(--surface-soft)"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

interface WarehouseMap3DProps {
  employees: SimulatedEmployee[];
  selected: WarehouseSelection;
  focusIds: Set<string> | null;
  route: RouteResult | null;
  onSelectZone: (id: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectEquipment: (id: string) => void;
}

export function WarehouseMap3D({
  employees,
  selected,
  focusIds,
  route,
  onSelectZone,
  onSelectEmployee,
  onSelectEquipment,
}: WarehouseMap3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; view: ViewState } | null>(null);
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
    const p = project(employee.location.x, employee.location.y, heightAt(employee.location.x, employee.location.y));
    setView(clampView({ k, x: VIEW_W / 2 - p.x * k, y: VIEW_H / 2 - p.y * k }));
  }, [selected]);

  const zoomAt = useCallback((nextK: number, anchorX = VIEW_W / 2, anchorY = VIEW_H / 2) => {
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
    dragRef.current = { startX: event.clientX, startY: event.clientY, view: viewRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // viewBox вписывается в окно с сохранением пропорций: единиц схемы на пиксель берём по более тесной стороне.
    const scale = Math.max(VIEW_W / bounds.width, VIEW_H / bounds.height);
    const dx = (event.clientX - drag.startX) * scale;
    const dy = (event.clientY - drag.startY) * scale;
    if (Math.hypot(dx, dy) > 4) movedRef.current = true;
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

  const { corridors, buildings } = useMemo(() => {
    const flat = ZONES.filter((zone) => zone.id === 'corridors');
    const solid = ZONES.filter((zone) => zone.id !== 'corridors').sort(
      (a, b) =>
        a.rect.x + a.rect.width + a.rect.y + a.rect.height - (b.rect.x + b.rect.width + b.rect.y + b.rect.height),
    );
    return { corridors: flat, buildings: solid };
  }, []);

  const sortedEquipment = useMemo(
    () => [...WAREHOUSE_EQUIPMENT].sort((a, b) => a.location.x + a.location.y - (b.location.x + b.location.y)),
    [],
  );

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.location.x + a.location.y - (b.location.x + b.location.y)),
    [employees],
  );

  const routePoints = useMemo(() => {
    if (!route) return null;
    return route.points.map((point) => project(point.x, point.y, heightAt(point.x, point.y) + 1));
  }, [route]);

  const gridLines = useMemo(() => {
    const lines: { key: string; d: string }[] = [];
    for (let x = 100; x < 1176; x += 100) {
      const a = project(x, 18, 0);
      const b = project(x, 782, 0);
      lines.push({ key: `x${x}`, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` });
    }
    for (let y = 118; y < 782; y += 100) {
      const a = project(24, y, 0);
      const b = project(1176, y, 0);
      lines.push({ key: `y${y}`, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` });
    }
    return lines;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]"
      style={{ touchAction: 'none' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ fontFamily: 'inherit' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label="Объёмная 3D-схема распределительного центра Шушары"
      >
        <rect width={VIEW_W} height={VIEW_H} fill="var(--surface-muted)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* Основание комплекса */}
          <IsoBox
            x={24}
            y={18}
            w={1152}
            h={764}
            z={-10}
            height={10}
            color="var(--line-strong)"
            topFill="var(--surface)"
            strokeOpacity={0.9}
            strokeWidth={2}
          />
          <g fill="none" stroke="var(--line-soft)" strokeWidth={1} pointerEvents="none">
            {gridLines.map((line) => (
              <path key={line.key} d={line.d} />
            ))}
          </g>

          {/* Проходы лежат на земле */}
          {corridors.map((zone) => {
            const tone = ZONE_TONES[zone.tone];
            const isSelected = selected?.kind === 'zone' && selected.id === zone.id;
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
                <IsoBox
                  x={zone.rect.x}
                  y={zone.rect.y}
                  w={zone.rect.width}
                  h={zone.rect.height}
                  z={0}
                  height={0}
                  color={tone.color}
                  topFill={tone.fill}
                  strokeOpacity={isSelected ? 0.95 : 0.4}
                  strokeWidth={isSelected ? 2.6 : 1}
                  topClassName="zone-shape"
                />
              </g>
            );
          })}

          {/* Объёмные зоны: дальние рисуются раньше ближних */}
          {buildings.map((zone) => {
            const tone = ZONE_TONES[zone.tone];
            const isSelected = selected?.kind === 'zone' && selected.id === zone.id;
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
                <IsoBox
                  x={zone.rect.x}
                  y={zone.rect.y}
                  w={zone.rect.width}
                  h={zone.rect.height}
                  z={0}
                  height={zoneHeight(zone.id)}
                  color={tone.color}
                  topFill={tone.fill}
                  strokeOpacity={isSelected ? 0.95 : 0.5}
                  strokeWidth={isSelected ? 2.6 : 1.3}
                  dashed={zone.status === 'closed'}
                  topClassName="zone-shape"
                />
                <Racks zone={zone} color={tone.color} />
              </g>
            );
          })}

          {/* Подписи зон поверх всех объёмов */}
          <g pointerEvents="none">
            {buildings.map((zone) => {
              const labelPoint = project(zone.rect.x + zone.rect.width / 2, zone.rect.y + 30, zoneHeight(zone.id) + 1);
              const statusText =
                zone.status === 'warning' ? 'высокая нагрузка' : zone.status === 'closed' ? 'закрыто' : 'работает';
              const showLoad = zone.id !== 'office' && zone.id !== 'docs' && zone.id !== 'parking';
              return (
                <g key={zone.id}>
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    fontSize={zone.rect.width < 220 ? 11 : 12.5}
                    fontWeight={600}
                    fill="var(--text)"
                    stroke="var(--surface)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                  >
                    {zone.shortName}
                  </text>
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--muted)"
                    stroke="var(--surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {showLoad ? `${statusText} · ${zone.load}%` : statusText}
                  </text>
                </g>
              );
            })}
          </g>

          {routePoints ? (
            <g pointerEvents="none">
              <polyline
                points={routePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke="var(--priority)"
                strokeWidth={13}
                strokeOpacity={0.14}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={routePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke="var(--priority)"
                strokeWidth={4}
                strokeDasharray="11 8"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="route-line-priority"
              />
              {routePoints.length > 0 ? (
                <>
                  <circle
                    cx={routePoints[0].x}
                    cy={routePoints[0].y}
                    r={6}
                    fill="var(--surface)"
                    stroke="var(--priority)"
                    strokeWidth={2.5}
                  />
                  <circle
                    cx={routePoints[routePoints.length - 1].x}
                    cy={routePoints[routePoints.length - 1].y}
                    r={7}
                    fill="var(--priority)"
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </g>
          ) : null}

          {sortedEquipment.map((item) => {
            const isSelected = selected?.kind === 'equipment' && selected.id === item.id;
            const Icon = EQUIPMENT_ICONS[item.kind];
            const meta = EQUIPMENT_STATUS_META[item.status];
            const p = project(item.location.x, item.location.y, heightAt(item.location.x, item.location.y));
            return (
              <g
                key={item.id}
                transform={`translate(${p.x} ${p.y})`}
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
                <ellipse cx={0} cy={0} rx={10} ry={4.5} fill="#000" opacity={0.18} />
                <line x1={0} y1={0} x2={0} y2={-9} stroke={meta.color} strokeWidth={1.6} />
                <g transform="translate(0 -22)">
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
              </g>
            );
          })}

          {sortedEmployees.map((employee) => {
            const statusMeta = EMPLOYEE_STATUS_META[employee.status];
            const tone = ZONE_TONES[employee.avatarTone ?? 'slate'];
            const isSelected = selected?.kind === 'employee' && selected.id === employee.id;
            const dimmed = focusIds !== null && !focusIds.has(employee.id) && !isSelected;
            const offline = employee.status === 'offline';
            const p = project(
              employee.location.x,
              employee.location.y,
              heightAt(employee.location.x, employee.location.y),
            );

            return (
              <g
                key={employee.id}
                transform={`translate(${p.x} ${p.y})`}
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
                <ellipse cx={0} cy={0} rx={9} ry={4} fill="#000" opacity={0.2} />
                <line x1={0} y1={0} x2={0} y2={-10} stroke={statusMeta.color} strokeWidth={1.6} />
                <g transform="translate(0 -22)">
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
                      y={-20}
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
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-14 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-1 text-[9px] font-medium text-[var(--muted)] shadow-sm backdrop-blur">
          3D-схема · изометрия
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
