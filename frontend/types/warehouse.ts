// types/warehouse.ts

export type EmployeeStatus = 'working' | 'busy' | 'available' | 'break' | 'offline';

export type ZoneTone = 'amber' | 'teal' | 'blue' | 'violet' | 'green' | 'rose' | 'slate';

export type ZoneStatus = 'active' | 'warning' | 'closed';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WarehouseZone {
  id: string;
  name: string;
  shortName: string;
  purpose: string;
  state: string;
  status: ZoneStatus;
  areaM2: number;
  load: number;
  tone: ZoneTone;
  icon: string;
  rect: Rect;
  accessNodeId: string;
  responsibleIds: string[];
}

/**
 * Базовая карточка сотрудника. Координаты и статус на карте приходят из
 * источника позиционирования (сейчас — детерминированная демо-симуляция).
 */
export interface WarehouseEmployee {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  role: string;
  department: string;
  zoneId: string;
  status: EmployeeStatus;
  task: string;
  responsibilities: string[];
  contact?: string;
  avatarTone?: ZoneTone;
  online?: boolean;
  /** Маршрут обхода зон для демо-симуляции. */
  patrol?: string[];
  /** Изменён или добавлен администратором: позиция фиксируется в зоне. */
  manual?: boolean;
  updatedAt?: number;
}

export interface EmployeeHistoryEntry {
  zoneId: string;
  at: number;
}

export interface SimulatedEmployee extends WarehouseEmployee {
  currentZoneId: string;
  /** Координаты маркера на карте (не путать с position — должностью). */
  location: Point;
  lastUpdate: number;
  history: EmployeeHistoryEntry[];
  isSimulated: boolean;
  moving?: boolean;
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface RouteResult {
  points: Point[];
  distanceMeters: number;
  durationMinutes: number;
  fromLabel: string;
  toLabel: string;
  startLabel?: string;
}

/**
 * Контракт источника позиционирования. Демо-реализация находится в
 * lib/warehouseSimulation.ts. Для BLE/UWB достаточно заменить провайдера,
 * который отдаёт те же EmployeePosition.
 */
export interface EmployeePosition {
  employeeId: string;
  x: number;
  y: number;
  zoneId: string;
  status: EmployeeStatus;
  updatedAt: number;
}

export interface PositionProvider {
  id: 'demo' | 'ble' | 'uwb' | 'mobile';
  label: string;
  subscribe: (listener: (positions: EmployeePosition[]) => void) => () => void;
}

export type EquipmentKind = 'forklift' | 'truck' | 'pallet' | 'gate';

export type EquipmentStatus = 'active' | 'idle' | 'loading' | 'maintenance';

/** Единица техники или груз на карте. Демо-данные, не телеметрия. */
export interface WarehouseEquipment {
  id: string;
  name: string;
  kind: EquipmentKind;
  zoneId: string;
  status: EquipmentStatus;
  task: string;
  location: Point;
}

export interface WarehouseInfo {
  id: string;
  name: string;
  shortName: string;
  city: string;
  address: string;
  phone: string;
  hours: string;
  areaM2: number;
  docks: number;
  shift: string;
  isOpen: boolean;
}

export type WarehouseSelection = { kind: 'employee' | 'zone' | 'equipment'; id: string } | null;
