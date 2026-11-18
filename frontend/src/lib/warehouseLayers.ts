// lib/warehouseLayers.ts
import type { WarehouseLayers } from '@/types/warehouse';

/** Все слои включены по умолчанию: так демо сразу показывает возможности карты. */
export const DEFAULT_WAREHOUSE_LAYERS: WarehouseLayers = {
  load: true,
  employees: true,
  equipment: true,
  incidents: true,
  routes: true,
  flow: true,
};

export interface LoadHeat {
  color: string;
  fill: string;
  label: string;
}

export function loadHeat(load: number): LoadHeat {
  if (load >= 85) {
    return {
      color: '#e11d48',
      fill: 'rgba(225, 29, 72, 0.26)',
      label: 'критическая',
    };
  }
  if (load >= 70) {
    return {
      color: '#ea580c',
      fill: 'rgba(234, 88, 12, 0.23)',
      label: 'высокая',
    };
  }
  if (load >= 50) {
    return {
      color: '#d97706',
      fill: 'rgba(217, 119, 6, 0.18)',
      label: 'рабочая',
    };
  }
  return {
    color: '#059669',
    fill: 'rgba(5, 150, 105, 0.14)',
    label: 'низкая',
  };
}

export function isZoneLoadVisible(zoneId: string): boolean {
  return zoneId !== 'corridors';
}

export function toggleLayer(
  layers: WarehouseLayers,
  key: keyof WarehouseLayers,
): WarehouseLayers {
  return { ...layers, [key]: !layers[key] };
}
