// types/logistics.ts
export interface Hub {
  id: string;
  name: string;
  lat: number;
  lng: number;
  coords: [number, number];
}

export interface ActiveRisk {
  type?: string; // Добавляем поле type (сделайте обязательным 'type: string', если оно есть у всех рисков)
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface AiAnalyticsResult {
  distanceKm: number;
  estimatedHours: number;
  optimalSpeedKmh: number;
  weatherWarning?: string;
  riskScore: number;
  fuelConsumptionLitres: number;
  co2EmissionsKg: number;
  recommendation: string;
  activeRisks: ActiveRisk[];
}
export interface ActiveShipment {
  id: string;
  fromName: string;
  toName: string;
  isPriority: boolean;
  statusText: string;
  progress: number;
  routeCoords: [number, number][]; // Координаты пути
  currentPos: [number, number];   // Текущая точка на карте
}