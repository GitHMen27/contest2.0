// constants/economics.ts
import type { IncidentSeverity } from '@/types/operations';

/** Демонстрационные тарифы. Не являются коммерческими данными компании. */
export const ECONOMY_TARIFFS = {
  fuelPricePerLitre: 62,
  fuelLitresPer100Km: 32,
  driverHourly: 850,
  tollPerKm: 4.5,
  idleHour: 1200,
  orderProcessing: 45,
  hubOverheadPerDay: 145_000,
  averageSpeedKmh: 55,
  loadingHours: 2,
  ordersPerPallet: 2.2,
} as const;

export const INCIDENT_LOSS: Record<IncidentSeverity, number> = {
  critical: 180_000,
  high: 90_000,
  medium: 30_000,
  low: 8_000,
};

export interface HubOperations {
  docks: number;
  note: string;
}

/** Демо-параметры РЦ: количество доков и пояснение к расчёту. */
export const HUB_OPERATIONS: Record<string, HubOperations> = {
  koledino: { docks: 16, note: 'крупнейший хаб московского кластера' },
  elektrostal: { docks: 12, note: 'высокая доля приёмки' },
  shushary: { docks: 14, note: 'активный цифровой двойник' },
  kazan: { docks: 12, note: 'распределение на Поволжье' },
  krasnodar: { docks: 12, note: 'пиковая южная отгрузка' },
  ekaterinburg: { docks: 10, note: 'магистральное плечо на Урал' },
};

export const ECONOMY_ASSUMPTIONS = [
  'Стоимость рейса = топливо + оплата водителя + платные участки.',
  'Топливо: расстояние × 32 л / 100 км × 62 ₽/л.',
  'Время водителя: расстояние / 55 км/ч + 2 часа на погрузку, ставка 850 ₽/ч.',
  'Простой техники: часы простоя × 1 200 ₽/ч.',
  'Обработка заказа: количество заказов × 45 ₽.',
  'Потери от инцидентов: фиксированная демо-оценка по приоритету.',
  'Накладные расходы РЦ: 145 000 ₽ в сутки на точку.',
];
