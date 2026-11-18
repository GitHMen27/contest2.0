'use client';

import { useEffect } from 'react';
import {
  IconClose,
  IconInfo,
  IconMap,
  IconRotateRight,
  IconRoute,
  IconTarget,
  IconUsers,
  IconWarehouse,
} from '@/components/warehouse/icons';

const CONTROLS = [
  {
    title: '3D-камера',
    Icon: IconRotateRight,
    text: 'Тяните схему влево/вправо — ровный поворот, вверх/вниз — наклон. Кнопки ↺ и ↻ справа поворачивают на 30°.',
  },
  {
    title: 'Перемещение и масштаб',
    Icon: IconTarget,
    text: 'Shift + перетаскивание или правая кнопка мыши — сдвиг. Колесо мыши и кнопки +/− — масштаб, прицел — сброс вида.',
  },
  {
    title: 'Зоны и сотрудники',
    Icon: IconUsers,
    text: 'Нажмите на зону, сотрудника или технику — откроется карточка со статусом, задачей и ответственными.',
  },
  {
    title: 'Маршруты внутри склада',
    Icon: IconRoute,
    text: 'Выберите точку старта в левой панели и нажмите «Маршрут» в карточке — путь появится на схеме.',
  },
];

const TOUR = [
  'Поверните 3D-схему и найдите взглядом нужную зону.',
  'Найдите сотрудника через поиск или откройте вкладку «Люди».',
  'Нажмите «Ближайший доступный» — платформа построит маршрут.',
  'Переключитесь между 3D и 2D, чтобы сравнить виды.',
];

export function WarehouseHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-[#160b20]/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-help-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] shadow-xl shadow-[#2a0f3a]/15 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--accent-soft-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                демо-стенд конкурса
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--muted-soft)]">
                <IconWarehouse className="h-3 w-3" aria-hidden="true" />
                цифровой двойник
              </span>
            </div>
            <h2 id="warehouse-help-title" className="mt-1.5 text-lg font-semibold text-[var(--text)] sm:text-xl">
              Как пользоваться цифровым двойником
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--muted)]">
              Сейчас активна одна точка сети — <span className="font-medium text-[var(--text)]">РЦ «Шушары»</span>.
              Остальные распределительные центры показаны на карте сети: их цифровые двойники добавим по мере
              развития платформы.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            aria-label="Закрыть подсказку"
          >
            <IconClose className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTROLS.map(({ title, text, Icon }) => (
              <div key={title} className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--text)]">{title}</span>
                </div>
                <p className="text-[10px] leading-relaxed text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft-2)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--accent)]">
              <IconMap className="h-3.5 w-3.5" aria-hidden="true" />
              Что посмотреть за 2 минуты
            </div>
            <ol className="mt-2 grid gap-1.5 text-[10px] leading-relaxed text-[var(--muted)] sm:grid-cols-2">
              {TOUR.map((item, index) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[9px] font-semibold text-[var(--accent)]">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]/95 p-3 shadow-[0_-10px_18px_-16px_rgba(22,11,32,0.45)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-soft)]">
              <IconInfo className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Перемещения и статусы — демонстрационная симуляция, а не реальные BLE/UWB-координаты.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="gradient-brand shrink-0 rounded-lg px-4 py-2 text-[11px] font-medium text-[var(--accent-contrast)] transition hover:opacity-90"
            >
              Понятно, к карте
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
