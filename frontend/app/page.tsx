'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { HUBS } from '@/constants/hubs';
import { calculateAiAnalytics } from '@/constants/aiHelper';
import { AiAnalyticsCard } from '@/components/AiAnalyticsCard';
import { Hub, AiAnalyticsResult, ActiveShipment } from '@/types/logistics';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-purple-400 animate-pulse font-mono">
      Инициализация карты...
    </div>
  ),
});

export default function Home() {
  const [fromHub, setFromHub] = useState(HUBS[0].id);
  const [toHub, setToHub] = useState(HUBS[3].id);
  const [status, setStatus] = useState<'ready' | 'loading' | 'in_transit' | 'delivered' | 'error'>('ready');
  const [statusText, setStatusText] = useState('Система готова');

  const [activeRoute, setActiveRoute] = useState<[number, number][] | null>(null);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(null);
  const [trackNumber, setTrackNumber] = useState<string | null>(null);

  const [shipmentFeed, setShipmentFeed] = useState<ActiveShipment[]>([]);

  const animFrameRef = useRef<number | null>(null);
  const bgAnimFrameRef = useRef<number | null>(null);

  const startHubObj = useMemo(() => {
    const found = HUBS.find((h) => h.id === fromHub);
    if (!found) return null;
    return { id: found.id, name: found.name, lat: found.coords[0], lng: found.coords[1] } as Hub;
  }, [fromHub]);

  const endHubObj = useMemo(() => {
    const found = HUBS.find((h) => h.id === toHub);
    if (!found) return null;
    return { id: found.id, name: found.name, lat: found.coords[0], lng: found.coords[1] } as Hub;
  }, [toHub]);

  const aiAnalytics: AiAnalyticsResult | null = useMemo(() => {
    if (!startHubObj || !endHubObj || startHubObj.id === endHubObj.id) return null;
    return calculateAiAnalytics(startHubObj, endHubObj);
  }, [startHubObj, endHubObj]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAnimation();
      if (bgAnimFrameRef.current) cancelAnimationFrame(bgAnimFrameRef.current);
    };
  }, [stopAnimation]);

  const fetchRouteCoords = async (startCoords: [number, number], endCoords: [number, number]): Promise<[number, number][] | null> => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (!data.routes?.length) return null;
      return data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    } catch {
      return null;
    }
  };

  // 1. Анимация движения ВСЕХ фоновых машин через requestAnimationFrame (для плавной анимации 60 FPS)
  useEffect(() => {
    let lastTime = performance.now();

    const updatePositions = (now: number) => {
      const delta = (now - lastTime) / 1000; // секунды
      lastTime = now;

      setShipmentFeed((prevFeed) => {
        let changed = false;
        const updated = prevFeed
          .map((shipment) => {
            if (shipment.isPriority || !shipment.routeCoords || shipment.routeCoords.length === 0) {
              return shipment;
            }

            // Скорость прохождения рейса (например, весь путь за 25 секунд)
            const speed = 100 / 25; 
            const newProgress = shipment.progress + speed * delta;

            if (newProgress >= 100) {
              changed = true;
              return null; // Рейс завершен -> удаляем его из списка!
            }

            const index = Math.floor((newProgress / 100) * (shipment.routeCoords.length - 1));
            const newPos = shipment.routeCoords[index];

            changed = true;
            return {
              ...shipment,
              progress: newProgress,
              currentPos: newPos,
              statusText: 'В пути',
            };
          })
          .filter(Boolean) as ActiveShipment[];

        return changed ? updated : prevFeed;
      });

      bgAnimFrameRef.current = requestAnimationFrame(updatePositions);
    };

    bgAnimFrameRef.current = requestAnimationFrame(updatePositions);
    return () => {
      if (bgAnimFrameRef.current) cancelAnimationFrame(bgAnimFrameRef.current);
    };
  }, []);

  // 2. Создание новых фоновых рейсов
  useEffect(() => {
    const spawnBackgroundShipment = async () => {
      const randomFrom = HUBS[Math.floor(Math.random() * HUBS.length)];
      let randomTo = HUBS[Math.floor(Math.random() * HUBS.length)];
      while (randomTo.id === randomFrom.id) {
        randomTo = HUBS[Math.floor(Math.random() * HUBS.length)];
      }

      const routeCoords = await fetchRouteCoords(randomFrom.coords, randomTo.coords);
      if (!routeCoords) return;

      const autoShipment: ActiveShipment = {
        id: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
        fromName: randomFrom.name,
        toName: randomTo.name,
        isPriority: false,
        statusText: 'В пути',
        progress: 0,
        currentPos: routeCoords[0],
        routeCoords: routeCoords,
      };

      setShipmentFeed((prev) => [autoShipment, ...prev.slice(0, 4)]);
    };

    spawnBackgroundShipment();
    const interval = setInterval(spawnBackgroundShipment, 8000);

    return () => clearInterval(interval);
  }, []);

  // 3. Запуск Приоритетного рейса
  const handleStartRoute = async () => {
    if (fromHub === toHub) {
      alert('Выберите разные склады');
      return;
    }

    stopAnimation();
    setStatus('loading');
    setStatusText('Построение маршрута...');

    const startObj = HUBS.find((h) => h.id === fromHub)!;
    const endObj = HUBS.find((h) => h.id === toHub)!;

    const track = `WB-PRIORITY-${Math.floor(1000 + Math.random() * 9000)}`;
    setTrackNumber(track);

    const coords = await fetchRouteCoords(startObj.coords, endObj.coords);

    if (!coords) {
      setStatus('error');
      setStatusText('Маршрут не найден');
      return;
    }

    setActiveRoute(coords);
    setTruckPosition(coords[0]);
    setStatus('in_transit');
    setStatusText('В пути (Приоритет)');

    const priorityShipment: ActiveShipment = {
      id: track,
      fromName: startObj.name,
      toName: endObj.name,
      isPriority: true,
      statusText: 'В пути (Приоритет)',
      progress: 0,
      currentPos: coords[0],
      routeCoords: coords,
    };

    setShipmentFeed((prev) => [priorityShipment, ...prev.slice(0, 4)]);

    const duration = 15000; // 15 секунд длительность приоритетного рейса
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const index = Math.floor(progress * (coords.length - 1));
      const currentCoord = coords[index];

      setShipmentFeed((prev) =>
        prev
          .map((item) => {
            if (item.id === track) {
              if (progress >= 1) return null; // Удаляем и приоритетный рейс при прибытии
              return {
                ...item,
                progress: Math.floor(progress * 100),
                statusText: 'В пути (Приоритет)',
                currentPos: currentCoord,
              };
            }
            return item;
          })
          .filter(Boolean) as ActiveShipment[]
      );

      if (progress < 1) {
        setTruckPosition(currentCoord);
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setTruckPosition(null);
        setActiveRoute(null);
        setStatus('delivered');
        setStatusText('Доставлен!');
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  const mapShipments = useMemo<ActiveShipment[]>(() => {
    return shipmentFeed.map((s) => {
      if (s.id === trackNumber && truckPosition && activeRoute) {
        return {
          ...s,
          currentPos: truckPosition,
          routeCoords: activeRoute,
        };
      }
      return s;
    });
  }, [shipmentFeed, trackNumber, truckPosition, activeRoute]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-purple-600 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30">
            WB
          </div>
          <h1 className="font-bold tracking-wide text-base">WB Logistics Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <div className="bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 text-xs font-mono text-purple-300">
            {trackNumber ? `${trackNumber}: ${statusText}` : statusText}
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className="w-96 bg-slate-900 border-r border-slate-800 p-5 flex flex-col gap-5 z-10 overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              Управление диспетчера
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Откуда</label>
                <select
                  value={fromHub}
                  onChange={(e) => setFromHub(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {HUBS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Куда</label>
                <select
                  value={toHub}
                  onChange={(e) => setToHub(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {HUBS.map((h) => (
                    <option key={h.id} value={h.id} disabled={h.id === fromHub}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleStartRoute}
                disabled={status === 'loading'}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-2 rounded text-xs transition shadow-lg shadow-purple-600/20 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>⚡</span>
                <span>{status === 'loading' ? 'Загрузка...' : 'Запустить приоритетный рейс'}</span>
              </button>
            </div>
          </div>

          <AiAnalyticsCard analytics={aiAnalytics} />

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl mt-auto">
            <div className="flex justify-between items-center mb-3">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Мониторинг рейсов (Live Feed)
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                Авто-поток
              </span>
            </div>

            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {shipmentFeed.length === 0 ? (
                <div className="text-xs text-slate-500 italic text-center py-2">
                  Инициализация потока данных...
                </div>
              ) : (
                shipmentFeed.map((shipment) => (
                  <div
                    key={shipment.id}
                    className={`p-2.5 rounded-lg border text-xs transition-all ${
                      shipment.isPriority
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900/60 border-slate-700/50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-[11px] text-slate-300 font-bold">
                        {shipment.id}
                      </span>
                      {shipment.isPriority ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-black rounded uppercase tracking-wider animate-pulse">
                          ⚡ Приоритет
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">{shipment.statusText}</span>
                      )}
                    </div>

                    <div className="text-[11px] font-medium text-slate-200 truncate">
                      {shipment.fromName} → {shipment.toName}
                    </div>

                    <div className="w-full bg-slate-700/50 h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-100 ${
                          shipment.isPriority ? 'bg-amber-500' : 'bg-purple-500'
                        }`}
                        style={{ width: `${Math.min(shipment.progress, 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 relative">
          <Map shipments={mapShipments} />
        </main>
      </div>
    </div>
  );
}