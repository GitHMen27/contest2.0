// lib/warehouseSimulation.ts
import {
  BASE_EMPLOYEES,
  EMPLOYEE_STATUS_META,
  SIM_DWELL_SECONDS,
  SIM_EPOCH,
  SIM_SPEED_UNITS_PER_SECOND,
  TASK_BY_ZONE,
  ZONE_BY_ID,
} from '@/constants/warehouse';
import { buildPatrolPath, distance, zoneCenter } from '@/lib/warehouseRouting';
import type {
  EmployeeStatus,
  SimulatedEmployee,
  WarehouseEmployee,
} from '@/types/warehouse';

interface TravelEntry {
  kind: 'travel';
  start: number;
  duration: number;
  fromIdx: number;
  toIdx: number;
  fromZoneId: string;
  toZoneId: string;
}

interface DwellEntry {
  kind: 'dwell';
  start: number;
  duration: number;
  stopIdx: number;
  zoneId: string;
  stopNumber: number;
}

type TimelineEntry = TravelEntry | DwellEntry;

interface PatrolPlan {
  points: ReturnType<typeof buildPatrolPath>['points'];
  timeline: TimelineEntry[];
  cycle: number;
}

const planCache = new Map<string, PatrolPlan>();

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_000;
  }
  return hash;
}

function offsetFor(employee: WarehouseEmployee): number {
  return (hashString(employee.id) % 420) + 15;
}

function statusPattern(employee: WarehouseEmployee): EmployeeStatus[] {
  if (employee.role === 'Администратор' || employee.role === 'Начальник смены') {
    return ['working', 'available', 'busy', 'available'];
  }
  if (employee.id === 'e-kuznetsova' || employee.id === 'e-novikov') {
    return ['working', 'break', 'available', 'working'];
  }
  return ['working', 'available', 'working', 'busy'];
}

function makePlan(employee: WarehouseEmployee): PatrolPlan | null {
  const patrol = employee.patrol?.filter((zoneId) => ZONE_BY_ID[zoneId]) ?? [];
  if (patrol.length === 0) return null;

  const key = `${employee.id}:${patrol.join('>')}`;
  const cached = planCache.get(key);
  if (cached) return cached;

  const { points, stopIndices, stopZoneIds } = buildPatrolPath(patrol);
  if (points.length === 0 || stopIndices.length === 0) return null;

  const timeline: TimelineEntry[] = [];
  let cursor = 0;

  timeline.push({
    kind: 'dwell',
    start: cursor,
    duration: SIM_DWELL_SECONDS,
    stopIdx: stopIndices[0],
    zoneId: stopZoneIds[0],
    stopNumber: 0,
  });
  cursor += SIM_DWELL_SECONDS;

  for (let stopNumber = 1; stopNumber < stopIndices.length; stopNumber += 1) {
    const fromIdx = stopIndices[stopNumber - 1];
    const toIdx = stopIndices[stopNumber];
    let units = 0;
    for (let index = fromIdx; index < toIdx; index += 1) {
      units += distance(points[index], points[index + 1]);
    }
    const duration = units / SIM_SPEED_UNITS_PER_SECOND;

    if (duration > 0.15) {
      timeline.push({
        kind: 'travel',
        start: cursor,
        duration,
        fromIdx,
        toIdx,
        fromZoneId: stopZoneIds[stopNumber - 1],
        toZoneId: stopZoneIds[stopNumber],
      });
      cursor += duration;
    }

    timeline.push({
      kind: 'dwell',
      start: cursor,
      duration: SIM_DWELL_SECONDS,
      stopIdx: toIdx,
      zoneId: stopZoneIds[stopNumber],
      stopNumber,
    });
    cursor += SIM_DWELL_SECONDS;
  }

  const plan: PatrolPlan = { points, timeline, cycle: Math.max(cursor, 1) };
  planCache.set(key, plan);
  return plan;
}

function interpolate(points: PatrolPlan['points'], fromIdx: number, toIdx: number, t: number) {
  let total = 0;
  for (let index = fromIdx; index < toIdx; index += 1) {
    total += distance(points[index], points[index + 1]);
  }
  let remaining = total * Math.min(1, Math.max(0, t));
  for (let index = fromIdx; index < toIdx; index += 1) {
    const segment = distance(points[index], points[index + 1]);
    if (remaining <= segment) {
      const ratio = segment === 0 ? 0 : remaining / segment;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    remaining -= segment;
  }
  return points[toIdx] ?? points[fromIdx];
}

function buildHistory(
  plan: PatrolPlan,
  now: number,
  phase: number,
  currentCycleStart: number,
): SimulatedEmployee['history'] {
  const dwells = plan.timeline.filter((entry): entry is DwellEntry => entry.kind === 'dwell');
  const entries: SimulatedEmployee['history'] = [];

  for (let cycleOffset = 0; cycleOffset <= 2; cycleOffset += 1) {
    const base = currentCycleStart - cycleOffset * plan.cycle;
    for (const dwell of dwells) {
      const at = base + dwell.start;
      if (at > now) continue;
      const secondsAgo = now - at;
      if (secondsAgo > 60 * 60 * 6) continue;
      entries.push({ zoneId: dwell.zoneId, at });
    }
  }

  entries.sort((a, b) => b.at - a.at);
  return entries.slice(0, 5);
}

function offlineEmployee(employee: WarehouseEmployee, now: number): SimulatedEmployee {
  const position = zoneCenter(employee.zoneId);
  return {
    ...employee,
    status: 'offline',
    currentZoneId: employee.zoneId,
    location: position,
    lastUpdate: 0,
    history: [],
    isSimulated: true,
    moving: false,
    task: 'Нет данных о текущем местоположении',
    updatedAt: now,
  };
}

export function simulateEmployee(employee: WarehouseEmployee, now: number): SimulatedEmployee {
  if (employee.online === false) return offlineEmployee(employee, now);

  const plan = makePlan(employee);
  if (!plan) return offlineEmployee(employee, now);

  const offset = offsetFor(employee);
  const absoluteSeconds = (now - SIM_EPOCH) / 1000 + offset;
  const phase = ((absoluteSeconds % plan.cycle) + plan.cycle) % plan.cycle;
  const currentCycleStart = now - phase * 1000;

  let entry: TimelineEntry | undefined =
    plan.timeline.find((item) => phase >= item.start && phase < item.start + item.duration) ??
    plan.timeline[plan.timeline.length - 1];

  if (!entry) return offlineEmployee(employee, now);

  // Защита от накопленной погрешности на границе цикла.
  if (phase >= plan.cycle - 0.02) {
    entry = plan.timeline[plan.timeline.length - 1];
  }

  const pattern = statusPattern(employee);
  const history = buildHistory(plan, now, phase, currentCycleStart);

  if (entry.kind === 'dwell') {
    const zoneId = entry.zoneId;
    const status = pattern[entry.stopNumber % pattern.length];
    const task =
      status === 'break'
        ? 'Перерыв · кофе-поинт'
        : TASK_BY_ZONE[zoneId] ?? employee.task;
    return {
      ...employee,
      status,
      task,
      currentZoneId: zoneId,
      location: plan.points[entry.stopIdx],
      lastUpdate: now - Math.max(0, phase - entry.start) * 1000,
      history,
      isSimulated: true,
      moving: false,
    };
  }

  const t = Math.min(1, Math.max(0, (phase - entry.start) / Math.max(entry.duration, 0.001)));
  const fromZone = ZONE_BY_ID[entry.fromZoneId];
  const toZone = ZONE_BY_ID[entry.toZoneId];
  return {
    ...employee,
    status: 'busy',
    task: `Перемещение: ${fromZone?.shortName ?? 'зона'} → ${toZone?.shortName ?? 'зона'}`,
    currentZoneId: entry.toZoneId,
    location: interpolate(plan.points, entry.fromIdx, entry.toIdx, t),
    lastUpdate: now,
    history,
    isSimulated: true,
    moving: true,
  };
}

function manualEmployee(
  employee: WarehouseEmployee,
  base: WarehouseEmployee | undefined,
  now: number,
): SimulatedEmployee {
  const zoneId = ZONE_BY_ID[employee.zoneId] ? employee.zoneId : base?.zoneId ?? 'office';
  return {
    ...(base ?? {}),
    ...employee,
    zoneId,
    currentZoneId: zoneId,
    location: zoneCenter(zoneId),
    lastUpdate: employee.updatedAt ?? now,
    history: [],
    status: employee.status ?? 'available',
    task: employee.task || TASK_BY_ZONE[zoneId] || 'Рабочая задача не указана',
    responsibilities: employee.responsibilities?.length
      ? employee.responsibilities
      : base?.responsibilities ?? [],
    isSimulated: false,
    moving: false,
    manual: true,
    online: employee.online ?? true,
    updatedAt: employee.updatedAt ?? now,
  };
}

export function mergeEmployees(now: number, overrides: WarehouseEmployee[]): SimulatedEmployee[] {
  const overridesById = new Map(overrides.map((employee) => [employee.id, employee]));
  const baseIds = new Set(BASE_EMPLOYEES.map((employee) => employee.id));

  const base = BASE_EMPLOYEES.map((employee) => {
    const override = overridesById.get(employee.id);
    if (override) return manualEmployee(override, employee, now);
    return simulateEmployee(employee, now);
  });

  const custom = overrides
    .filter((employee) => !baseIds.has(employee.id))
    .map((employee) => manualEmployee(employee, undefined, now));

  return [...base, ...custom];
}

export function sourceLabel(status: EmployeeStatus): string {
  return EMPLOYEE_STATUS_META[status].label;
}
