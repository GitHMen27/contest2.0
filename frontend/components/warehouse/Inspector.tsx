'use client';

import {
  EMPLOYEE_STATUS_META,
  EQUIPMENT_KIND_META,
  EQUIPMENT_STATUS_META,
  WAREHOUSE_INFO,
  ZONE_TONES,
} from '@/constants/warehouse';
import { formatMeters, fullName, relativeTime, zoneName } from '@/lib/warehouseFormat';
import type {
  RouteResult,
  SimulatedEmployee,
  WarehouseEquipment,
  WarehouseSelection,
  WarehouseZone,
} from '@/types/warehouse';
import {
  EmployeeAvatar,
  EmployeeStatusPill,
  MetaRow,
  PanelTitle,
  ZoneStatusPill,
} from '@/components/warehouse/shared';
import {
  IconClock,
  IconClose,
  IconEdit,
  IconForklift,
  IconGate,
  IconInfo,
  IconPallet,
  IconPhone,
  IconPower,
  IconRoute,
  IconTrash,
  IconTruck,
  IconWarehouse,
} from '@/components/warehouse/icons';

const EQUIPMENT_ICONS = {
  forklift: IconForklift,
  truck: IconTruck,
  pallet: IconPallet,
  gate: IconGate,
} as const;

interface InspectorProps {
  selection: WarehouseSelection;
  employee: SimulatedEmployee | null;
  zone: WarehouseZone | null;
  equipment: WarehouseEquipment | null;
  employees: SimulatedEmployee[];
  route: RouteResult | null;
  startNodeId: string;
  mode: 'client' | 'admin';
  now: number;
  canDelete: boolean;
  onSelectEmployee: (id: string) => void;
  onSelectZone: (id: string) => void;
  onBuildRoute: () => void;
  onClearRoute: () => void;
  onClose: () => void;
  onEditEmployee: (employee: SimulatedEmployee) => void;
  onDeactivateEmployee: (employee: SimulatedEmployee) => void;
  onDeleteEmployee: (employee: SimulatedEmployee) => void;
}

function RouteCard({
  route,
  onClear,
}: {
  route: RouteResult;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--priority-line)] bg-[var(--priority-soft)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--priority)]">
          <IconRoute className="h-3.5 w-3.5" />
          Маршрут построен
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-1.5 py-0.5 text-[9px] text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          сбросить
        </button>
      </div>
      <div className="mt-2 flex items-start gap-2 text-[11px] leading-snug">
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full border-2 border-[var(--priority)]" />
        <span className="min-w-0 flex-1 text-[var(--muted)]">
          {route.fromLabel}
          <span className="mx-1 text-[var(--muted-soft)]">→</span>
          <span className="font-medium text-[var(--text)]">{route.toLabel}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 border-t border-[var(--priority-line)] pt-2 text-[10px] text-[var(--muted)]">
        <span className="font-medium text-[var(--text)]">{formatMeters(route.distanceMeters)}</span>
        <span>{route.durationMinutes} мин пешком</span>
        <span className="ml-auto text-[var(--muted-soft)]">по проходам</span>
      </div>
    </div>
  );
}

export function Inspector({
  selection,
  employee,
  zone,
  equipment,
  employees,
  route,
  mode,
  now,
  canDelete,
  onSelectEmployee,
  onSelectZone,
  onBuildRoute,
  onClearRoute,
  onClose,
  onEditEmployee,
  onDeactivateEmployee,
  onDeleteEmployee,
}: InspectorProps) {
  const isAdmin = mode === 'admin';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {selection?.kind === 'employee'
            ? 'Карточка сотрудника'
            : selection?.kind === 'zone'
              ? 'Карточка зоны'
              : selection?.kind === 'equipment'
                ? 'Объект на карте'
                : 'О складе'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          aria-label="Закрыть карточку"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {route ? <RouteCard route={route} onClear={onClearRoute} /> : null}

        {employee ? (
          <>
            <div className="flex items-start gap-3">
              <EmployeeAvatar employee={employee} size={46} muted={employee.status === 'offline'} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold text-[var(--text)]">
                  {fullName(employee)}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{employee.position}</p>
                <div className="mt-1.5">
                  <EmployeeStatusPill status={employee.status} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              <span className="rounded border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                {employee.department}
              </span>
              <span className="rounded border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                {employee.role}
              </span>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-2.5">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                <IconClock className="h-3 w-3" />
                Текущая задача
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--text)]">{employee.task}</p>
            </div>

            <div className="space-y-1.5">
              <MetaRow
                label="Текущая зона"
                value={
                  <button
                    type="button"
                    onClick={() => onSelectZone(employee.currentZoneId)}
                    className="text-right text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                  >
                    {zoneName(employee.currentZoneId)}
                  </button>
                }
              />
              <MetaRow label="Обновлено" value={relativeTime(employee.lastUpdate, now)} />
              {isAdmin ? (
                <>
                  <MetaRow
                    label="Координаты"
                    value={
                      <span className="font-mono text-[10px]">
                        x {Math.round(employee.location.x)} · y {Math.round(employee.location.y)}
                      </span>
                    }
                  />
                  <MetaRow label="Источник" value={employee.isSimulated ? 'демо-симуляция' : 'ручное изменение'} />
                </>
              ) : null}
            </div>

            <div>
              <PanelTitle>Обязанности</PanelTitle>
              <ul className="mt-1.5 space-y-1">
                {employee.responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--muted)]">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent-line-2)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin && employee.history.length > 0 ? (
              <div>
                <PanelTitle>История перемещений</PanelTitle>
                <div className="mt-1.5 space-y-1">
                  {employee.history.slice(0, 4).map((entry, index) => (
                    <div
                      key={`${entry.at}-${index}`}
                      className="flex items-center justify-between rounded border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1 text-[10px] text-[var(--muted)]"
                    >
                      <span className="truncate">{zoneName(entry.zoneId)}</span>
                      <span className="shrink-0 font-mono text-[9px] text-[var(--muted-soft)]">
                        {new Date(entry.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onBuildRoute}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-line-2)] bg-[var(--surface)] text-[10px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
              >
                <IconRoute className="h-3.5 w-3.5" />
                Маршрут
              </button>
              {employee.contact ? (
                <a
                  href={`tel:${employee.contact.replace(/[^\d+]/g, '')}`}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[10px] font-medium text-[var(--text)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
                >
                  <IconPhone className="h-3.5 w-3.5" />
                  Связаться
                </a>
              ) : (
                <span className="flex h-8 items-center justify-center rounded-lg border border-[var(--line)] text-[10px] text-[var(--muted-soft)]">
                  без связи
                </span>
              )}
            </div>

            {isAdmin ? (
              <div className="grid grid-cols-3 gap-1.5 border-t border-[var(--line)] pt-2.5">
                <button
                  type="button"
                  onClick={() => onEditEmployee(employee)}
                  className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--text)] transition hover:bg-[var(--surface-soft)]"
                >
                  <IconEdit className="h-3.5 w-3.5" />
                  Изменить
                </button>
                <button
                  type="button"
                  onClick={() => onDeactivateEmployee(employee)}
                  className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--muted)] transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                >
                  <IconPower className="h-3.5 w-3.5" />
                  Отключить
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteEmployee(employee)}
                  disabled={!canDelete}
                  title={canDelete ? 'Удалить добавленного сотрудника' : 'Базового сотрудника можно только деактивировать'}
                  className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--muted)] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  Удалить
                </button>
              </div>
            ) : null}
          </>
        ) : zone ? (
          <>
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  backgroundColor: ZONE_TONES[zone.tone].soft,
                  borderColor: ZONE_TONES[zone.tone].color,
                  color: ZONE_TONES[zone.tone].color,
                }}
              >
                <IconWarehouse className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold leading-snug text-[var(--text)]">{zone.name}</h2>
                <div className="mt-1">
                  <ZoneStatusPill status={zone.status} />
                </div>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--muted)]">{zone.purpose}</p>

            <div className="space-y-1.5">
              <MetaRow label="Состояние" value={zone.state} />
              <MetaRow label="Площадь" value={`${zone.areaM2.toLocaleString('ru-RU')} м²`} />
              {isAdmin ? <MetaRow label="Загруженность" value={`${zone.load}%`} /> : null}
            </div>

            {isAdmin ? (
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${zone.load}%`, backgroundColor: ZONE_TONES[zone.tone].color }}
                  />
                </div>
                <p className="mt-1 text-[9px] text-[var(--muted-soft)]">
                  Планировка и площадь зоны зафиксированы в демо-конфигурации.
                </p>
              </div>
            ) : null}

            <div>
              <PanelTitle aside={<span className="text-[9px] text-[var(--muted-soft)]">{zone.responsibleIds.length}</span>}>
                Ответственные
              </PanelTitle>
              <div className="mt-1.5 space-y-1">
                {employees
                  .filter((item) => zone.responsibleIds.includes(item.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectEmployee(item.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                    >
                      <EmployeeAvatar employee={item} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text)]">
                        {fullName(item)}
                        <span className="block truncate text-[9px] text-[var(--muted)]">{item.position}</span>
                      </span>
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: EMPLOYEE_STATUS_META[item.status].color }}
                      />
                    </button>
                  ))}
                {zone.responsibleIds.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-2 py-2 text-[10px] text-[var(--muted-soft)]">
                    Зона обслуживается дежурной сменой.
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onBuildRoute}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-line-2)] bg-[var(--surface)] text-[10px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
            >
              <IconRoute className="h-3.5 w-3.5" />
              Построить маршрут до зоны
            </button>
          </>
        ) : equipment ? (
          <>
            {(() => {
              const KindIcon = EQUIPMENT_ICONS[equipment.kind];
              const meta = EQUIPMENT_STATUS_META[equipment.status];
              return (
                <>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-[var(--surface-soft)]"
                      style={{ borderColor: meta.color, color: meta.color }}
                    >
                      <KindIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[14px] font-semibold leading-snug text-[var(--text)]">{equipment.name}</h2>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {EQUIPMENT_KIND_META[equipment.kind].label}
                      </p>
                      <span
                        className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          color: meta.color,
                          borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <MetaRow label="Зона" value={zoneName(equipment.zoneId)} />
                    <MetaRow label="Задача" value={equipment.task} />
                    <MetaRow label="Тип" value={EQUIPMENT_KIND_META[equipment.kind].label} />
                  </div>

                  <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-2.5 text-[10px] leading-relaxed text-[var(--muted)]">
                    Демонстрационный объект: телеметрия погрузчиков и фур не подключена.
                  </div>

                  <button
                    type="button"
                    onClick={onBuildRoute}
                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-line-2)] bg-[var(--surface)] text-[10px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
                  >
                    <IconRoute className="h-3.5 w-3.5" />
                    Маршрут до объекта
                  </button>
                </>
              );
            })()}
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="gradient-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-[var(--accent-contrast)]">
                WB
              </span>
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold leading-snug text-[var(--text)]">{WAREHOUSE_INFO.name}</h2>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">{WAREHOUSE_INFO.city}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <MetaRow label="Адрес" value={WAREHOUSE_INFO.address} />
              <MetaRow label="Площадь" value={`${WAREHOUSE_INFO.areaM2.toLocaleString('ru-RU')} м²`} />
              <MetaRow label="Доки" value={`${WAREHOUSE_INFO.docks}`} />
              <MetaRow label="Смена" value={WAREHOUSE_INFO.shift} />
              <MetaRow label="Телефон" value={WAREHOUSE_INFO.phone} />
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-2.5">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                <IconClock className="h-3 w-3" />
                Часы работы
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[var(--text)]">{WAREHOUSE_INFO.hours}</p>
            </div>

            <div>
              <PanelTitle aside={<span className="text-[9px] text-[var(--muted-soft)]">3 шага</span>}>
                Как сориентироваться
              </PanelTitle>
              <ol className="mt-1.5 space-y-1.5">
                {[
                  'Найдите человека или зону через поиск слева.',
                  'Откройте карточку: в ней задача, статус и ответственный.',
                  'Нажмите «Маршрут» — путь появится на схеме.',
                ].map((step, index) => (
                  <li key={step} className="flex items-start gap-2 text-[10px] leading-snug text-[var(--muted)]">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] font-mono text-[8px] text-[var(--muted-soft)]">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--accent)]">
                <IconInfo className="h-3.5 w-3.5" />
                Демонстрационный режим
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
                Перемещения и статусы сотрудников симулируются. Точки на карте не являются данными
                реального позиционирования BLE/UWB.
              </p>
            </div>

            <div>
              <PanelTitle aside={<span className="text-[9px] text-[var(--muted-soft)]">{employees.filter((e) => e.status === 'available').length}</span>}>
                Сейчас доступны
              </PanelTitle>
              <div className="mt-1.5 space-y-1">
                {employees
                  .filter((item) => item.status === 'available')
                  .slice(0, 4)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectEmployee(item.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                    >
                      <EmployeeAvatar employee={item} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text)]">
                        {fullName(item)}
                        <span className="block truncate text-[9px] text-[var(--muted)]">{item.position}</span>
                      </span>
                      <IconChevronMini />
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>

      {mode === 'admin' ? (
        <div className="border-t border-[var(--line)] px-3 py-1.5 text-[9px] text-[var(--muted-soft)]">
          Изменения сохраняются локально в браузере · демо
        </div>
      ) : null}
    </div>
  );
}

function IconChevronMini() {
  return <span className="text-[10px] text-[var(--muted-soft)]">›</span>;
}
