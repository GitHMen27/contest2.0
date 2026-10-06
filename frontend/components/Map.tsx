// components/Map.tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { HUBS } from "@/constants/hubs";
import { ActiveShipment } from "@/types/logistics";

interface MapProps {
  shipments: ActiveShipment[];
}

export default function LogisticsMap({ shipments }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Теперь new Map() ссылается на встроенный JS Map без конфликта имен
  const routesRef = useRef<Map<string, L.Polyline>>(new Map());
  const trucksRef = useRef<Map<string, L.Marker>>(new Map());

  // 1. Инициализация карты Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(mapContainerRef.current).setView([55.751244, 37.618423], 5);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    HUBS.forEach((hub) => {
      L.marker(hub.coords)
        .addTo(map)
        .bindPopup(
          `<div style="color: #0f172a; font-family: sans-serif;"><strong>${hub.name}</strong><br/>Сортировочный центр WB</div>`
        );
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Отрисовка и синхронизация активных рейсов
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(shipments.map((s) => s.id));

    // Очистка завершенных рейсов
    routesRef.current.forEach((line, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(line);
        routesRef.current.delete(id);
      }
    });

    trucksRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        trucksRef.current.delete(id);
      }
    });

    // Добавление / обновление действующих рейсов
    shipments.forEach((shipment) => {
      const isPriority = shipment.isPriority;
      const lineColor = isPriority ? "#f59e0b" : "#8b5cf6";

      if (!routesRef.current.has(shipment.id) && shipment.routeCoords?.length) {
        const line = L.polyline(shipment.routeCoords, {
          color: lineColor,
          weight: isPriority ? 5 : 3,
          opacity: isPriority ? 0.9 : 0.6,
          dashArray: isPriority ? "6, 6" : undefined,
        }).addTo(map);

        routesRef.current.set(shipment.id, line);

        if (isPriority) {
          map.fitBounds(line.getBounds(), { padding: [50, 50] });
        }
      }

      const truckIcon = L.icon({
        iconUrl: isPriority
          ? "https://img.icons8.ru/?size=100&id=BQjcRKZrKIEj&format=png&color=d97706"
          : "https://img.icons8.ru/?size=100&id=BQjcRKZrKIEj&format=png&color=2563eb",
        iconSize: isPriority ? [36, 36] : [28, 28],
        iconAnchor: isPriority ? [18, 18] : [14, 14],
        popupAnchor: [0, -14],
      });

      if (!trucksRef.current.has(shipment.id)) {
        const marker = L.marker(shipment.currentPos, { icon: truckIcon }).addTo(map);

        marker.bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif;">
            <span style="background: ${isPriority ? "#f59e0b" : "#2563eb"}; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
              ${isPriority ? "ПРИОРИТЕТ" : "В ПУТИ"}
            </span><br/>
            <strong>Трек: ${shipment.id}</strong><br/>
            <small>${shipment.fromName} → ${shipment.toName}</small>
          </div>
        `);

        trucksRef.current.set(shipment.id, marker);
      } else {
        const marker = trucksRef.current.get(shipment.id);
        marker?.setLatLng(shipment.currentPos);
      }
    });
  }, [shipments]);

  return <div ref={mapContainerRef} className="w-full h-full z-0" />;
}