'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { HUBS, getHub } from '@/constants/hubs';
import { calculateAiAnalytics } from '@/constants/aiHelper';
import {
  SCENARIOS,
  SUGGESTED_QUESTIONS,
  findDemoAnswer,
  type DemoScenario,
} from '@/constants/demoKnowledge';
import { AiAnalyticsCard } from '@/components/AiAnalyticsCard';
import { AiAssistant } from '@/components/AiAssistant';
import { HowItWorksModal } from '@/components/HowItWorksModal';
import { LiveFeed } from '@/components/LiveFeed';
import { KpiOverlay } from '@/components/KpiOverlay';
import { ScenarioPicker } from '@/components/ScenarioPicker';
import type { ActiveShipment, ChatMessage, HubStatus } from '@/types/logistics';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#070b14]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500/20 border-t-purple-400" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          инициализация карты
        </span>
      </div>
    </div>
  ),
});

type RouteStatus = 'ready' | 'loading' | 'in_transit' | 'delivered' | 'error';

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Я демо-версия RAG-помощника. Отвечаю по 9 регламентам логистики и показываю источники. Выберите сценарий слева или задайте вопрос — например, про отдых водителя или перегрузку РЦ.',
};

const HUB_DOT: Record<HubStatus, string> = {
  optimal: 'bg-emerald-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-400',
};

/**
 * Резервная геометрия, если OSRM недоступен на площадке.
 * Демо продолжает работать: маршрут, анимация и карта остаются живыми.
 */
function buildFallbackRoute(
  startCoords: [number, number],
  endCoords: [number, number],
): [number, number][] {
  const points = 36;
  return Array.from({ length: points }, (_, index) => {
    const t = index / (points - 1);
    const curve = Math.sin(Math.PI * t) * 0.16;
    return [
      startCoords[0] + (endCoords[0] - startCoords[0]) * t + curve,
      startCoords[1] + (endCoords[1] - startCoords[1]) * t + curve * 0.35,
    ];
  });
}

export default function Home() {
  const [fromHub, setFromHub] = useState(HUBS[0].id);
  const [toHub, setToHub] = useState(HUBS[3].id);
  const [status, setStatus] = useState<RouteStatus>('ready');
  const [statusText, setStatusText] = useState('Система готова');

  const [activeRoute, setActiveRoute] = useState<[number, number][] | null>(null);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(null);
  const [trackNumber, setTrackNumber] = useState<string | null>(null);
  const [shipmentFeed, setShipmentFeed] = useState<ActiveShipment[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [clock, setClock] = useState('');

  const animFrameRef = useRef<number | null>(null);
  const bgAnimFrameRef = useRef<number | null>(null);
  const answerTimerRef = useRef<number | null>(null);

  const startHubObj = useMemo(() => getHub(fromHub) ?? null, [fromHub]);
  const endHubObj = useMemo(() => getHub(toHub) ?? null, [toHub]);

  const aiAnalytics = useMemo(() => {
    if (!startHubObj || !endHubObj || startHubObj.id === endHubObj.id) return null;
    return calculateAiAnalytics(startHubObj, endHubObj);
  }, [startHubObj, endHubObj]);

  const activeCount = shipmentFeed.length;
  const networkLoad = Math.round(HUBS.reduce((sum, hub) => sum + hub.load, 0) / HUBS.length);
  const criticalHubs = HUBS.filter((hub) => hub.status === 'critical').length;

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };
    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAnimation();
      if (bgAnimFrameRef.current !== null) cancelAnimationFrame(bgAnimFrameRef.current);
      if (answerTimerRef.current !== null) window.clearTimeout(answerTimerRef.current);
    };
  }, [stopAnimation]);

  const fetchRouteCoords = useCallback(
    async (startCoords: [number, number], endCoords: [number, number]): Promise<[number, number][] | null> => {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`,
        );
        if (!response.ok) return buildFallbackRoute(startCoords, endCoords);
        const data = (await response.json()) as {
          routes?: { geometry: { coordinates: [number, number][] } }[];
        };
        const route = data.routes?.[0];
        if (!route) return buildFallbackRoute(startCoords, endCoords);
        return route.geometry.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
      } catch {
        return buildFallbackRoute(startCoords, endCoords);
      }
    },
    [],
  );

  const startRoute = useCallback(
    async (fromId: string, toId: string): Promise<boolean> => {
      if (fromId === toId) {
        setStatus('error');
        setStatusText('Выберите разные РЦ');
        return false;
      }

      const start = getHub(fromId);
      const end = getHub(toId);
      if (!start || !end) return false;

      stopAnimation();
      setStatus('loading');
      setStatusText('Построение маршрута…');

      const track = `WB-PRIORITY-${Math.floor(1000 + Math.random() * 9000)}`;
      setTrackNumber(track);

      const coords = await fetchRouteCoords(start.coords, end.coords);
      if (!coords) {
        setStatus('error');
        setStatusText('Маршрут не найден');
        return false;
      }

      setActiveRoute(coords);
      setTruckPosition(coords[0]);
      setStatus('in_transit');
      setStatusText('В пути · приоритет');

      const priorityShipment: ActiveShipment = {
        id: track,
        fromName: start.name,
        toName: end.name,
        isPriority: true,
        statusText: 'В пути · приоритет',
        progress: 0,
        currentPos: coords[0],
        routeCoords: coords,
      };

      setShipmentFeed((previous) => [
        priorityShipment,
        ...previous.filter((shipment) => !shipment.isPriority).slice(0, 3),
      ]);

      const duration = 16000;
      let startedAt: number | null = null;

      const animate = (time: number) => {
        if (startedAt === null) startedAt = time;
        const progress = Math.min((time - startedAt) / duration, 1);
        const index = Math.floor(progress * (coords.length - 1));
        const currentCoord = coords[index];

        setShipmentFeed((previous) =>
          previous.flatMap((shipment) => {
            if (shipment.id !== track) return [shipment];
            if (progress >= 1) return [];
            return [
              {
                ...shipment,
                progress: Math.floor(progress * 100),
                statusText: 'В пути · приоритет',
                currentPos: currentCoord,
              },
            ];
          }),
        );

        if (progress < 1) {
          setTruckPosition(currentCoord);
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setTruckPosition(null);
          setActiveRoute(null);
          setStatus('delivered');
          setStatusText('Доставлен');
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
      return true;
    },
    [fetchRouteCoords, stopAnimation],
  );

  useEffect(() => {
    let lastTime = performance.now();

    const updatePositions = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.12);
      lastTime = now;

      setShipmentFeed((previous) => {
        let changed = false;
        const updated = previous.flatMap((shipment) => {
          if (shipment.isPriority || shipment.routeCoords.length === 0) return [shipment];

          const newProgress = shipment.progress + (100 / 25) * delta;
          if (newProgress >= 100) {
            changed = true;
            return [];
          }

          const index = Math.floor((newProgress / 100) * (shipment.routeCoords.length - 1));
          changed = true;
          return [
            {
              ...shipment,
              progress: newProgress,
              currentPos: shipment.routeCoords[index],
              statusText: 'В пути',
            },
          ];
        });

        return changed ? updated : previous;
      });

      bgAnimFrameRef.current = requestAnimationFrame(updatePositions);
    };

    bgAnimFrameRef.current = requestAnimationFrame(updatePositions);
    return () => {
      if (bgAnimFrameRef.current !== null) cancelAnimationFrame(bgAnimFrameRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const spawnBackgroundShipment = async () => {
      const randomFrom = HUBS[Math.floor(Math.random() * HUBS.length)];
      let randomTo = HUBS[Math.floor(Math.random() * HUBS.length)];
      while (randomTo.id === randomFrom.id) {
        randomTo = HUBS[Math.floor(Math.random() * HUBS.length)];
      }

      const routeCoords = await fetchRouteCoords(randomFrom.coords, randomTo.coords);
      if (!routeCoords || cancelled) return;

      const autoShipment: ActiveShipment = {
        id: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
        fromName: randomFrom.name,
        toName: randomTo.name,
        isPriority: false,
        statusText: 'В пути',
        progress: 0,
        currentPos: routeCoords[0],
        routeCoords,
      };

      setShipmentFeed((previous) => {
        const priority = previous.filter((shipment) => shipment.isPriority);
        const background = previous.filter((shipment) => !shipment.isPriority).slice(0, 3);
        return [...priority, autoShipment, ...background];
      });
    };

    void spawnBackgroundShipment();
    const interval = window.setInterval(() => void spawnBackgroundShipment(), 9000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchRouteCoords]);

  const ask = useCallback((question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    setMessages((previous) => [
      ...previous,
      { id: `user-${Date.now()}-${Math.random()}`, role: 'user', text: trimmed },
    ]);
    setIsTyping(true);

    if (answerTimerRef.current !== null) window.clearTimeout(answerTimerRef.current);
    const answer = findDemoAnswer(trimmed);

    answerTimerRef.current = window.setTimeout(
      () => {
        setMessages((previous) => [
          ...previous,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: answer.answer,
            sources: answer.sources,
            latencyMs: answer.latencyMs,
          },
        ]);
        setIsTyping(false);
      },
      Math.min(1300, Math.max(500, answer.latencyMs)),
    );
  }, []);

  const applyScenario = useCallback(
    (scenario: DemoScenario) => {
      setActiveScenario(scenario.id);
      setFromHub(scenario.fromHub);
      setToHub(scenario.toHub);
      void startRoute(scenario.fromHub, scenario.toHub);
      ask(scenario.question);
    },
    [ask, startRoute],
  );

  const handleStartRoute = () => {
    setActiveScenario(null);
    void startRoute(fromHub, toHub);
  };

  const handleFromChange = (id: string) => {
    setFromHub(id);
    setActiveScenario(null);
    if (id === toHub) {
      const fallback = HUBS.find((hub) => hub.id !== id);
      if (fallback) setToHub(fallback.id);
    }
  };

  const handleToChange = (id: string) => {
    setToHub(id);
    setActiveScenario(null);
  };

  const mapShipments = useMemo<ActiveShipment[]>(() => {
    return shipmentFeed.map((shipment) => {
      if (shipment.id === trackNumber && truckPosition && activeRoute) {
        return { ...shipment, currentPos: truckPosition, routeCoords: activeRoute };
      }
      return shipment;
    });
  }, [shipmentFeed, trackNumber, truckPosition, activeRoute]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050810] text-slate-100">
      <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-slate-950/85 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-tr from-purple-600 via-indigo-500 to-fuchsia-500 text-[11px] font-black text-white shadow-lg shadow-purple-600/30">
            WB
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-slate-950 bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-wide text-white">
                WB Logistics Command Center
              </h1>
              <span className="hidden rounded border border-purple-400/25 bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-purple-300 sm:inline">
                demo
              </span>
            </div>
            <p className="hidden truncate text-[10px] text-slate-500 sm:block">
              AI-диспетчер · карта, риск-анализ и RAG по регламентам
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1.5 md:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'error' ? 'bg-rose-400' : 'bg-emerald-400'
              } ${status === 'in_transit' ? 'animate-pulse' : ''}`}
            />
            <span className="max-w-[230px] truncate font-mono text-[9px] text-slate-400">
              {trackNumber ? `${trackNumber} · ${statusText}` : statusText}
            </span>
          </div>

          <div className="hidden text-right sm:block">
            <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">{clock}</div>
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">local time</div>
          </div>

          <button
            type="button"
            onClick={() => setShowTech(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] font-medium text-slate-300 transition hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-purple-200"
          >
            <span>⚙</span>
            <span className="hidden sm:inline">Как это работает</span>
            <span className="sm:hidden">RAG</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex h-[46vh] w-full shrink-0 flex-col gap-2.5 overflow-y-auto border-b border-white/5 bg-[#070b14] p-3 lg:h-auto lg:w-[390px] lg:border-b-0 lg:border-r xl:w-[420px]">
          <ScenarioPicker scenarios={SCENARIOS} activeId={activeScenario} onSelect={applyScenario} />

          <section className="shrink-0 rounded-2xl border border-white/8 bg-slate-900/50 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Диспетчерская
              </h2>
              <span className="flex items-center gap-1 text-[8px] text-emerald-400">
                <span className="h-1 w-1 rounded-full bg-emerald-400" /> OSRM live
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[9px] uppercase tracking-[0.14em] text-slate-500">Откуда</span>
                <select
                  value={fromHub}
                  onChange={(event) => handleFromChange(event.target.value)}
                  className="w-full cursor-pointer rounded-xl border border-white/10 bg-slate-950/70 px-2.5 py-2 text-[11px] text-slate-200 focus:border-purple-400/50 focus:outline-none"
                >
                  {HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name} · {hub.load}%
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[9px] uppercase tracking-[0.14em] text-slate-500">Куда</span>
                <select
                  value={toHub}
                  onChange={(event) => handleToChange(event.target.value)}
                  className="w-full cursor-pointer rounded-xl border border-white/10 bg-slate-950/70 px-2.5 py-2 text-[11px] text-slate-200 focus:border-purple-400/50 focus:outline-none"
                >
                  {HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id} disabled={hub.id === fromHub}>
                      {hub.name} · {hub.load}%
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {HUBS.map((hub) => (
                <span key={hub.id} className="flex items-center gap-1 text-[8px] text-slate-500">
                  <span className={`h-1 w-1 rounded-full ${HUB_DOT[hub.status]}`} />
                  {hub.name}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={handleStartRoute}
              disabled={status === 'loading'}
              className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 py-2.5 text-[11px] font-semibold text-white shadow-lg shadow-purple-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'loading' ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Построение маршрута…
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Запустить приоритетный рейс
                </>
              )}
            </button>
          </section>

          <AiAnalyticsCard
            analytics={aiAnalytics}
            isLoading={status === 'loading' && !aiAnalytics}
            onAsk={ask}
          />

          <section className="flex min-h-[240px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-950/60">
            <LiveFeed shipments={shipmentFeed} />
          </section>

          <section className="h-[440px] shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/60 lg:hidden">
            <AiAssistant
              messages={messages}
              isTyping={isTyping}
              suggestions={SUGGESTED_QUESTIONS}
              onAsk={ask}
              onOpenTech={() => setShowTech(true)}
            />
          </section>
        </aside>

        <main className="relative min-h-[44vh] flex-1 lg:min-h-0">
          <Map shipments={mapShipments} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] h-24 bg-linear-to-b from-slate-950/50 to-transparent" />

          <KpiOverlay
            activeShipments={activeCount}
            networkLoad={networkLoad}
            criticalHubs={criticalHubs}
            routeRisk={aiAnalytics?.riskScore ?? null}
          />

          <div className="absolute right-3 top-3 z-[1000] hidden h-[470px] max-h-[calc(100%_-_24px)] w-[320px] flex-col overflow-hidden rounded-2xl border border-purple-400/20 bg-slate-950/90 shadow-2xl shadow-black/50 backdrop-blur-xl lg:flex xl:h-[500px] xl:w-[360px]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-purple-400/60 to-transparent" />
            <AiAssistant
              messages={messages}
              isTyping={isTyping}
              suggestions={SUGGESTED_QUESTIONS}
              onAsk={ask}
              onOpenTech={() => setShowTech(true)}
            />
          </div>

          <div className="pointer-events-none absolute bottom-12 left-3 z-[1000] hidden w-[168px] rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-[9px] text-slate-400 shadow-xl backdrop-blur-xl sm:block">
            <div className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Слой сети
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> optimal
                </span>
                <span className="text-slate-600">&lt;70%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> warning
                </span>
                <span className="text-slate-600">70–90%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> critical
                </span>
                <span className="text-slate-600">&gt;90%</span>
              </div>
            </div>
            <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
              <div className="flex items-center gap-1.5">
                <span className="h-px w-4 bg-amber-400" /> приоритет
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-px w-4 bg-purple-500" /> фоновый рейс
              </div>
            </div>
          </div>
        </main>
      </div>

      <HowItWorksModal open={showTech} onClose={() => setShowTech(false)} />
    </div>
  );
}
