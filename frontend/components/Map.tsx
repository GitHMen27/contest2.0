// components/Map.tsx
'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { HUBS } from '@/constants/hubs';
import type { ActiveShipment, Hub, HubStatus } from '@/types/logistics';

interface MapProps {
  shipments: ActiveShipment[];
}

const HUB_COLORS: Record<HubStatus, string> = {
  optimal: '#34d399',
  warning: '#fbbf24',
  critical: '#fb7185',
};

const HUB_LABELS: Record<HubStatus, string> = {
  optimal: 'optimal · норма',
  warning: 'warning · внимание',
  critical: 'critical · перегрузка',
};

function hubIcon(hub: Hub): L.DivIcon {
  const color = HUB_COLORS[hub.status];
  return L.divIcon({
    className: 'hub-marker',
    html: `
      <div style="position:relative;width:16px;height:16px;">
        <span style="position:absolute;inset:-8px;border-radius:9999px;background:${color}22;animation:pulse-ring 2.6s ease-out infinite;"></span>
        <span style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid #020617;box-shadow:0 0 14px ${color};"></span>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function hubPopup(hub: Hub): string {
  const color = HUB_COLORS[hub.status];
  return `
    <div style="min-width:180px;font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <strong style="font-size:12px;color:#f8fafc;">${hub.name}</strong>
        <span style="font-size:9px;color:${color};text-transform:uppercase;letter-spacing:.08em;">${HUB_LABELS[hub.status]}</span>
      </div>
      <div style="margin-top:2px;font-size:10px;color:#94a3b8;">${hub.city} · сортировочный центр</div>
      <div style="margin-top:9px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;">
        <span>Загрузка РЦ</span><strong style="color:#e2e8f0;">${hub.load}%</strong>
      </div>
      <div style="height:5px;background:#1e293b;border-radius:9999px;margin-top:4px;overflow:hidden;">
        <div style="width:${hub.load}%;height:100%;background:${color};border-radius:9999px;"></div>
      </div>
    </div>
  `;
}

function truckIcon(priority: boolean): L.DivIcon {
  return L.divIcon({
    className: 'truck-marker-wrapper',
    html: `<div class="truck-marker${priority ? ' priority' : ''}"><span class="truck-emoji">🚚</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

export default function LogisticsMap({ shipments }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routesRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const trucksRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([56.2, 44.0], 5);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    HUBS.forEach((hub) => {
      L.marker(hub.coords, { icon: hubIcon(hub) })
        .addTo(map)
        .bindTooltip(hub.name, {
          direction: 'top',
          offset: [0, -10],
          className: 'hub-tooltip',
          opacity: 1,
        })
        .bindPopup(hubPopup(hub));
    });

    mapInstanceRef.current = map;
    const routes = routesRef.current;
    const trucks = trucksRef.current;
    const resizeTimer = window.setTimeout(() => {
      if (mapInstanceRef.current === map) map.invalidateSize();
    }, 80);

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      map.remove();
      mapInstanceRef.current = null;
      routes.clear();
      trucks.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(shipments.map((shipment) => shipment.id));

    routesRef.current.forEach((group, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(group);
        routesRef.current.delete(id);
      }
    });

    trucksRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        trucksRef.current.delete(id);
      }
    });

    shipments.forEach((shipment) => {
      const isPriority = shipment.isPriority;
      const lineColor = isPriority ? '#fbbf24' : '#8b5cf6';

      if (!routesRef.current.has(shipment.id) && shipment.routeCoords.length > 0) {
        const group = L.layerGroup();

        L.polyline(shipment.routeCoords, {
          color: lineColor,
          weight: isPriority ? 12 : 7,
          opacity: isPriority ? 0.16 : 0.08,
          lineCap: 'round',
        }).addTo(group);

        L.polyline(shipment.routeCoords, {
          color: lineColor,
          weight: isPriority ? 4 : 2,
          opacity: isPriority ? 0.95 : 0.5,
          dashArray: isPriority ? '10 8' : undefined,
          className: isPriority ? 'route-line-priority' : undefined,
          lineCap: 'round',
        }).addTo(group);

        group.addTo(map);
        routesRef.current.set(shipment.id, group);

        if (isPriority) {
          const rightPadding = window.innerWidth >= 1024 ? 400 : 60;
          map.fitBounds(L.latLngBounds(shipment.routeCoords), {
            paddingTopLeft: [60, 60],
            paddingBottomRight: [rightPadding, 60],
            maxZoom: 6,
          });
        }
      }

      if (!trucksRef.current.has(shipment.id)) {
        const marker = L.marker(shipment.currentPos, { icon: truckIcon(isPriority) }).addTo(map);

        marker.bindPopup(`
          <div style="font-family:inherit;min-width:170px;">
            <span style="display:inline-block;background:${isPriority ? '#fbbf24' : '#7c3aed'};color:${isPriority ? '#0f172a' : '#ffffff'};font-size:8px;padding:2px 6px;border-radius:9999px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
              ${isPriority ? 'приоритет' : 'в пути'}
            </span>
            <div style="margin-top:6px;font-size:12px;font-weight:700;color:#f8fafc;">${shipment.id}</div>
            <div style="margin-top:2px;font-size:10px;color:#94a3b8;">${shipment.fromName} → ${shipment.toName}</div>
            <div style="margin-top:6px;font-size:10px;color:#cbd5e1;">Прогресс: ${Math.round(shipment.progress)}%</div>
          </div>
        `);

        trucksRef.current.set(shipment.id, marker);
      } else {
        trucksRef.current.get(shipment.id)?.setLatLng(shipment.currentPos);
      }
    });
  }, [shipments]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
