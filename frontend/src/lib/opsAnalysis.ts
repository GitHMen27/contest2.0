// lib/opsAnalysis.ts
import type { OperationsSnapshot } from '@/lib/operationsSnapshot';
import type { AiAssistResult, AiProposal } from '@/types/operations';

/**
 * Резервный локальный анализ, когда AI-бэкенд недоступен.
 * Он только читает демо-снимок. Предложения помечены readOnly и не могут быть применены.
 */
export function analyzeOperationsLocally(snapshot: OperationsSnapshot, question: string): AiAssistResult {
  const now = Date.now();
  const normalizedQuestion = question.toLowerCase();
  const openIncidents = snapshot.incidents.filter((incident) => incident.status !== 'resolved');
  const critical = openIncidents.filter((incident) => incident.severity === 'critical');
  const freeEmployees = snapshot.employees.filter((employee) => employee.status === 'available');
  const faulty = snapshot.equipment.filter((item) => item.fault || item.status === 'maintenance');
  const overloadedHubs = snapshot.hubs.filter((hub) => hub.load >= 85);
  const overloadedZones = snapshot.zones.filter((zone) => zone.load >= 85);
  const unassigned = snapshot.tasks.filter(
    (task) => task.status !== 'done' && task.assigneeId.length === 0,
  );
  const overdue = snapshot.tasks.filter((task) => task.status !== 'done' && task.dueAt < now);

  const findings: string[] = [
    `Открытых инцидентов: ${openIncidents.length}, критических: ${critical.length}.`,
    `Свободных сотрудников: ${freeEmployees.length}${
      freeEmployees.length > 0
        ? ` (${freeEmployees.slice(0, 3).map((employee) => employee.name).join(', ')})`
        : ''
    }.`,
  ];
  if (overloadedHubs.length > 0) {
    findings.push(
      `Перегружены РЦ: ${overloadedHubs
        .slice(0, 3)
        .map((hub) => `${hub.name} ${Math.round(hub.load)}%`)
        .join(', ')}.`,
    );
  }
  if (overloadedZones.length > 0) {
    findings.push(
      `Зоны выше 85%: ${overloadedZones
        .slice(0, 4)
        .map((zone) => `${zone.shortName} ${Math.round(zone.load)}%`)
        .join(', ')}.`,
    );
  }
  if (faulty.length > 0) {
    findings.push(`Требует внимания техника: ${faulty.slice(0, 3).map((item) => item.name).join(', ')}.`);
  }
  if (unassigned.length > 0) findings.push(`Задач без исполнителя: ${unassigned.length}.`);
  if (overdue.length > 0) findings.push(`Просроченных открытых задач: ${overdue.length}.`);
  if (normalizedQuestion.includes('свобод') && freeEmployees.length > 0) {
    findings.push(
      `Свободны: ${freeEmployees
        .slice(0, 5)
        .map((employee) => `${employee.name} (${employee.position})`)
        .join(', ')}.`,
    );
  }

  const proposals: AiProposal[] = [];
  const criticalIncident = critical[0];
  if (criticalIncident && criticalIncident.status === 'new') {
    proposals.push({
      id: 'local-incident',
      kind: 'change_incident_status',
      title: `Взять в работу: ${criticalIncident.title}`,
      description: 'Перевести критический инцидент в статус «В работе» и зафиксировать реакцию.',
      reason: 'Критический инцидент без реакции повышает риск просрочки SLA.',
      summary: `Инцидент · ${criticalIncident.owner}`,
      payload: { incidentId: criticalIncident.id, status: 'in_progress' },
      requiresAdmin: true,
      readOnly: true,
    });
  }

  const broken = faulty[0];
  if (broken && proposals.length < 3) {
    const freeEmployee = freeEmployees.find((employee) => employee.zoneId === broken.zoneId) ?? freeEmployees[0];
    proposals.push({
      id: 'local-equipment',
      kind: 'create_task',
      title: `Проверить технику: ${broken.name}`,
      description: `Осмотреть оборудование и проверить датчики. Причина: ${broken.fault ?? 'требуется диагностика'}.`,
      reason: 'Неисправная техника снижает пропускную способность участка.',
      summary: `Задача · ${broken.zoneId}`,
      payload: {
        title: `Проверить технику ${broken.name}`,
        description: broken.fault ?? 'Провести диагностику оборудования.',
        assigneeId: freeEmployee?.id ?? '',
        zoneId: broken.zoneId,
        equipmentId: broken.id,
        priority: 'high',
        dueAt: now + 2 * 3_600_000,
      },
      requiresAdmin: true,
      readOnly: true,
    });
  }

  if (unassigned.length > 0 && freeEmployees.length > 0 && proposals.length < 3) {
    const task = unassigned[0];
    const employee = freeEmployees.find((item) => item.zoneId === task.zoneId) ?? freeEmployees[0];
    proposals.push({
      id: 'local-assign',
      kind: 'assign_employee',
      title: `Назначить ${employee.name}`,
      description: `Задача «${task.title}» не имеет исполнителя.`,
      reason: 'Свободный сотрудник может закрыть задачу без дополнительной нагрузки.',
      summary: `Назначение · ${task.zoneId}`,
      payload: {
        taskId: task.id,
        assigneeId: employee.id,
        note: 'Назначено по локальному демо-анализу.',
      },
      requiresAdmin: true,
      readOnly: true,
    });
  }

  const freeLine =
    freeEmployees.length > 0
      ? `Свободны: ${freeEmployees.slice(0, 5).map((employee) => employee.name).join(', ')}.`
      : 'Свободных сотрудников в снимке нет.';
  const actionLine =
    proposals.length > 0
      ? `Черновики: ${proposals.map((proposal) => proposal.title).join('; ')}.`
      : 'Критических действий не требуется.';

  const answer = [
    'Локальный оперативный анализ по демо-снимку.',
    '',
    `• ${findings.join('\n• ')}`,
    '',
    freeLine,
    actionLine,
    overdue.length > 0 ? `Просрочено задач: ${overdue.length}.` : '',
    '',
    'Бэкенд AI недоступен, поэтому это только чтение: применить действия нельзя. После восстановления сервиса появятся подтверждаемые карточки.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    answer,
    findings,
    proposals,
    generatedAt: now,
    source: 'local',
  };
}
