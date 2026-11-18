// lib/simulator.ts
import { ECONOMY_TARIFFS } from '@/constants/economics';
import { HUBS } from '@/constants/hubs';
import { computeHubPerformance, type HubPerformance } from '@/lib/networkMetrics';
import type { Hub } from '@/types/logistics';
import type { Incident } from '@/types/operations';

export interface SimulatorInput {
  hubId: string;
  /** Дополнительная загрузка выбранного РЦ, процентных пунктов. */
  overloadPct: number;
  /** Сколько сотрудников смены недоступно. */
  staffShortage: number;
  /** Сколько единиц техники выведено из строя. */
  equipmentBreakdown: number;
  /** Дополнительная задержка рейсов, минут. */
  tripDelayMin: number;
  /** Какая доля потока перераспределяется на соседний РЦ, процентных пунктов. */
  redistributionPct: number;
}

export interface SimulatorSide {
  load: number;
  throughput: number;
  sla: number;
  ordersPerDay: number;
  dailyCost: number;
  costPerOrder: number;
  waitMin: number;
  tripsPerDay: number;
}

export interface SimulatorResult {
  hub: Hub;
  alternativeHub: Hub | null;
  before: SimulatorSide;
  after: SimulatorSide;
  risks: string[];
  recommendations: string[];
  assumptions: string[];
  riskLevel: 'stable' | 'attention' | 'critical';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sideFrom(base: HubPerformance, overrides?: Partial<SimulatorSide>): SimulatorSide {
  return {
    load: base.load,
    throughput: base.throughput,
    sla: base.sla,
    ordersPerDay: base.ordersPerDay,
    dailyCost: base.dailyCost,
    costPerOrder: base.costPerOrder,
    waitMin: Math.max(0, Math.round((base.load - 55) * 0.9 + base.idleHours * 1.8)),
    tripsPerDay: base.tripsPerDay,
    ...overrides,
  };
}

export function runSimulation(input: SimulatorInput, incidents: Incident[]): SimulatorResult {
  const hub = HUBS.find((item) => item.id === input.hubId) ?? HUBS[0];
  const alternativeHub =
    [...HUBS]
      .filter((item) => item.id !== hub.id)
      .sort((a, b) => a.load - b.load)[0] ?? null;

  const beforeBase = computeHubPerformance(hub, incidents);
  const before = sideFrom(beforeBase);

  const afterLoad = clamp(Math.round(hub.load + input.overloadPct - input.redistributionPct), 0, 140);
  const afterBase = computeHubPerformance(hub, incidents, afterLoad);

  const staffFactor = 1 - input.staffShortage * 0.025;
  const equipmentFactor = 1 - input.equipmentBreakdown * 0.04;
  const delayFactor = 1 - Math.min(0.2, input.tripDelayMin / 600);
  const throughputAfter = Math.max(
    0,
    Math.round(afterBase.throughput * Math.max(0.35, staffFactor) * Math.max(0.35, equipmentFactor) * delayFactor),
  );
  const ordersAfter = Math.round(throughputAfter * 7.5 * ECONOMY_TARIFFS.ordersPerPallet);
  const slaAfter = clamp(
    afterBase.sla -
      input.staffShortage * 0.45 -
      input.equipmentBreakdown * 1.1 -
      input.tripDelayMin * 0.035 -
      Math.max(0, afterLoad - 85) * 0.08,
    55,
    99.6,
  );
  const waitAfter = Math.max(
    0,
    Math.round((before.waitMin + (afterLoad - before.load) * 1.4 + input.staffShortage * 4 + input.equipmentBreakdown * 7 + input.tripDelayMin * 0.35) * 10) / 10,
  );

  const idleHoursAfter =
    afterBase.idleHours + input.staffShortage * 0.25 + input.equipmentBreakdown * 1.5 + input.tripDelayMin / 60;
  const idleCostAfter = idleHoursAfter * ECONOMY_TARIFFS.idleHour;
  const delayCost = input.tripDelayMin * afterBase.tripsPerDay * (ECONOMY_TARIFFS.idleHour / 60);
  const staffCost = input.staffShortage * 8 * 2_500;
  const equipmentCost = input.equipmentBreakdown * 12_000;
  const dailyCostAfter = Math.round(
    afterBase.tripsPerDay * afterBase.tripCost +
      idleCostAfter +
      ordersAfter * ECONOMY_TARIFFS.orderProcessing +
      afterBase.overhead +
      afterBase.incidentLoss +
      delayCost +
      staffCost +
      equipmentCost,
  );

  const after: SimulatorSide = {
    load: afterLoad,
    throughput: throughputAfter,
    sla: Math.round(slaAfter * 10) / 10,
    ordersPerDay: ordersAfter,
    dailyCost: dailyCostAfter,
    costPerOrder: Math.round(dailyCostAfter / Math.max(1, ordersAfter)),
    waitMin: waitAfter,
    tripsPerDay: afterBase.tripsPerDay,
  };

  const risks: string[] = [];
  if (after.load >= 95) risks.push(`Загрузка ${after.load}%: очередь на доки и риск остановки приёмки.`);
  else if (after.load >= 85) risks.push(`Загрузка ${after.load}%: зона работает выше комфортного порога.`);
  if (after.sla < 90) risks.push(`SLA падает до ${after.sla}% — риск штрафов и эскалации.`);
  else if (after.sla < 94) risks.push(`SLA ${after.sla}%: ниже целевого уровня, нужен контроль окон доставки.`);
  if (input.staffShortage > 0) {
    risks.push(`Нехватка ${input.staffShortage} сотрудников: обработка замедляется, очередь растёт.`);
  }
  if (input.equipmentBreakdown > 0) {
    risks.push(`Выведено из строя ${input.equipmentBreakdown} ед. техники: часть операций придётся перевести вручную.`);
  }
  if (input.tripDelayMin > 30) {
    risks.push(`Задержка ${input.tripDelayMin} мин: приоритетные рейсы могут выйти за окно SLA.`);
  }
  if (throughputAfter < before.throughput * 0.8) {
    risks.push(
      `Пропускная способность падает на ${Math.round((1 - throughputAfter / Math.max(1, before.throughput)) * 100)}%.`,
    );
  }
  if (risks.length === 0) risks.push('Критических рисков не выявлено: сценарий близок к текущему режиму.');

  const recommendations: string[] = [];
  if (input.overloadPct > input.redistributionPct && alternativeHub) {
    recommendations.push(
      `Перераспределить до ${Math.min(25, Math.max(5, input.overloadPct - input.redistributionPct))}% потока на ${alternativeHub.name}: там загрузка ${alternativeHub.load}%.`,
    );
  }
  if (input.staffShortage > 0) {
    recommendations.push(
      `Вывести ${Math.min(6, Math.ceil(input.staffShortage / 2))} сотрудников резерва или продлить окно приёмки на ${Math.round(input.staffShortage * 10 + 15)} минут.`,
    );
  }
  if (input.equipmentBreakdown > 0) {
    recommendations.push(
      `Перевести ${input.equipmentBreakdown} ед. техники в резерв и перераспределить ${input.equipmentBreakdown * 8}% операций на соседние зоны.`,
    );
  }
  if (input.tripDelayMin > 20) {
    recommendations.push(
      `Сдвинуть окна ${Math.max(1, Math.round(input.tripDelayMin / 30))} приоритетных рейсов и предупредить получателей.`,
    );
  }
  if (input.redistributionPct >= 10) {
    recommendations.push(
      `Закрепить перераспределение ${input.redistributionPct}% потока на ${alternativeHub?.name ?? 'соседний РЦ'} до стабилизации загрузки.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('Оставить текущий режим и контролировать загрузку по порогу 85%.');
  }

  const riskLevel: SimulatorResult['riskLevel'] =
    after.sla < 90 || after.load >= 95 ? 'critical' : after.sla < 94 || after.load >= 85 || risks.length > 2 ? 'attention' : 'stable';

  return {
    hub,
    alternativeHub,
    before,
    after,
    risks,
    recommendations,
    riskLevel,
    assumptions: [
      'Дополнительная загрузка прибавляется к текущей загрузке выбранного РЦ, перераспределение вычитается.',
      'Пропускная способность: базовая модель РЦ × поправка на нехватку сотрудников (−2,5% за человека) × поправка на технику (−4% за единицу) × поправка на задержку рейсов.',
      'SLA: базовая SLA − 0,45 п.п. за сотрудника − 1,1 п.п. за единицу техники − 0,035 п.п. за минуту задержки − штраф за загрузку выше 85%.',
      'Стоимость: рейсы + простой + обработка заказов + накладные + потери от инцидентов + задержки + резерв staff/техники.',
      'Все коэффициенты демонстрационные. Симуляция не записывает данные в основную систему.',
    ],
  };
}
