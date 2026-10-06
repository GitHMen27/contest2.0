import { Hub, AiAnalyticsResult } from '@/types/logistics';

export function calculateAiAnalytics(from: Hub, to: Hub): AiAnalyticsResult {
  // Расчет расстояния по формуле гаверсинусов (в км)
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = Math.round(R * c * 1.25); // +25% на изгибы дорог

  const estimatedHours = Math.round((distanceKm / 70) * 10) / 10;
  const fuelConsumptionLitres = Math.round(distanceKm * 0.32); // ~32л / 100км
  const co2EmissionsKg = Math.round(fuelConsumptionLitres * 2.68); // ~2.68кг CO2 на литр солярки

  const riskScore = Math.min(85, Math.max(12, Math.round(((distanceKm / 30) % 60) + 15)));

  return {
    distanceKm, // <--- Добавлено обязательно
    optimalSpeedKmh: 70, // <--- Добавлено обязательно
    riskScore,
    estimatedHours,
    fuelConsumptionLitres,
    co2EmissionsKg,
    recommendation:
      distanceKm > 700
        ? `Маршрут длинный (${distanceKm} км). Рекомендуется запланировать смену водителя в районе середины пути и выезжать в ночное время для обхода трафика.`
        : `Маршрут оптимален (${distanceKm} км). Задержек по метеоусловиям не прогнозируется.`,
    activeRisks:
      distanceKm > 700
        ? [
            {
              type: 'traffic',
              severity: 'medium',
              message: 'Возможны плотные заторы на объездных участках крупных городов.',
            },
          ]
        : [],
  };
}