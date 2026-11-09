'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  DEPARTMENTS,
  EMPLOYEE_STATUS_META,
  ROLES,
  ZONES,
} from '@/constants/warehouse';
import type { EmployeeStatus, WarehouseEmployee } from '@/types/warehouse';
import { IconClose, IconPlus } from '@/components/warehouse/icons';

interface EmployeeFormModalProps {
  initial: WarehouseEmployee | null;
  onSave: (employee: WarehouseEmployee) => void;
  onClose: () => void;
}

function createEmpty(): WarehouseEmployee {
  return {
    id: `e-custom-${Date.now()}`,
    firstName: '',
    lastName: '',
    position: '',
    role: 'Кладовщик',
    department: 'Приёмка',
    zoneId: 'receiving',
    status: 'available',
    task: 'Задача не назначена',
    responsibilities: ['Работа по регламентам склада'],
    contact: '',
    avatarTone: 'violet',
    online: true,
  };
}

const inputClass =
  'h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function EmployeeFormModal({ initial, onSave, onClose }: EmployeeFormModalProps) {
  const [draft, setDraft] = useState<WarehouseEmployee>(() =>
    initial ? { ...initial, responsibilities: [...initial.responsibilities] } : createEmpty(),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const valid = draft.firstName.trim() && draft.lastName.trim() && draft.position.trim();

  const update = <K extends keyof WarehouseEmployee>(key: K, value: WarehouseEmployee[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSave({
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      position: draft.position.trim(),
      role: draft.role.trim() || 'Сотрудник склада',
      department: draft.department.trim() || 'Смена',
      task: draft.task.trim() || 'Задача не назначена',
      contact: draft.contact?.trim(),
      online: draft.status !== 'offline',
      updatedAt: Date.now(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-[#160b20]/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-form-title"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      >
        <div className="header-brand flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--accent)]">
              {initial ? <span>Редактирование</span> : <><IconPlus className="h-3 w-3" /> Новый сотрудник</>}
            </div>
            <h2 id="employee-form-title" className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">
              {initial ? `${initial.firstName} ${initial.lastName}` : 'Карточка сотрудника'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            aria-label="Закрыть форму"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Имя">
              <input
                value={draft.firstName}
                onChange={(event) => update('firstName', event.target.value)}
                placeholder="Анна"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Фамилия">
              <input
                value={draft.lastName}
                onChange={(event) => update('lastName', event.target.value)}
                placeholder="Смирнова"
                className={inputClass}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Должность">
              <input
                value={draft.position}
                onChange={(event) => update('position', event.target.value)}
                placeholder="Старший кладовщик"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Роль">
              <input
                list="warehouse-roles"
                value={draft.role}
                onChange={(event) => update('role', event.target.value)}
                className={inputClass}
              />
              <datalist id="warehouse-roles">
                {ROLES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Отдел">
              <input
                list="warehouse-departments"
                value={draft.department}
                onChange={(event) => update('department', event.target.value)}
                className={inputClass}
              />
              <datalist id="warehouse-departments">
                {DEPARTMENTS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
            <Field label="Зона">
              <select
                value={draft.zoneId}
                onChange={(event) => update('zoneId', event.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {ZONES.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.shortName}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Статус">
              <select
                value={draft.status}
                onChange={(event) => update('status', event.target.value as EmployeeStatus)}
                className={`${inputClass} cursor-pointer`}
              >
                {(Object.keys(EMPLOYEE_STATUS_META) as EmployeeStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {EMPLOYEE_STATUS_META[key].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Телефон">
              <input
                value={draft.contact ?? ''}
                onChange={(event) => update('contact', event.target.value)}
                placeholder="+7 (812) 555-01-00"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Текущая задача">
            <input
              value={draft.task}
              onChange={(event) => update('task', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Обязанности (через запятую)">
            <textarea
              value={draft.responsibilities.join(', ')}
              onChange={(event) =>
                update(
                  'responsibilities',
                  event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
              rows={2}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
            />
          </Field>

          <p className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-2 text-[9px] leading-relaxed text-[var(--muted-soft)]">
            Демо-режим: изменения хранятся локально в браузере и не отправляются на сервер. Позиция
            сотрудника привязывается к выбранной зоне.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="gradient-brand h-8 rounded-lg px-3.5 text-[11px] font-medium text-[var(--accent-contrast)] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {initial ? 'Сохранить' : 'Добавить сотрудника'}
          </button>
        </div>
      </form>
    </div>
  );
}
