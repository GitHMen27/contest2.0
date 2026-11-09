'use client';

import { IconLayers, IconMap } from '@/components/warehouse/icons';

export type WarehouseView = '2d' | '3d';

/** Переключатель вида карты: объёмная изометрия или привычный вид сверху. */
export function WarehouseViewToggle({
  view,
  onChange,
}: {
  view: WarehouseView;
  onChange: (view: WarehouseView) => void;
}) {
  const options = [
    { id: '3d' as const, label: '3D', Icon: IconLayers },
    { id: '2d' as const, label: '2D', Icon: IconMap },
  ];

  return (
    <div
      role="group"
      aria-label="Вид карты склада"
      className="absolute left-3 top-3 z-20 flex items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--surface)]/95 p-0.5 shadow-sm backdrop-blur"
    >
      {options.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            title={id === '3d' ? 'Объёмная 3D-схема склада' : 'Вид сверху на план склада'}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition ${
              active
                ? 'bg-[var(--accent-soft-2)] text-[var(--accent)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
