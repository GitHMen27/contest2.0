// types/operations.ts

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'new' | 'in_progress' | 'resolved';
export type IncidentCategory = 'hub' | 'warehouse' | 'transport' | 'staff' | 'equipment' | 'sla';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'new' | 'in_progress' | 'blocked' | 'done';

export type OpsSource = 'demo' | 'user' | 'ai' | 'simulation' | 'live';

export type OpsEventType =
  | 'trip'
  | 'hub'
  | 'incident'
  | 'task'
  | 'equipment'
  | 'employee'
  | 'ai'
  | 'simulation'
  | 'system';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  category: IncidentCategory;
  hubId: string;
  zoneId?: string;
  equipmentId?: string;
  owner: string;
  ownerId?: string;
  source: OpsSource;
  recommendation?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskHistoryEntry {
  at: number;
  status: TaskStatus;
  note: string;
  actor: string;
}

export interface WarehouseTask {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  zoneId: string;
  equipmentId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: number;
  createdAt: number;
  updatedAt: number;
  source: OpsSource;
  history: TaskHistoryEntry[];
}

export interface OpsEvent {
  id: string;
  type: OpsEventType;
  title: string;
  detail: string;
  at: number;
  severity?: IncidentSeverity | 'info';
  source: OpsSource;
  hubId?: string;
  zoneId?: string;
  actor?: string;
  auditId?: string;
}

export interface OperationsState {
  version: 1;
  incidents: Incident[];
  tasks: WarehouseTask[];
  events: OpsEvent[];
}

export type AiActionKind =
  | 'create_task'
  | 'create_incident'
  | 'assign_employee'
  | 'change_incident_status'
  | 'change_task_status';

/** Черновик действия от AI. Ничего не меняет до подтверждения администратора. */
export interface AiProposal {
  id: string;
  kind: AiActionKind;
  title: string;
  description: string;
  reason: string;
  summary: string;
  payload: Record<string, unknown>;
  requiresAdmin: boolean;
  /** Локальный анализ без бэкенда: карточку можно прочитать, но нельзя применить. */
  readOnly?: boolean;
}

export type AiProposalState = 'pending' | 'applying' | 'applied' | 'cancelled' | 'error';

export interface AiProposalView extends AiProposal {
  state?: AiProposalState;
  message?: string;
  auditId?: string;
}

export interface AiAssistResult {
  answer: string;
  findings: string[];
  proposals: AiProposal[];
  generatedAt: number;
  source: 'backend' | 'local';
}
