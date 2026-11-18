// lib/aiActions.ts
import { addIncident, addTask, recordEvent, updateIncident, updateTask } from '@/lib/operationsStore';
import type { AiProposal, IncidentCategory, IncidentSeverity, IncidentStatus, TaskPriority, TaskStatus } from '@/types/operations';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asPriority(value: unknown): TaskPriority {
  return value === 'urgent' || value === 'high' || value === 'low' || value === 'normal' ? value : 'normal';
}

function asIncidentSeverity(value: unknown): IncidentSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function asIncidentCategory(value: unknown): IncidentCategory {
  return value === 'hub' ||
    value === 'warehouse' ||
    value === 'transport' ||
    value === 'staff' ||
    value === 'equipment' ||
    value === 'sla'
    ? value
    : 'warehouse';
}

function asIncidentStatus(value: unknown): IncidentStatus | null {
  return value === 'new' || value === 'in_progress' || value === 'resolved' ? value : null;
}

function asTaskStatus(value: unknown): TaskStatus | null {
  return value === 'new' || value === 'in_progress' || value === 'blocked' || value === 'done' ? value : null;
}

export type ApplyProposalResult = { ok: true; detail: string } | { ok: false; message: string };

/**
 * Применяет уже подтверждённое сервером действие к локальному демо-состоянию.
 * Вызывать только после успешного /ai/action: иначе действие не будет в аудите.
 */
export function applyAiProposal(
  proposal: AiProposal,
  actor: string,
  auditId: string,
): ApplyProposalResult {
  if (proposal.readOnly) {
    return { ok: false, message: 'Локальный анализ доступен только для чтения.' };
  }
  const payload = proposal.payload;
  let detail = '';
  let hubId = 'shushary';
  let severity: IncidentSeverity | 'info' = 'info';

  if (proposal.kind === 'create_task') {
    const title = asString(payload.title, proposal.title);
    const zoneId = asString(payload.zoneId);
    if (!title || !zoneId) return { ok: false, message: 'В действии не хватает названия или зоны задачи.' };
    addTask({
      title,
      description: asString(payload.description, proposal.description),
      assigneeId: asString(payload.assigneeId),
      zoneId,
      equipmentId: asString(payload.equipmentId) || undefined,
      priority: asPriority(payload.priority),
      dueAt: asNumber(payload.dueAt, Date.now() + 2 * 3_600_000),
      source: 'ai',
      actor,
    });
    detail = `Создана задача «${title}».`;
  } else if (proposal.kind === 'create_incident') {
    const title = asString(payload.title, proposal.title);
    const description = asString(payload.description, proposal.description);
    if (!title || !description) return { ok: false, message: 'В действии не хватает описания инцидента.' };
    hubId = asString(payload.hubId, 'shushary');
    severity = asIncidentSeverity(payload.severity);
    addIncident({
      title,
      description,
      severity,
      category: asIncidentCategory(payload.category),
      hubId,
      zoneId: asString(payload.zoneId) || undefined,
      equipmentId: asString(payload.equipmentId) || undefined,
      owner: asString(payload.owner, actor),
      recommendation: asString(payload.recommendation) || undefined,
      source: 'ai',
      actor,
    });
    detail = `Создан инцидент «${title}».`;
  } else if (proposal.kind === 'assign_employee') {
    const taskId = asString(payload.taskId);
    const assigneeId = asString(payload.assigneeId);
    if (!taskId || !assigneeId) return { ok: false, message: 'В действии не хватает задачи или исполнителя.' };
    updateTask(
      taskId,
      { assigneeId },
      actor,
      asString(payload.note, 'Исполнитель назначен по подтверждённому предложению AI.'),
      'ai',
    );
    detail = 'Исполнитель назначен на задачу.';
  } else if (proposal.kind === 'change_incident_status') {
    const incidentId = asString(payload.incidentId);
    const status = asIncidentStatus(payload.status);
    if (!incidentId || !status) return { ok: false, message: 'В действии не хватает инцидента или статуса.' };
    updateIncident(
      incidentId,
      {
        status,
        ...(status === 'in_progress' ? { owner: actor } : {}),
      },
      actor,
      'ai',
    );
    detail = `Статус инцидента изменён на «${status}».`;
  } else if (proposal.kind === 'change_task_status') {
    const taskId = asString(payload.taskId);
    const status = asTaskStatus(payload.status);
    if (!taskId || !status) return { ok: false, message: 'В действии не хватает задачи или статуса.' };
    updateTask(
      taskId,
      { status },
      actor,
      asString(payload.note, 'Статус изменён по подтверждённому предложению AI.'),
      'ai',
    );
    detail = `Статус задачи изменён на «${status}».`;
  } else {
    return { ok: false, message: 'Неизвестный тип действия.' };
  }

  recordEvent({
    type: 'ai',
    title: `AI-действие: ${proposal.title}`,
    detail: `${detail} Аудит: ${auditId.slice(0, 8)}.`,
    source: 'ai',
    actor,
    hubId,
    severity,
    auditId,
  });
  return { ok: true, detail };
}
