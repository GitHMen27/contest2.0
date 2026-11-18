'use client';

import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { WAREHOUSE_EQUIPMENT, ZONES } from '@/constants/warehouse';
import { TASK_PRIORITY_META, TASK_STATUS_META } from '@/constants/operations';
import { useAuth } from '@/lib/auth';
import {
  addTask,
  changeTaskStatus,
  updateTask,
} from '@/lib/operationsStore';
import {
  formatDue,
  formatOpsDateTime,
  formatOpsRelative,
  isTaskOverdue,
} from '@/lib/operationsFormat';
import type { SimulatedEmployee } from '@/types/warehouse';
import type { TaskPriority, TaskStatus, WarehouseTask } from '@/types/operations';
import { IconAlert, IconClose, IconTask } from '@/components/warehouse/icons';

function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--muted-soft)]">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-[10px]">
      <span className="shrink-0 text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}

export function TaskModal({
  initial,
  mode,
  employees,
  now,
  onClose,
  onSaved,
}: {
  initial: WarehouseTask | null;
  mode: 'client' | 'admin';
  employees: SimulatedEmployee[];
  now: number;
  onClose: () => void;
  onSaved?: (taskId: string) => void;
}) {
  const { session } = useAuth();
  const isAdmin = mode === 'admin';
  const defaultAssignee = useMemo(
    () => employees.find((employee) => employee.status === 'available')?.id ?? '',
    [employees],
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? defaultAssignee);
  const [zoneId, setZoneId] = useState(initial?.zoneId ?? 'receiving');
  const [equipmentId, setEquipmentId] = useState(initial?.equipmentId ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'normal');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'new');
  const [dueInput, setDueInput] = useState(() => toLocalInput(initial?.dueAt ?? Date.now() + 2 * 3_600_000));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const assignee = employees.find((employee) => employee.id === (initial?.assigneeId ?? assigneeId));
  const zone = ZONES.find((item) => item.id === (initial?.zoneId ?? zoneId));
  const equipment = WAREHOUSE_EQUIPMENT.find((item) => item.id === (initial?.equipmentId ?? equipmentId));
  const priorityMeta = TASK_PRIORITY_META[initial?.priority ?? priority];
  const statusMeta = TASK_STATUS_META[initial?.status ?? status];
  const actor = session?.username ?? 'Администратор';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) {
      onClose();
      return;
    }
    if (!title.trim()) {
      setError('Укажите название задачи.');
      return;
    }
    const dueAt = fromLocalInput(dueInput);
    if (!Number.isFinite(dueAt)) {
      setError('Укажите корректный срок выполнения.');
      return;
    }
    if (initial) {
      updateTask(
        initial.id,
        {
          title: title.trim(),
          description: description.trim(),
          assigneeId,
          zoneId,
          equipmentId: equipmentId || undefined,
          priority,
          status,
          dueAt,
        },
        actor,
        'Изменения из карточки задачи',
      );
      setSaved(true);
      onSaved?.(initial.id);
      onClose();
      return;
    }
    const id = addTask({
      title: title.trim(),
      description: description.trim(),
      assigneeId,
      zoneId,
      equipmentId: equipmentId || undefined,
      priority,
      dueAt,
      source: 'user',
      actor,
    });
    setSaved(true);
    onSaved?.(id);
    onClose();
  };

  const quickStatus = (next: TaskStatus, note: string) => {
    if (!initial || !isAdmin) return;
    changeTaskStatus(initial.id, next, actor, note);
    setStatus(next);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[#160b20]/45 backdrop-blur-[1px]"
        aria-label="Закрыть карточку задачи"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Карточка задачи' : 'Новая задача'}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              <IconTask className="h-3 w-3" />
              {initial ? 'Карточка задачи' : 'Новая задача'}
            </div>
            <h2 className="mt-1 truncate text-[14px] font-semibold text-[var(--text)]">
              {initial ? initial.title : 'Поставить задачу смене'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px]">
              <span className={`rounded-full border px-1.5 py-0.5 ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              <span
                className="rounded-full border px-1.5 py-0.5"
                style={{
                  color: priorityMeta.color,
                  borderColor: `color-mix(in srgb, ${priorityMeta.color} 32%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${priorityMeta.color} 8%, transparent)`,
                }}
              >
                {priorityMeta.label}
              </span>
              {initial && isTaskOverdue(initial, now) ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">
                  просрочена
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            aria-label="Закрыть"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {isAdmin ? (
              <div className="space-y-2.5">
                <label className="block">
                  <FieldLabel>Название</FieldLabel>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="Что нужно сделать"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Описание</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    maxLength={400}
                    className="w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-[10.5px] leading-relaxed text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="Детали, критерии готовности, комментарий"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <FieldLabel>Исполнитель</FieldLabel>
                    <select
                      value={assigneeId}
                      onChange={(event) => setAssigneeId(event.target.value)}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">Не назначен</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName} · {employee.position}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <FieldLabel>Зона</FieldLabel>
                    <select
                      value={zoneId}
                      onChange={(event) => setZoneId(event.target.value)}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      {ZONES.filter((item) => item.id !== 'corridors').map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.shortName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <FieldLabel>Приоритет</FieldLabel>
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as TaskPriority)}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      {Object.entries(TASK_PRIORITY_META).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <FieldLabel>Статус</FieldLabel>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value as TaskStatus)}
                      disabled={!initial}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                    >
                      {Object.entries(TASK_STATUS_META).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <FieldLabel>Срок</FieldLabel>
                    <input
                      type="datetime-local"
                      value={dueInput}
                      onChange={(event) => setDueInput(event.target.value)}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="col-span-2 block">
                    <FieldLabel>Связанная техника</FieldLabel>
                    <select
                      value={equipmentId}
                      onChange={(event) => setEquipmentId(event.target.value)}
                      className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">Без привязки</option>
                      {WAREHOUSE_EQUIPMENT.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {error ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[9px] text-rose-700">
                    {error}
                  </p>
                ) : null}
                {saved ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[9px] text-emerald-700">
                    Изменения сохранены в демо-журнале.
                  </p>
                ) : null}

                {initial ? (
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                    <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                      <IconAlert className="h-3 w-3" />
                      Быстрые действия
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {initial.status !== 'in_progress' && initial.status !== 'done' ? (
                        <button
                          type="button"
                          onClick={() => quickStatus('in_progress', 'Задача взята в работу из карточки')}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          В работу
                        </button>
                      ) : null}
                      {initial.status !== 'done' ? (
                        <button
                          type="button"
                          onClick={() => quickStatus('done', 'Задача выполнена, результат зафиксирован')}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Выполнено
                        </button>
                      ) : null}
                      {initial.status !== 'blocked' && initial.status !== 'done' ? (
                        <button
                          type="button"
                          onClick={() => quickStatus('blocked', 'Задача заблокирована, нужна помощь')}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Заблокировать
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-2.5">
                  <p className="text-[11px] leading-relaxed text-[var(--text)]">
                    {initial?.description || 'Описание не заполнено.'}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] p-2.5">
                  <Row
                    label="Исполнитель"
                    value={
                      assignee ? (
                        <span>
                          {assignee.firstName} {assignee.lastName}
                        </span>
                      ) : (
                        'Не назначен'
                      )
                    }
                  />
                  <Row label="Зона" value={zone?.shortName ?? '—'} />
                  <Row label="Приоритет" value={priorityMeta.label} />
                  <Row label="Статус" value={statusMeta.label} />
                  <Row
                    label="Срок"
                    value={
                      initial ? (
                        <span className={isTaskOverdue(initial, now) ? 'text-rose-700' : ''}>
                          {formatOpsDateTime(initial.dueAt)} · {formatDue(initial.dueAt, now)}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  {equipment ? <Row label="Техника" value={equipment.name} /> : null}
                  <Row label="Источник" value="демо-задача" />
                </div>
              </div>
            )}

            {initial && initial.history.length > 0 ? (
              <div className="mt-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  История выполнения
                </div>
                <div className="mt-1.5 space-y-1">
                  {[...initial.history].reverse().slice(0, 6).map((entry, index) => (
                    <div
                      key={`${entry.at}-${index}`}
                      className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[9px]">
                        <span className="font-medium text-[var(--text)]">{TASK_STATUS_META[entry.status].label}</span>
                        <span className="shrink-0 font-mono text-[8px] text-[var(--muted-soft)]">
                          {formatOpsRelative(entry.at, now)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[9px] leading-snug text-[var(--muted)]">{entry.note}</p>
                      <p className="mt-0.5 text-[8px] text-[var(--muted-soft)]">{entry.actor}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2">
            <span className="truncate text-[8px] text-[var(--muted-soft)]">
              {isAdmin ? 'Изменения попадут в журнал задач' : 'Просмотр задачи · демо'}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-lg border border-[var(--line)] px-3 text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              >
                {isAdmin ? 'Отмена' : 'Закрыть'}
              </button>
              {isAdmin ? (
                <button
                  type="submit"
                  className="flex h-8 items-center gap-1 rounded-lg border border-[var(--accent-line-2)] bg-[var(--accent-soft)] px-3 text-[10px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft-2)]"
                >
                  <IconTask className="h-3 w-3" />
                  {initial ? 'Сохранить' : 'Создать'}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
