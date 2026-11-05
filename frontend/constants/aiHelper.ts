import type { ActiveRisk, AiAnalyticsResult, Hub } from '@/types/logistics';

const EARTH_RADIUS_KM = 6371;

function haversineKm(from: Hub, to: Hub): number {
  const [fromLat, fromLng] = from.coords;
  const [toLat, toLng] = to.coords;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Демо-модель риска. Считает расстояние по гаверсинусу и применяет пороги
 * из корпуса регламентов: 700 км, 9 часов управления, загрузка РЦ 90%.
 */
export function calculateAiAnalytics(from: Hub, to: Hub): AiAnalyticsResult {
  const distanceKm = Math.round(haversineKm(from, to) * 1.25); // +25% на изгибы дорог
  const drivingHours = distanceKm / 70;
  const breaks = Math.floor(distanceKm / 700);
  const estimatedHours = Math.round((drivingHours + breaks * 0.75) * 10) / 10;
  const fuelConsumptionLitres = Math.round(distanceKm * 0.32);
  const co2EmissionsKg = Math.round(fuelConsumptionLitres * 2.68);

  const averageLoad = (from.load + to.load) / 2;
  const loadRisk = Math.max(0, averageLoad - 55) * 0.65;
  const distanceRisk = Math.min(32, distanceKm / 45);
  const weatherRisk = distanceKm > 1200 ? 12 : 4;
  const riskScore = Math.round(clamp(loadRisk + distanceRisk + weatherRisk, 8, 94));

  const risks: ActiveRisk[] = [];
  const ruleSources = new Set<string>(['01_driver_hours.md']);

  if (distanceKm > 700) {
    risks.push({
      type: 'driver-hours',
      severity: 'medium',
      message: 'Рейс длиннее 700 км: нужен второй водитель или ночёвка в пути.',
    });
  }
  if (drivingHours > 9) {
    risks.push({
      type: 'driving-time',
      severity: 'high',
      message: 'Расчётное управление больше 9 часов: обязательна смена водителя.',
    });
  }
  if (from.status === 'critical' || to.status === 'critical') {
    risks.push({
      type: 'hub-overload',
      severity: 'high',
      message: 'Один из РЦ в статусе critical: плановые рейсы не отправляются.',
    });
    ruleSources.add('03_sla_delays.md');
  } else if (from.status === 'warning' || to.status === 'warning') {
    risks.push({
      type: 'hub-load',
      severity: 'medium',
      message: 'РЦ в статусе warning: сократите долю плановых рейсов.',
    });
    ruleSources.add('03_sla_delays.md');
  }
  if (distanceKm > 1200) {
    risks.push({
      type: 'weather',
      severity: 'medium',
      message: 'Длинное плечо: учтите погодные ограничения и обновите ETA.',
    });
    ruleSources.add('05_bad_weather.md');
  }
  if (risks.length === 0) {
    risks.push({
      type: 'clear',
      severity: 'low',
      message: 'Ограничений по ключевым регламентам не найдено.',
    });
  }

  const recommendations: string[] = [];
  if (distanceKm > 700) {
    recommendations.push('запланировать второго водителя или остановку на отдых');
  }
  if (drivingHours > 9) {
    recommendations.push('заложить смену водителя, а не одну непрерывную поездку');
  }
  if (to.status === 'critical') {
    recommendations.push('не отправлять плановый рейс до снижения загрузки РЦ ниже 85%');
  } else if (to.status === 'warning') {
    recommendations.push('сократить долю плановых рейсов на РЦ назначения');
  }

  const recommendation =
    recommendations.length > 0
      ? `Рекомендация: ${recommendations.join('; ')}.`
      : 'Маршрут в пределах нормы: ограничений по регламентам нет.';

  return {
    distanceKm,
    optimalSpeedKmh: 70,
    riskScore,
    estimatedHours,
    fuelConsumptionLitres,
    co2EmissionsKg,
    recommendation,
    activeRisks: risks,
    ruleSources: Array.from(ruleSources),
  };
}
