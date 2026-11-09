'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, ArrowUpRight, CircleHelp, Route as RouteIcon, Sparkles, Truck } from 'lucide-react';
import { HUBS, getHub } from '@/constants/hubs';
import { calculateAiAnalytics } from '@/constants/aiHelper';
import {
  SCENARIOS,
  SUGGESTED_QUESTIONS,
  findDemoAnswer,
  type DemoScenario,
} from '@/constants/demoKnowledge';
import { AiAnalyticsCard } from '@/components/AiAnalyticsCard';
import { AiAssistant, type BackendStatus } from '@/components/AiAssistant';
import { HowItWorksModal } from '@/components/HowItWorksModal';
import { HubAdminPanel } from '@/components/HubAdminPanel';
import { LiveFeed } from '@/components/LiveFeed';
import { KpiOverlay } from '@/components/KpiOverlay';
import { ScenarioPicker } from '@/components/ScenarioPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { useAuth } from '@/lib/auth';
import { BACKEND_CONFIGURED, askBackend, pingBackend } from '@/lib/ragApi';
import type { ActiveShipment, ChatMessage } from '@/types/logistics';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--surface-muted)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
        <span className="text-[11px] text-[var(--muted)]">Загружаем карту…</span>
      </div>
    </div>
  ),
});

type RouteStatus = 'ready' | 'loading' | 'in_transit' | 'delivered' | 'error';

/** Вкладки левой панели: каждая показывает одно действие, чтобы панель не была перегружена. */
type LeftTab = 'route' | 'scenarios' | 'trips';

const LEFT_TABS: { id: LeftTab; label: string; Icon: typeof Truck }[] = [
  { id: 'route', label: 'Маршрут', Icon: RouteIcon },
  { id: 'scenarios', label: 'Сценарии', Icon: Sparkles },
  { id: 'trips', label: 'Рейсы', Icon: Truck },
];

/** Подписка на CSS-медиазапрос без setState внутри эффекта. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Я демо-версия RAG-помощника. Отвечаю по 9 регламентам логистики и показываю источники. Выберите сценарий слева или задайте вопрос — например, про отдых водителя или перегрузку РЦ.',
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
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(BACKEND_CONFIGURED ? 'checking' : 'demo-only');
  const [backendInfo, setBackendInfo] = useState<{ chunks: number | null; llmModel: string | null }>({
    chunks: null,
    llmModel: null,
  });
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [adminHubId, setAdminHubId] = useState<string | null>(null);
  const [ragOverride, setRagOverride] = useState<boolean | null>(null);
  const [clock, setClock] = useState('');
  const [leftTab, setLeftTab] = useState<LeftTab>('route');
  const { isAdmin } = useAuth();

  // На больших экранах помощник открыт сразу, на мобильных — по кнопке.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const ragOpen = ragOverride ?? isDesktop;

  const animFrameRef = useRef<number | null>(null);
  const bgAnimFrameRef = useRef<number | null>(null);
  const answerTimersRef = useRef<Set<number>>(new Set());
  const pendingAnswersRef = useRef(0);

  const startHubObj = useMemo(() => getHub(fromHub) ?? null, [fromHub]);
  const endHubObj = useMemo(() => getHub(toHub) ?? null, [toHub]);
  const adminHub = useMemo(() => (adminHubId ? getHub(adminHubId) ?? null : null), [adminHubId]);

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

  useEffect(() => {
    if (!ragOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRagOverride(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ragOpen]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const timers = answerTimersRef.current;
    return () => {
      stopAnimation();
      if (bgAnimFrameRef.current !== null) cancelAnimationFrame(bgAnimFrameRef.current);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [stopAnimation]);

  // Проверяем бэкенд при открытии страницы. Заодно это «будит» бесплатный хостинг, который засыпает без запросов.
  useEffect(() => {
    if (!BACKEND_CONFIGURED) return;
    let cancelled = false;
    void pingBackend().then((health) => {
      if (cancelled) return;
      if (health) {
        setBackendStatus('online');
        setBackendInfo({ chunks: health.chunks, llmModel: health.llmModel });
      } else {
        setBackendStatus('offline');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

    // Любой вопрос показывает ответ: открываем панель помощника, если она была закрыта.
    setRagOverride(true);

    setMessages((previous) => [
      ...previous,
      { id: `user-${Date.now()}-${Math.random()}`, role: 'user', text: trimmed },
    ]);

    // Вопросов может быть несколько одновременно (сценарий или кнопка «Спросить AI» во время ожидания):
    // каждому нужен свой ответ, индикатор «печатает» до тех пор, пока не ответят все.
    pendingAnswersRef.current += 1;
    setIsTyping(true);

    // Ответ «в регламентах этого нет»: через секунду предлагаем вопросы, на которые ответ есть (1–4 варианта, как в начале).
    const scheduleFollowUp = () => {
      const followUpId = `assistant-followup-${Date.now()}-${Math.random()}`;
      const timer = window.setTimeout(() => {
        answerTimersRef.current.delete(timer);
        setMessages((previous) => {
          const asked = new Set(
            previous.filter((item) => item.role === 'user').map((item) => item.text.trim().toLowerCase()),
          );
          const fresh = SUGGESTED_QUESTIONS.filter((item) => !asked.has(item.trim().toLowerCase()));
          const options = (fresh.length > 0 ? fresh : SUGGESTED_QUESTIONS).slice(0, 4);
          if (options.length === 0) return previous;
          return [
            ...previous,
            {
              id: followUpId,
              role: 'assistant',
              text: 'В регламентах на этот вопрос ответа нет. Вот вопросы, на которые я могу ответить:',
              suggestions: options,
            },
          ];
        });
      }, 1000);
      answerTimersRef.current.add(timer);
    };

    const finish = (message: Omit<ChatMessage, 'id' | 'role'>) => {
      setMessages((previous) => [
        ...previous,
        { id: `assistant-${Date.now()}-${Math.random()}`, role: 'assistant', ...message },
      ]);
      pendingAnswersRef.current = Math.max(0, pendingAnswersRef.current - 1);
      if (pendingAnswersRef.current === 0) setIsTyping(false);
      if (message.refusal) scheduleFollowUp();
    };

    const answerFromDemo = (note?: string) => {
      const demo = findDemoAnswer(trimmed);
      const timer = window.setTimeout(
        () => {
          answerTimersRef.current.delete(timer);
          finish({
            text: demo.answer,
            sources: demo.sources,
            latencyMs: demo.latencyMs,
            origin: 'demo',
            refusal: demo.sources.length === 0,
            note,
          });
        },
        Math.min(1300, Math.max(500, demo.latencyMs)),
      );
      answerTimersRef.current.add(timer);
    };

    if (!BACKEND_CONFIGURED) {
      answerFromDemo();
      return;
    }

    void askBackend(trimmed).then((result) => {
      if (result.ok) {
        setBackendStatus('online');
        finish({
          text: result.text,
          sources: result.sources,
          latencyMs: result.latencyMs,
          origin: 'live',
          // Бэкенд не показывает источники под отказом «в регламентах нет ответа»
          refusal: result.sources.length === 0,
        });
        return;
      }

      if (result.kind === 'rate-limit' || result.kind === 'validation') {
        // Не сбой бэкенда, а ограничение или неподходящий вопрос: честно говорим об этом, а не подменяем ответ демо-базой
        finish({ text: result.message, origin: 'error' });
        return;
      }

      // Бэкенд недоступен или сломан: демо не должно ломаться, показываем ответ из локальной базы
      setBackendStatus('offline');
      answerFromDemo('Бэкенд сейчас недоступен: показан ответ из локальной демо-базы.');
    });
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

  const assistantProps = {
    messages,
    isTyping,
    suggestions: SUGGESTED_QUESTIONS,
    onAsk: ask,
    onOpenTech: () => setShowTech(true),
    backendStatus,
    chunks: backendInfo.chunks,
    modelLabel: backendInfo.llmModel,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden text-[var(--text)]">
      <header className="header-brand relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide text-[var(--accent-contrast)]">
            WB
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-[var(--text)]">WB Логистика</h1>
            <p className="hidden truncate text-[11px] text-[var(--muted)] sm:block">
              Диспетчерская · карта рейсов, регламенты и RAG
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 md:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'error' ? 'bg-rose-500' : status === 'delivered' ? 'bg-[var(--muted-soft)]' : 'bg-emerald-500'
              }`}
            />
            <span className="max-w-[240px] truncate text-[11px] text-[var(--muted)]">
              {trackNumber ? `${trackNumber} · ${statusText}` : statusText}
            </span>
          </div>

          <div className="hidden text-right sm:block">
            <div className="text-[13px] font-medium tabular-nums text-[var(--text)]">{clock}</div>
          </div>

          <ThemeToggle />

          <button
            type="button"
            onClick={() => setShowTech(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
          >
            <CircleHelp className="h-3.5 w-3.5 text-[var(--muted-soft)]" aria-hidden="true" />
            <span className="hidden sm:inline">Как это работает</span>
            <span className="sm:hidden">RAG</span>
          </button>

          <UserMenu />
        </div>
      </header>

      <KpiOverlay
        activeShipments={activeCount}
        networkLoad={networkLoad}
        criticalHubs={criticalHubs}
        routeRisk={aiAnalytics?.riskScore ?? null}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex h-[48vh] w-full shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-b border-[var(--line)] bg-[var(--surface)] p-4 lg:h-auto lg:w-[360px] lg:border-b-0 lg:border-r xl:w-[380px]">
          <div
            role="tablist"
            aria-label="Разделы панели"
            className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-1"
          >
            {LEFT_TABS.map(({ id, label, Icon }) => {
              const selected = leftTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setLeftTab(id)}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition ${
                    selected
                      ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent-line)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                  {id === 'trips' && activeCount > 0 ? (
                    <span className="rounded-full bg-[var(--accent-soft-2)] px-1.5 text-[9px] font-semibold text-[var(--accent)]">
                      {activeCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {leftTab === 'scenarios' ? (
            <ScenarioPicker scenarios={SCENARIOS} activeId={activeScenario} onSelect={applyScenario} />
          ) : null}

          {leftTab === 'route' ? (
            <>
          <section className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">

            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-[var(--muted)]">Откуда</span>
                <select
                  value={fromHub}
                  onChange={(event) => handleFromChange(event.target.value)}
                  className="h-9 w-full min-w-0 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                >
                  {HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name} · {hub.load}%
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-[var(--muted)]">Куда</span>
                <select
                  value={toHub}
                  onChange={(event) => handleToChange(event.target.value)}
                  className="h-9 w-full min-w-0 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                >
                  {HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id} disabled={hub.id === fromHub}>
                      {hub.name} · {hub.load}%
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={handleStartRoute}
              disabled={status === 'loading'}
              className="gradient-brand mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] font-medium text-[var(--accent-contrast)] transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Построение маршрута…
                </>
              ) : (
                <>
                  Запустить приоритетный рейс
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          </section>

          <AiAnalyticsCard
            analytics={aiAnalytics}
            isLoading={status === 'loading' && !aiAnalytics}
            onAsk={ask}
          />
            </>
          ) : null}

          {leftTab === 'trips' ? (
            <section className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <LiveFeed shipments={shipmentFeed} />
            </section>
          ) : null}
        </aside>

        <main className="relative min-h-[46vh] flex-1 lg:min-h-0">
          <Map shipments={mapShipments} onOpenAdmin={isAdmin ? setAdminHubId : undefined} canAdmin={isAdmin} />
        </main>
      </div>

      {!ragOpen ? (
        <button
          type="button"
          onClick={() => setRagOverride(true)}
          className="fixed right-3 top-[68px] z-[1200] flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-medium text-[var(--text)] shadow-md shadow-[#2a0f3a]/10 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] lg:right-4 lg:top-[122px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          RAG-помощник
          <ArrowUpRight className="h-3.5 w-3.5 text-[var(--muted-soft)]" aria-hidden="true" />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRagOverride(false)}
            aria-label="Закрыть помощника"
            className="fixed inset-0 z-[1400] bg-[#160b20]/35 backdrop-blur-[1px] lg:hidden"
          />
          <div className="fixed inset-x-3 bottom-3 z-[1500] flex h-[72vh] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl shadow-[#2a0f3a]/15 sm:left-auto sm:w-[380px] lg:bottom-auto lg:right-4 lg:top-[122px] lg:h-[540px] lg:max-h-[calc(100vh-140px)]">
            <AiAssistant {...assistantProps} onClose={() => setRagOverride(false)} />
          </div>
        </>
      )}

      <HowItWorksModal open={showTech} onClose={() => setShowTech(false)} />
      <HubAdminPanel hub={isAdmin ? adminHub : null} onClose={() => setAdminHubId(null)} />
    </div>
  );
}
