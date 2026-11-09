// components/Map.tsx
'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Truck } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { HUBS } from '@/constants/hubs';
import type { ActiveShipment, Hub, HubStatus } from '@/types/logistics';

interface MapProps {
  shipments: ActiveShipment[];
  onOpenAdmin?: (hubId: string) => void;
  /** Кнопка «Панель администратора» в подсказке РЦ видна только администратору. */
  canAdmin?: boolean;
}

const HUB_COLORS: Record<HubStatus, string> = {
  optimal: '#12b76a',
  warning: '#f79009',
  critical: '#f04438',
};

const HUB_LABELS: Record<HubStatus, string> = {
  optimal: 'норма',
  warning: 'внимание',
  critical: 'перегрузка',
};

function hubIcon(hub: Hub): L.DivIcon {
  const color = HUB_COLORS[hub.status];

  if (hub.isActive) {
    return L.divIcon({
      className: 'hub-marker hub-marker--active',
      html: `
        <div class="hub-active" style="--hub-color:${color};">
          <span class="hub-active-ring"></span>
          <span class="hub-active-dot"></span>
          <span class="hub-active-label">${hub.name} · активна</span>
        </div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -14],
    });
  }

  return L.divIcon({
    className: 'hub-marker',
    html: `
      <div style="position:relative;width:14px;height:14px;">
        <span style="position:absolute;inset:-7px;border-radius:9999px;background:${color}1f;animation:pulse-ring 2.8s ease-out infinite;"></span>
        <span style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 3px rgba(16,24,40,0.3);"></span>
      </div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function hubPopup(hub: Hub, canAdmin: boolean): string {
  const color = HUB_COLORS[hub.status];
  const active = Boolean(hub.isActive);

  return `
    <div class="hub-popup" data-hub-id="${hub.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <strong style="font-size:12px;color:var(--text);">${hub.name}</strong>
        ${
          active
            ? '<span class="hub-active-badge">активна</span>'
            : `<span style="font-size:9px;color:${color};font-weight:600;">${HUB_LABELS[hub.status]}</span>`
        }
      </div>
      <div style="margin-top:2px;font-size:10px;color:var(--muted);">${hub.city} · сортировочный центр</div>
      <div style="margin-top:9px;display:flex;justify-content:space-between;font-size:10px;color:var(--muted);">
        <span>Загрузка РЦ</span><strong style="color:var(--text);">${hub.load}%</strong>
      </div>
      <div style="height:5px;background:var(--surface-muted);border-radius:9999px;margin-top:4px;overflow:hidden;">
        <div style="width:${hub.load}%;height:100%;background:${color};border-radius:9999px;"></div>
      </div>
      ${
        active && hub.siteUrl
          ? `
            <div class="hub-popup-actions">
              ${
                canAdmin
                  ? `<button type="button" data-hub-action="admin" class="hub-action hub-action-primary">Открыть панель администратора</button>`
                  : ''
              }
              <a
                href="${hub.siteUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="hub-action hub-action-secondary"
              >
                Перейти на сайт точки
              </a>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function truckIcon(priority: boolean): L.DivIcon {
  // Сама иконка (Truck из lucide-react) рисуется React-корнем в .truck-icon-slot после добавления маркера на карту.
  return L.divIcon({
    className: 'truck-marker-wrapper',
    html: `<div class="truck-marker${priority ? ' priority' : ''}"><span class="truck-icon-slot"></span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function truckPopupHtml(shipment: ActiveShipment): string {
  const isPriority = shipment.isPriority;
  return `
    <div style="font-family:inherit;min-width:170px;">
      <span style="display:inline-block;background:${isPriority ? 'var(--priority-soft)' : 'var(--accent-soft)'};color:${isPriority ? 'var(--priority)' : 'var(--accent)'};font-size:9px;padding:2px 6px;border-radius:9999px;font-weight:600;">
        ${isPriority ? 'приоритет' : 'в пути'}
      </span>
      <div style="margin-top:6px;font-size:12px;font-weight:600;color:var(--text);">${shipment.id}</div>
      <div style="margin-top:2px;font-size:10px;color:var(--muted);">${shipment.fromName} → ${shipment.toName}</div>
      <div style="margin-top:6px;font-size:10px;color:var(--muted);">Прогресс: ${Math.round(shipment.progress)}%</div>
      <div style="height:4px;background:var(--surface-muted);border-radius:9999px;margin-top:4px;overflow:hidden;">
        <div style="width:${Math.min(100, Math.max(0, shipment.progress))}%;height:100%;background:${isPriority ? 'var(--priority)' : 'var(--accent)'};border-radius:9999px;"></div>
      </div>
    </div>
  `;
}

export default function LogisticsMap({ shipments, onOpenAdmin, canAdmin = false }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routesRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const trucksRef = useRef<Map<string, L.Marker>>(new Map());
  const truckRootsRef = useRef<Map<string, Root>>(new Map());
  const latestShipmentsRef = useRef<Map<string, ActiveShipment>>(new Map());
  const onOpenAdminRef = useRef<MapProps['onOpenAdmin']>(onOpenAdmin);
  const canAdminRef = useRef(canAdmin);

  useEffect(() => {
    onOpenAdminRef.current = onOpenAdmin;
    canAdminRef.current = canAdmin;
  }, [onOpenAdmin, canAdmin]);

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
        .bindPopup(() => hubPopup(hub, canAdminRef.current), { maxWidth: 280, minWidth: 220 });
    });

    const handlePopupOpen = (event: L.PopupEvent) => {
      const popupElement = event.popup.getElement();
      if (!popupElement) return;

      const actions = popupElement.querySelector<HTMLElement>('.hub-popup-actions');
      if (!actions) return;

      L.DomEvent.disableClickPropagation(actions);

      const adminButton = actions.querySelector<HTMLButtonElement>('[data-hub-action="admin"]');
      if (!adminButton) return;

      adminButton.onclick = (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const hubId = popupElement.querySelector<HTMLElement>('[data-hub-id]')?.dataset.hubId;
        map.closePopup();
        if (hubId) onOpenAdminRef.current?.(hubId);
      };
    };

    map.on('popupopen', handlePopupOpen);

    mapInstanceRef.current = map;
    const routes = routesRef.current;
    const trucks = trucksRef.current;
    const truckRoots = truckRootsRef.current;
    const resizeTimer = window.setTimeout(() => {
      if (mapInstanceRef.current === map) map.invalidateSize();
    }, 80);

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      map.off('popupopen', handlePopupOpen);
      map.remove();
      mapInstanceRef.current = null;
      routes.clear();
      trucks.clear();
      // Размонтируем React-корни иконок после завершения текущего рендера.
      const roots = Array.from(truckRoots.values());
      truckRoots.clear();
      window.setTimeout(() => roots.forEach((root) => root.unmount()), 0);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(shipments.map((shipment) => shipment.id));
    latestShipmentsRef.current = new Map(shipments.map((shipment) => [shipment.id, shipment]));

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
        const root = truckRootsRef.current.get(id);
        if (root) {
          truckRootsRef.current.delete(id);
          window.setTimeout(() => root.unmount(), 0);
        }
      }
    });

    shipments.forEach((shipment) => {
      const isPriority = shipment.isPriority;
      const lineColor = isPriority ? '#cb11ab' : '#98a2b3';

      if (!routesRef.current.has(shipment.id) && shipment.routeCoords.length > 0) {
        const group = L.layerGroup();

        L.polyline(shipment.routeCoords, {
          color: lineColor,
          weight: isPriority ? 10 : 6,
          opacity: isPriority ? 0.12 : 0.08,
          lineCap: 'round',
        }).addTo(group);

        L.polyline(shipment.routeCoords, {
          color: lineColor,
          weight: isPriority ? 3 : 2,
          opacity: isPriority ? 0.95 : 0.55,
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

        const slot = marker.getElement()?.querySelector<HTMLElement>('.truck-icon-slot');
        if (slot) {
          const root = createRoot(slot);
          root.render(<Truck size={17} strokeWidth={2.2} aria-hidden="true" />);
          truckRootsRef.current.set(shipment.id, root);
        }

        // Содержимое строится в момент открытия из актуальных данных, а не из снимка при создании (так прогресс не застывал на 0%).
        const shipmentId = shipment.id;
        marker.bindPopup(() => {
          const latest = latestShipmentsRef.current.get(shipmentId) ?? shipment;
          return truckPopupHtml(latest);
        });

        trucksRef.current.set(shipment.id, marker);
      } else {
        const marker = trucksRef.current.get(shipment.id);
        marker?.setLatLng(shipment.currentPos);
        // Если подсказка открыта, обновляем прогресс на лету.
        const popup = marker?.getPopup();
        if (popup?.isOpen()) popup.setContent(truckPopupHtml(shipment));
      }
    });
  }, [shipments]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
