'use client';

import { useEffect, useRef, useState } from 'react';
import { loadHeat } from '@/lib/warehouseLayers';
import type { WarehouseLayers } from '@/types/warehouse';
import {
  IconAlert,
  IconBox,
  IconClose,
  IconLayers,
  IconRoute,
  IconTask,
  IconTruck,
  IconUsers,
} from '@/components/warehouse/icons';

const LAYER_ITEMS: Array<{
  key: keyof WarehouseLayers;
  label: string;
  hint: string;
  Icon: typeof IconUsers;
}> = [
  { key: 'load', label: 'Загрузка', hint: 'тепловая карта зон', Icon: IconBox },
  { key: 'employees', label: 'Сотрудники', hint: 'люди на схеме', Icon: IconUsers },
  { key: 'equipment', label: 'Техника', hint: 'погрузчики и фуры', Icon: IconTruck },
  { key: 'incidents', label: 'Инциденты', hint: 'активные проблемы', Icon: IconAlert },
  { key: 'routes', label: 'Маршруты', hint: 'путь до объекта', Icon: IconRoute },
  { key: 'flow', label: 'Поток товаров', hint: 'этапы обработки', Icon: IconTask },
];

export function WarehouseLayersControl({
  layers,
  onToggle,
  offsetClassName = 'left-[152px]',
}: {
  layers: WarehouseLayers;
  onToggle: (key: keyof WarehouseLayers) => void;
  offsetClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeCount = Object.values(layers).filter(Boolean).length;

  return (
    <div ref={ref} className={`absolute top-3 z-30 ${offsetClassName}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)]/95 px-2.5 text-[10px] font-medium text-[var(--muted)] shadow-sm backdrop-blur transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
        title="Слои карты"
      >
        <IconLayers className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Слои</span>
        <span className="rounded-full bg-[var(--accent-soft-2)] px-1 text-[8px] font-semibold text-[var(--accent)]">
          {activeCount}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="fixed inset-x-3 top-[58px] z-[80] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-xl shadow-[#2a0f3a]/15 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1.5 sm:w-64"
        >
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-soft)]">
              Слои карты
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)] sm:hidden"
              aria-label="Закрыть слои"
            >
              <IconClose className="h-3 w-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 sm:grid-cols-1">
            {LAYER_ITEMS.map(({ key, label, hint, Icon }) => {
              const enabled = layers[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={enabled}
                  onClick={() => onToggle(key)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                    enabled
                      ? 'border-[var(--accent-line)] bg-[var(--accent-soft)]'
                      : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      enabled
                        ? 'border-[var(--accent-line-2)] bg-[var(--surface)] text-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-soft)]'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-medium text-[var(--text)]">{label}</span>
                    <span className="block truncate text-[8px] text-[var(--muted)]">{hint}</span>
                  </span>
                  <span
                    className={`h-3.5 w-6 shrink-0 rounded-full p-0.5 transition ${
                      enabled ? 'bg-[var(--accent)]' : 'bg-[var(--surface-muted)]'
                    }`}
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full bg-white transition ${
                        enabled ? 'translate-x-2.5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {layers.load ? (
            <div className="mt-2 border-t border-[var(--line-soft)] px-1 pt-2">
              <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                Загрузка зоны
              </div>
              <div className="mt-1 flex items-center gap-1">
                {[35, 58, 76, 92].map((load) => {
                  const heat = loadHeat(load);
                  return (
                    <span
                      key={load}
                      className="flex-1 rounded-sm py-0.5 text-center text-[7px] font-medium text-white"
                      style={{ backgroundColor: heat.color }}
                      title={`${load}% · ${heat.label}`}
                    >
                      {load}%
                    </span>
                  );
                })}
              </div>
              <p className="mt-1 text-[8px] leading-snug text-[var(--muted-soft)]">
                Тепловая карта показывает загрузку зон; порог 85% выделен красным.
              </p>
            </div>
          ) : null}

          <p className="mt-2 border-t border-[var(--line-soft)] px-1 pt-1.5 text-[8px] leading-snug text-[var(--muted-soft)]">
            Слои меняют только отображение демо-схемы и не влияют на данные.
          </p>
        </div>
      ) : null}
    </div>
  );
}
