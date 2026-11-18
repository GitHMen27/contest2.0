// lib/operationsSnapshot.ts
import { BASE_EMPLOYEES, WAREHOUSE_EQUIPMENT, ZONES } from '@/constants/warehouse';
import { HUBS } from '@/constants/hubs';
import type { OpsEvent, Incident, WarehouseTask } from '@/types/operations';
import type { SimulatedEmployee } from '@/types/warehouse';

/**
 * Компактный снимок для AI-анализа. В нём нет координат и тяжёлых деталей,
 * только то, что нужно для выводов: загрузка, статусы, инциденты и задачи.
 */
export interface OperationsSnapshot {
  generatedAt: number;
  hubs: Array<{
    id: string;
    name: string;
    city: string;
    load: number;
    status: string;
  }>;
  zones: Array<{
    id: string;
    name: string;
    shortName: string;
    load: number;
    status: string;
    responsibleIds: string[];
  }>;
  employees: Array<{
    id: string;
    name: string;
    position: string;
    status: string;
    zoneId: string;
    department: string;
  }>;
  equipment: Array<{
    id: string;
    name: string;
    kind: string;
    status: string;
    zoneId: string;
    task: string;
    fault?: string;
    idleHours?: number;
  }>;
  incidents: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    category: string;
    hubId: string;
    zoneId?: string;
    equipmentId?: string;
    owner: string;
    recommendation?: string;
    updatedAt: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string;
    zoneId: string;
    equipmentId?: string;
    dueAt: number;
    updatedAt: number;
  }>;
  events: Array<{
    type: string;
    title: string;
    detail: string;
    at: number;
    severity?: string;
  }>;
}

export function employeeFullName(employee: Pick<SimulatedEmployee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export function buildOperationsSnapshot(input: {
  incidents: Incident[];
  tasks: WarehouseTask[];
  events: OpsEvent[];
  employees?: SimulatedEmployee[];
  now?: number;
}): OperationsSnapshot {
  const employees = input.employees && input.employees.length > 0 ? input.employees : BASE_EMPLOYEES;
  return {
    generatedAt: input.now ?? Date.now(),
    hubs: HUBS.map((hub) => ({
      id: hub.id,
      name: hub.name,
      city: hub.city,
      load: hub.load,
      status: hub.status,
    })),
    zones: ZONES.filter((zone) => zone.id !== 'corridors').map((zone) => ({
      id: zone.id,
      name: zone.name,
      shortName: zone.shortName,
      load: zone.load,
      status: zone.status,
      responsibleIds: zone.responsibleIds,
    })),
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employeeFullName(employee),
      position: employee.position,
      status: employee.status,
      zoneId: employee.zoneId,
      department: employee.department,
    })),
    equipment: WAREHOUSE_EQUIPMENT.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      status: item.status,
      zoneId: item.zoneId,
      task: item.task,
      fault: item.fault,
      idleHours: item.idleHours,
    })),
    incidents: input.incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      category: incident.category,
      hubId: incident.hubId,
      zoneId: incident.zoneId,
      equipmentId: incident.equipmentId,
      owner: incident.owner,
      recommendation: incident.recommendation,
      updatedAt: incident.updatedAt,
    })),
    tasks: input.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      zoneId: task.zoneId,
      equipmentId: task.equipmentId,
      dueAt: task.dueAt,
      updatedAt: task.updatedAt,
    })),
    events: input.events.slice(0, 14).map((event) => ({
      type: event.type,
      title: event.title,
      detail: event.detail,
      at: event.at,
      severity: event.severity,
    })),
  };
}
