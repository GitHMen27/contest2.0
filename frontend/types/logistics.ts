// types/logistics.ts

export type HubStatus = 'optimal' | 'warning' | 'critical';

export interface Hub {
  id: string;
  name: string;
  city: string;
  coords: [number, number];
  status: HubStatus;
  load: number;
  /** Активная точка: подсвечивается на карте и открывает меню действий. */
  isActive?: boolean;
  /** Публичный сайт точки. */
  siteUrl?: string;
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

/** similarity: оценка схожести 0..1 (локальная демо-база); rrf: ранг после слияния поисков, процентом не показывается. */
export type SourceScoreKind = 'similarity' | 'rrf';

export interface AiSource {
  id: string;
  doc: string;
  section: string;
  excerpt: string;
  score: number;
  via: RetrievalChannel[];
  scoreKind?: SourceScoreKind;
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

/** live: ответ настоящего бэкенда; demo: локальная демо-база; error: бэкенд вернул понятную ошибку (например, лимит запросов). */
export type ChatOrigin = 'live' | 'demo' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: AiSource[];
  latencyMs?: number;
  origin?: ChatOrigin;
  /** Пояснение под ответом, например почему показан ответ из локальной базы. */
  note?: string;
  /** Ответ «в регламентах нет ответа»: рисуется отдельным стилем, без источников. */
  refusal?: boolean;
  /** Варианты вопросов (1–4): рисуются кнопками под сообщением, как стартовые подсказки. */
  suggestions?: string[];
}
