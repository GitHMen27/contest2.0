// lib/warehouseRouting.ts
import {
  METERS_PER_UNIT,
  WALK_SPEED_MPS,
  WAREHOUSE_EDGES,
  WAREHOUSE_GRAPH,
  ZONE_BY_ID,
} from '@/constants/warehouse';
import type { Point, RouteResult, SimulatedEmployee, WarehouseZone } from '@/types/warehouse';

interface Edge {
  to: string;
  cost: number;
}

const ADJACENCY = new Map<string, Edge[]>();

function addEdge(from: string, to: string) {
  const a = WAREHOUSE_GRAPH[from];
  const b = WAREHOUSE_GRAPH[to];
  if (!a || !b) return;
  const cost = Math.hypot(a.x - b.x, a.y - b.y);
  const list = ADJACENCY.get(from) ?? [];
  if (!list.some((edge) => edge.to === to)) list.push({ to, cost });
  ADJACENCY.set(from, list);
  const reverse = ADJACENCY.get(to) ?? [];
  if (!reverse.some((edge) => edge.to === from)) reverse.push({ to: from, cost });
  ADJACENCY.set(to, reverse);
}

WAREHOUSE_EDGES.forEach(([from, to]) => addEdge(from, to));

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointOfNode(id: string): Point {
  const node = WAREHOUSE_GRAPH[id];
  return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
}

export function zoneCenter(zoneId: string): Point {
  const zone = ZONE_BY_ID[zoneId];
  if (!zone) return { x: 0, y: 0 };
  return {
    x: zone.rect.x + zone.rect.width / 2,
    y: zone.rect.y + zone.rect.height / 2,
  };
}

/** A* по графу проходов. Граф небольшой, поэтому открытый список — массив. */
export function findGraphPath(startId: string, endId: string): string[] {
  if (!WAREHOUSE_GRAPH[startId] || !WAREHOUSE_GRAPH[endId]) return [];
  if (startId === endId) return [startId];

  const end = WAREHOUSE_GRAPH[endId];
  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([
    [startId, Math.hypot(WAREHOUSE_GRAPH[startId].x - end.x, WAREHOUSE_GRAPH[startId].y - end.y)],
  ]);

  while (open.size > 0) {
    let current = '';
    let best = Number.POSITIVE_INFINITY;
    for (const id of open) {
      const score = fScore.get(id) ?? Number.POSITIVE_INFINITY;
      if (score < best) {
        best = score;
        current = id;
      }
    }

    if (!current) break;
    if (current === endId) {
      const path = [current];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(cursor);
      }
      return path;
    }

    open.delete(current);
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;

    for (const edge of ADJACENCY.get(current) ?? []) {
      const tentative = currentG + edge.cost;
      if (tentative < (gScore.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        const node = WAREHOUSE_GRAPH[edge.to];
        fScore.set(edge.to, tentative + Math.hypot(node.x - end.x, node.y - end.y));
        open.add(edge.to);
      }
    }
  }

  return [];
}

function pushPoint(points: Point[], point: Point) {
  const last = points[points.length - 1];
  if (last && distance(last, point) < 0.5) return;
  points.push(point);
}

export interface PatrolPath {
  points: Point[];
  stopIndices: number[];
  stopZoneIds: string[];
}

/**
 * Собирает замкнутый маршрут обхода по зонам. Между дверями зон сотрудник
 * идёт строго по графу проходов, внутри зоны — по прямой к центру.
 */
export function buildPatrolPath(zoneIds: string[]): PatrolPath {
  const validZones = zoneIds.filter((id) => ZONE_BY_ID[id]);
  const points: Point[] = [];
  const stopIndices: number[] = [];
  const stopZoneIds: string[] = [];

  if (validZones.length === 0) return { points, stopIndices, stopZoneIds };

  pushPoint(points, zoneCenter(validZones[0]));
  stopIndices.push(points.length - 1);
  stopZoneIds.push(validZones[0]);

  for (let index = 0; index < validZones.length; index += 1) {
    const current = validZones[index];
    const next = validZones[(index + 1) % validZones.length];
    if (current === next) continue;

    const currentAccess = ZONE_BY_ID[current].accessNodeId;
    const nextAccess = ZONE_BY_ID[next].accessNodeId;
    pushPoint(points, pointOfNode(currentAccess));
    const path = findGraphPath(currentAccess, nextAccess);
    path.slice(1).forEach((nodeId) => pushPoint(points, pointOfNode(nodeId)));
    pushPoint(points, zoneCenter(next));
    stopIndices.push(points.length - 1);
    stopZoneIds.push(next);
  }

  return { points, stopIndices, stopZoneIds };
}

export function nearestGraphNode(point: Point): string {
  let nearest = 'entrance';
  let best = Number.POSITIVE_INFINITY;
  for (const node of Object.values(WAREHOUSE_GRAPH)) {
    const d = Math.hypot(node.x - point.x, node.y - point.y);
    if (d < best) {
      best = d;
      nearest = node.id;
    }
  }
  return nearest;
}

function makeRoute(
  startId: string,
  targetAccessId: string,
  targetPoint: Point,
  targetLabel: string,
): RouteResult {
  const startNode = WAREHOUSE_GRAPH[startId] ?? WAREHOUSE_GRAPH.entrance;
  const path = findGraphPath(startNode.id, targetAccessId);
  const points: Point[] = path.length > 0 ? path.map(pointOfNode) : [pointOfNode(startNode.id)];
  pushPoint(points, targetPoint);

  let units = 0;
  for (let index = 1; index < points.length; index += 1) {
    units += distance(points[index - 1], points[index]);
  }

  const distanceMeters = Math.max(1, Math.round(units * METERS_PER_UNIT));
  return {
    points,
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(distanceMeters / WALK_SPEED_MPS / 60)),
    fromLabel: WAREHOUSE_GRAPH[startNode.id]?.label ?? 'Старт',
    toLabel: targetLabel,
    startLabel: WAREHOUSE_GRAPH[startNode.id]?.label ?? 'Старт',
  };
}

export function buildRouteToZone(startNodeId: string, zone: WarehouseZone): RouteResult {
  return makeRoute(startNodeId, zone.accessNodeId, zoneCenter(zone.id), zone.name);
}

export function buildRouteToEmployee(
  startNodeId: string,
  employee: SimulatedEmployee,
): RouteResult {
  const accessId = nearestGraphNode(employee.location);
  return makeRoute(
    startNodeId,
    accessId,
    employee.location,
    `${employee.firstName} ${employee.lastName}`,
  );
}

export function buildRouteToPoint(startNodeId: string, point: Point, label: string): RouteResult {
  return makeRoute(startNodeId, nearestGraphNode(point), point, label);
}

export function findNearestAvailableEmployee(
  employees: SimulatedEmployee[],
  startNodeId: string,
): { employee: SimulatedEmployee; route: RouteResult } | null {
  let result: { employee: SimulatedEmployee; route: RouteResult } | null = null;
  for (const employee of employees) {
    if (employee.status !== 'available') continue;
    const route = buildRouteToEmployee(startNodeId, employee);
    if (!result || route.distanceMeters < result.route.distanceMeters) {
      result = { employee, route };
    }
  }
  return result;
}

export function routeToSvgPoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}
