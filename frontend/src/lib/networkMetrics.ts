// lib/networkMetrics.ts
import { ECONOMY_TARIFFS, HUB_OPERATIONS, INCIDENT_LOSS } from '@/constants/economics';
import { HUBS } from '@/constants/hubs';
import type { Hub } from '@/types/logistics';
import type { Incident } from '@/types/operations';

const MOSCOW: [number, number] = [55.7558, 37.6173];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function routeKmFromMoscow(hub: Hub): number {
  return Math.max(180, Math.round(haversineKm(MOSCOW, hub.coords) * 1.12 + 90));
}

export interface HubPerformance {
  hub: Hub;
  load: number;
  throughput: number;
  sla: number;
  tripsPerDay: number;
  ordersPerDay: number;
  routeKm: number;
  tripCost: number;
  fuelCost: number;
  driverCost: number;
  idleHours: number;
  idleCost: number;
  orderCost: number;
  overhead: number;
  incidentLoss: number;
  openIncidents: number;
  dailyCost: number;
  costPerOrder: number;
}

export function computeHubPerformance(
  hub: Hub,
  incidents: Incident[],
  loadOverride?: number,
): HubPerformance {
  const ops = HUB_OPERATIONS[hub.id] ?? { docks: 10, note: 'демо-параметр' };
  const load = clamp(Math.round(loadOverride ?? hub.load), 0, 140);
  const utilization = clamp(load / 100, 0.2, 1.1);
  const baseCapacity = ops.docks * 5.6;
  const congestion = load > 92 ? 0.92 : 1;
  const throughput = Math.round(baseCapacity * (0.45 + utilization * 0.6) * congestion);
  const statusPenalty = hub.status === 'critical' ? 6 : hub.status === 'warning' ? 1.5 : 0;
  const sla = clamp(99.5 - Math.max(0, load - 55) * 0.18 - statusPenalty, 80, 99.6);
  const tripsPerDay = Math.max(1, Math.round(ops.docks * 1.25 * (load / 100)));
  const ordersPerDay = Math.round(throughput * 7.5 * ECONOMY_TARIFFS.ordersPerPallet);

  const routeKm = routeKmFromMoscow(hub);
  const fuelCost = routeKm * (ECONOMY_TARIFFS.fuelLitresPer100Km / 100) * ECONOMY_TARIFFS.fuelPricePerLitre;
  const driverHours = routeKm / ECONOMY_TARIFFS.averageSpeedKmh + ECONOMY_TARIFFS.loadingHours;
  const driverCost = driverHours * ECONOMY_TARIFFS.driverHourly;
  const tripCost = Math.round(
    fuelCost + driverCost + routeKm * ECONOMY_TARIFFS.tollPerKm,
  );

  const idleHours = Math.round(1.5 + ops.docks * 0.12 + (load > 85 ? 4 : 0));
  const idleCost = idleHours * ECONOMY_TARIFFS.idleHour;
  const orderCost = ordersPerDay * ECONOMY_TARIFFS.orderProcessing;
  const overhead = ECONOMY_TARIFFS.hubOverheadPerDay;
  const hubIncidents = incidents.filter((incident) => incident.hubId === hub.id);
  const incidentLoss = hubIncidents.reduce((sum, incident) => sum + INCIDENT_LOSS[incident.severity], 0);
  const dailyCost = tripsPerDay * tripCost + idleCost + orderCost + overhead + incidentLoss;

  return {
    hub,
    load,
    throughput,
    sla: Math.round(sla * 10) / 10,
    tripsPerDay,
    ordersPerDay,
    routeKm,
    tripCost,
    fuelCost: Math.round(fuelCost),
    driverCost: Math.round(driverCost),
    idleHours,
    idleCost,
    orderCost,
    overhead,
    incidentLoss,
    openIncidents: hubIncidents.filter((incident) => incident.status !== 'resolved').length,
    dailyCost,
    costPerOrder: Math.round(dailyCost / Math.max(1, ordersPerDay)),
  };
}

export interface NetworkPerformance {
  hubs: HubPerformance[];
  load: number;
  throughput: number;
  sla: number;
  dailyCost: number;
  costPerOrder: number;
  ordersPerDay: number;
  tripsPerDay: number;
  openIncidents: number;
  criticalHubs: number;
  incidentLoss: number;
}

export function computeNetworkPerformance(incidents: Incident[]): NetworkPerformance {
  const hubs = HUBS.map((hub) => computeHubPerformance(hub, incidents));
  const throughput = hubs.reduce((sum, item) => sum + item.throughput, 0);
  const ordersPerDay = hubs.reduce((sum, item) => sum + item.ordersPerDay, 0);
  const dailyCost = hubs.reduce((sum, item) => sum + item.dailyCost, 0);
  const sla = hubs.reduce((sum, item) => sum + item.sla * item.throughput, 0) / Math.max(1, throughput);
  return {
    hubs,
    load: Math.round(hubs.reduce((sum, item) => sum + item.load, 0) / Math.max(1, hubs.length)),
    throughput,
    sla: Math.round(sla * 10) / 10,
    dailyCost,
    costPerOrder: Math.round(dailyCost / Math.max(1, ordersPerDay)),
    ordersPerDay,
    tripsPerDay: hubs.reduce((sum, item) => sum + item.tripsPerDay, 0),
    openIncidents: incidents.filter((incident) => incident.status !== 'resolved').length,
    criticalHubs: HUBS.filter((hub) => hub.status === 'critical').length,
    incidentLoss: hubs.reduce((sum, item) => sum + item.incidentLoss, 0),
  };
}
