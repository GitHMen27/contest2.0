// types/logistics.ts

export type HubStatus = 'optimal' | 'warning' | 'critical';

export interface Hub {
  id: string;
  name: string;
  city: string;
  coords: [number, number];
  status: HubStatus;
  load: number;
}

export interface ActiveRisk {
  type?: string;
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
  ruleSources: string[];
}

export interface ActiveShipment {
  id: string;
  fromName: string;
  toName: string;
  isPriority: boolean;
  statusText: string;
  progress: number;
  routeCoords: [number, number][];
  currentPos: [number, number];
}

export type RetrievalChannel = 'vector' | 'fts';

export interface AiSource {
  id: string;
  doc: string;
  section: string;
  excerpt: string;
  score: number;
  via: RetrievalChannel[];
}

export interface DemoAnswer {
  id: string;
  question: string;
  answer: string;
  sources: AiSource[];
  latencyMs: number;
  keywords: string[];
  pipeline: {
    vectorHits: number;
    ftsHits: number;
    fused: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: AiSource[];
  latencyMs?: number;
}
