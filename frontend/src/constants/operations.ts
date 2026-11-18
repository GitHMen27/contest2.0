// constants/operations.ts
import type {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  OpsEvent,
  OpsEventType,
  OpsSource,
  OperationsState,
  TaskPriority,
  TaskStatus,
  WarehouseTask,
} from '@/types/operations';

export const INCIDENT_SEVERITY_META: Record<
  IncidentSeverity,
  { label: string; short: string; color: string; bg: string; border: string; rank: number }
> = {
  critical: {
    label: 'Критический',
    short: 'Крит',
    color: '#e11d48',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    rank: 0,
  },
  high: {
    label: 'Высокий',
    short: 'Выс',
    color: '#ea580c',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    rank: 1,
  },
  medium: {
    label: 'Средний',
    short: 'Сред',
    color: '#d97706',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    rank: 2,
  },
  low: {
    label: 'Низкий',
    short: 'Низ',
    color: '#0284c7',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    rank: 3,
  },
};

export const INCIDENT_STATUS_META: Record<
  IncidentStatus,
  { label: string; color: string; className: string }
> = {
  new: { label: 'Новый', color: '#e11d48', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  in_progress: {
    label: 'В работе',
    color: '#d97706',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  resolved: {
    label: 'Решён',
    color: '#059669',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
};

export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> = {
  hub: 'РЦ',
  warehouse: 'Склад',
  transport: 'Транспорт',
  staff: 'Персонал',
  equipment: 'Техника',
  sla: 'SLA',
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; short: string; color: string; rank: number }
> = {
  urgent: { label: 'Срочно', short: 'Срочно', color: '#e11d48', rank: 0 },
  high: { label: 'Высокий', short: 'Выс', color: '#ea580c', rank: 1 },
  normal: { label: 'Обычный', short: 'Обыч', color: '#0284c7', rank: 2 },
  low: { label: 'Низкий', short: 'Низ', color: '#64748b', rank: 3 },
};

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; className: string }
> = {
  new: { label: 'Новая', color: '#64748b', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  in_progress: {
    label: 'В работе',
    color: '#d97706',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  blocked: {
    label: 'Блокирована',
    color: '#e11d48',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  done: {
    label: 'Выполнена',
    color: '#059669',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
};

export const EVENT_TYPE_META: Record<
  OpsEventType,
  { label: string; color: string; className: string }
> = {
  trip: { label: 'Рейс', color: '#0284c7', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  hub: { label: 'РЦ', color: '#7c3aed', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  incident: { label: 'Инцидент', color: '#e11d48', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  task: { label: 'Задача', color: '#d97706', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  equipment: {
    label: 'Техника',
    color: '#64748b',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  employee: {
    label: 'Сотрудник',
    color: '#0d9488',
    className: 'border-teal-200 bg-teal-50 text-teal-700',
  },
  ai: { label: 'AI', color: '#7c3aed', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  simulation: {
    label: 'Симуляция',
    color: '#64748b',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  system: {
    label: 'Система',
    color: '#64748b',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

export const OPS_SOURCE_LABEL: Record<OpsSource, string> = {
  demo: 'демо',
  user: 'пользователь',
  ai: 'AI',
  simulation: 'симуляция',
  live: 'live',
};

function minutesAgo(now: number, minutes: number): number {
  return now - minutes * 60_000;
}

function hoursAgo(now: number, hours: number): number {
  return now - hours * 3_600_000;
}

function hoursFromNow(now: number, hours: number): number {
  return now + hours * 3_600_000;
}

/** Демонстрационные инциденты: связаны с реальными РЦ и зонами Шушар. */
export const SEED_INCIDENTS: Incident[] = [
  {
    id: 'inc-krasnodar-overload',
    title: 'Краснодар: загрузка 96% и очередь на доки',
    description:
      'Плановый поток превышает пропускную способность РЦ. На въезде ожидают 3 фуры, средняя задержка приёмки — 48 минут.',
    severity: 'critical',
    status: 'new',
    category: 'hub',
    hubId: 'krasnodar',
    owner: 'Операционный штаб',
    source: 'demo',
    recommendation: 'Перераспределить часть потока на Зеленодольск и сократить неприоритетные отгрузки до 18:00.',
    createdAt: minutesAgo(31, 32),
    updatedAt: minutesAgo(31, 5),
  },
  {
    id: 'inc-elektrostal-staff',
    title: 'Электросталь: нехватка 4 сотрудников смены',
    description:
      'На смене отсутствуют 4 сотрудника приёмки. Прогноз: +22 минуты к обработке входящего потока и риск просрочки SLA.',
    severity: 'high',
    status: 'in_progress',
    category: 'staff',
    hubId: 'elektrostal',
    owner: 'Анна Смирнова',
    ownerId: 'e-smirnova',
    source: 'demo',
    recommendation: 'Перевести двух сотрудников с комплектации и продлить окно приёмки на 45 минут.',
    createdAt: minutesAgo(74, 18),
    updatedAt: minutesAgo(12, 40),
  },
  {
    id: 'inc-shushary-forklift',
    title: 'Шушары: FL-07 простаивает 42 минуты',
    description:
      'Погрузчик FL-07 находится в зоне комплектации без активной задачи. Датчик вил не отвечает, требуется осмотр.',
    severity: 'medium',
    status: 'in_progress',
    category: 'equipment',
    hubId: 'shushary',
    zoneId: 'picking',
    equipmentId: 'forklift-3',
    owner: 'Максим Орлов',
    ownerId: 'e-orlov',
    source: 'demo',
    recommendation: 'Назначить осмотр техники и при необходимости перевести комплектацию на FL-01.',
    createdAt: minutesAgo(48, 24),
    updatedAt: minutesAgo(9, 10),
  },
  {
    id: 'inc-koledino-sla',
    title: 'Коледино: риск SLA по 3 рейсам',
    description:
      'Три рейса вышли с отклонением от плана. Окно доставки закрывается в течение 2 часов, приоритет — у двух рейсов.',
    severity: 'high',
    status: 'resolved',
    category: 'sla',
    hubId: 'koledino',
    owner: 'Диспетчер смены',
    source: 'demo',
    recommendation: 'Рейсы переведены на приоритетную обработку; SLA восстановлен.',
    createdAt: hoursAgo(3, 12),
    updatedAt: hoursAgo(1, 6),
  },
  {
    id: 'inc-shushary-docs',
    title: 'Шушары: неполный комплект накладных',
    description:
      'По поставке WB-4821 не хватает двух сопроводительных документов. Приёмка приостановлена до сверки.',
    severity: 'low',
    status: 'resolved',
    category: 'warehouse',
    hubId: 'shushary',
    zoneId: 'docs',
    owner: 'Алексей Морозов',
    ownerId: 'e-morozov',
    source: 'demo',
    recommendation: 'Документы получены, приёмка возобновлена.',
    createdAt: hoursAgo(4, 28),
    updatedAt: hoursAgo(2, 10),
  },
];

/** Демонстрационные задачи склада: назначение, дедлайны, статусы и история. */
export const SEED_TASKS: WarehouseTask[] = [
  {
    id: 'task-receive-wb4821',
    title: 'Принять и проверить поставку WB-4821',
    description: 'Сверить количество паллет, проверить маркировку и передать партию на контроль качества.',
    assigneeId: 'e-smirnova',
    zoneId: 'receiving',
    priority: 'high',
    status: 'in_progress',
    dueAt: minutesAgo(31, -95),
    createdAt: minutesAgo(31, 130),
    updatedAt: minutesAgo(31, 42),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 130), status: 'new', note: 'Задача создана по поставке WB-4821', actor: 'Система' },
      { at: minutesAgo(31, 118), status: 'in_progress', note: 'Назначена Анне Смирновой', actor: 'Начальник смены' },
    ],
  },
  {
    id: 'task-qc-wb4818',
    title: 'Проверить брак в партии WB-4818',
    description: 'Выборочный контроль 12 паллет, зафиксировать повреждения и подготовить акт.',
    assigneeId: 'e-volkova',
    zoneId: 'qc',
    priority: 'urgent',
    status: 'new',
    dueAt: minutesAgo(31, -40),
    createdAt: minutesAgo(31, 55),
    updatedAt: minutesAgo(31, 55),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 55), status: 'new', note: 'Задача создана по обращению смены', actor: 'Система' },
    ],
  },
  {
    id: 'task-move-b3',
    title: 'Переместить паллеты B3 в зону отгрузки',
    description: 'Освободить проход у стеллажа B3 и подготовить 8 паллет к рейсу СПб → Москва.',
    assigneeId: 'e-kuznetsova',
    zoneId: 'storage-b',
    priority: 'high',
    status: 'in_progress',
    dueAt: minutesAgo(31, -75),
    createdAt: minutesAgo(31, 110),
    updatedAt: minutesAgo(31, 18),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 110), status: 'new', note: 'Задача создана логистом отгрузки', actor: 'Игорь Петров' },
      { at: minutesAgo(31, 96), status: 'in_progress', note: 'Назначена Ольге Кузнецовой', actor: 'Игорь Петров' },
    ],
  },
  {
    id: 'task-dock3-docs',
    title: 'Подготовить док 3 к рейсу СПб → Москва',
    description: 'Проверить комплектность и получить документы у документоведа.',
    assigneeId: 'e-petrov',
    zoneId: 'docks',
    priority: 'normal',
    status: 'blocked',
    dueAt: hoursFromNow(31, 2),
    createdAt: minutesAgo(31, 150),
    updatedAt: minutesAgo(31, 26),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 150), status: 'new', note: 'Задача создана по плану отгрузки', actor: 'Система' },
      { at: minutesAgo(31, 140), status: 'in_progress', note: 'Назначена Игорю Петрову', actor: 'Начальник смены' },
      { at: minutesAgo(31, 26), status: 'blocked', note: 'Ожидаются накладные', actor: 'Игорь Петров' },
    ],
  },
  {
    id: 'task-docs-shift-b',
    title: 'Сверить накладные по смене B',
    description: 'Закрыть пакет документов смены и передать архив в офис.',
    assigneeId: 'e-morozov',
    zoneId: 'docs',
    priority: 'normal',
    status: 'done',
    dueAt: minutesAgo(31, 30),
    createdAt: hoursAgo(31, 3),
    updatedAt: minutesAgo(31, 24),
    source: 'demo',
    history: [
      { at: hoursAgo(31, 3), status: 'new', note: 'Задача создана по регламенту смены', actor: 'Система' },
      { at: hoursAgo(31, 2), status: 'in_progress', note: 'Назначена Алексею Морозову', actor: 'Начальник смены' },
      { at: minutesAgo(31, 24), status: 'done', note: 'Документы сверены и переданы', actor: 'Алексей Морозов' },
    ],
  },
  {
    id: 'task-storage-a-walk',
    title: 'Обход зоны хранения A и контроль стеллажей',
    description: 'Проверить целостность стеллажей, свободные ячейки и состояние проходов.',
    assigneeId: '',
    zoneId: 'storage-a',
    priority: 'low',
    status: 'new',
    dueAt: hoursFromNow(31, 4),
    createdAt: minutesAgo(31, 65),
    updatedAt: minutesAgo(31, 65),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 65), status: 'new', note: 'Задача создана, исполнитель не назначен', actor: 'Система' },
    ],
  },
  {
    id: 'task-fl07-check',
    title: 'Проверить датчик вил FL-07',
    description: 'Осмотреть погрузчик, проверить отклик датчика и зафиксировать результат в карточке техники.',
    assigneeId: 'e-novikov',
    zoneId: 'picking',
    equipmentId: 'forklift-3',
    priority: 'high',
    status: 'new',
    dueAt: minutesAgo(31, -50),
    createdAt: minutesAgo(31, 40),
    updatedAt: minutesAgo(31, 40),
    source: 'demo',
    history: [
      { at: minutesAgo(31, 40), status: 'new', note: 'Задача создана по инциденту FL-07', actor: 'Система' },
    ],
  },
];

interface SeedEvent extends Omit<OpsEvent, 'id' | 'at'> {
  minutesAgo: number;
}

const SEED_EVENTS: SeedEvent[] = [
  {
    minutesAgo: 8,
    type: 'trip',
    title: 'Рейс WB-7719 доставлен',
    detail: 'Шушары → Москва · окно SLA соблюдено, отклонение 4 минуты.',
    source: 'demo',
    hubId: 'shushary',
    severity: 'info',
  },
  {
    minutesAgo: 18,
    type: 'task',
    title: 'Задача перемещения паллет B3 в работе',
    detail: 'Ольга Кузнецова приступила к перемещению 8 паллет в зону отгрузки.',
    source: 'demo',
    hubId: 'shushary',
    zoneId: 'storage-b',
    severity: 'info',
  },
  {
    minutesAgo: 26,
    type: 'task',
    title: 'Задача по докукам заблокирована',
    detail: 'Док 3 ожидает накладные по рейсу СПб → Москва.',
    source: 'demo',
    hubId: 'shushary',
    zoneId: 'docks',
    severity: 'medium',
  },
  {
    minutesAgo: 31,
    type: 'incident',
    title: 'Инцидент: перегрузка Краснодара',
    detail: 'Загрузка 96%, очередь на доки. Инцидент передан операционному штабу.',
    source: 'demo',
    hubId: 'krasnodar',
    severity: 'critical',
  },
  {
    minutesAgo: 36,
    type: 'hub',
    title: 'Краснодар: загрузка выше порога',
    detail: 'Загрузка выросла до 96% — сработал порог критического состояния.',
    source: 'demo',
    hubId: 'krasnodar',
    severity: 'high',
  },
  {
    minutesAgo: 44,
    type: 'ai',
    title: 'AI предложил перераспределить поток',
    detail: 'Рекомендация: перевести 12% потока на Зеленодольск. Действие не выполнялось без подтверждения.',
    source: 'demo',
    severity: 'info',
  },
  {
    minutesAgo: 48,
    type: 'incident',
    title: 'Инцидент: простой FL-07',
    detail: 'Погрузчик в зоне комплектации без задачи, датчик вил не отвечает.',
    source: 'demo',
    hubId: 'shushary',
    zoneId: 'picking',
    severity: 'medium',
  },
  {
    minutesAgo: 55,
    type: 'employee',
    title: 'Смена: Анна Смирнова на приёмке',
    detail: 'Статус изменён на «Доступна», назначена приёмка WB-4821.',
    source: 'demo',
    hubId: 'shushary',
    zoneId: 'receiving',
    severity: 'info',
  },
  {
    minutesAgo: 74,
    type: 'incident',
    title: 'Инцидент: нехватка сотрудников в Электростали',
    detail: 'На смене отсутствуют 4 сотрудника приёмки.',
    source: 'demo',
    hubId: 'elektrostal',
    severity: 'high',
  },
  {
    minutesAgo: 92,
    type: 'equipment',
    title: 'FL-04 прошёл плановое обслуживание',
    detail: 'Техника возвращена в работу, следующее ТО — через 21 день.',
    source: 'demo',
    hubId: 'shushary',
    zoneId: 'storage-b',
    severity: 'info',
  },
  {
    minutesAgo: 126,
    type: 'trip',
    title: 'Запущен приоритетный рейс',
    detail: 'Шушары → Зеленодольск, приоритетная отправка.',
    source: 'demo',
    hubId: 'shushary',
    severity: 'info',
  },
  {
    minutesAgo: 180,
    type: 'system',
    title: 'Смена B приняла управление',
    detail: 'Демо-смена 08:00–20:00, 15 сотрудников и 7 единиц техники.',
    source: 'demo',
    severity: 'info',
  },
];

function eventId(index: number): string {
  return `evt-seed-${index + 1}`;
}

/** Собирает стартовое состояние относительно текущего времени, чтобы демо всегда выглядело живым. */
export function buildSeedState(now: number): OperationsState {
  return {
    version: 1,
    incidents: SEED_INCIDENTS.map((incident) => ({ ...incident })),
    tasks: SEED_TASKS.map((task) => ({ ...task, history: task.history.map((entry) => ({ ...entry })) })),
    events: SEED_EVENTS.map((event, index) => ({
      id: eventId(index),
      type: event.type,
      title: event.title,
      detail: event.detail,
      at: now - event.minutesAgo * 60_000,
      severity: event.severity,
      source: event.source,
      hubId: event.hubId,
      zoneId: event.zoneId,
      actor: event.actor,
    })),
  };
}

export const OPS_SNAPSHOT_VERSION = 1;
