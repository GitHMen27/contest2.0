// lib/useNow.ts
'use client';

import { useSyncExternalStore } from 'react';
import { SIM_EPOCH } from '@/constants/warehouse';

/**
 * Единые часы демо-симуляции. Подписка запускает requestAnimationFrame только
 * при наличии слушателей, а серверный снапшот фиксирован — гидратация стабильна.
 */
let currentNow = SIM_EPOCH;
let rafId = 0;
let lastFrame = 0;
const listeners = new Set<() => void>();

function loop(timestamp: number) {
  if (timestamp - lastFrame >= 33) {
    lastFrame = timestamp;
    currentNow = Date.now();
    listeners.forEach((listener) => listener());
  }
  rafId = window.requestAnimationFrame(loop);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!rafId && typeof window !== 'undefined') {
    lastFrame = 0;
    rafId = window.requestAnimationFrame(loop);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

function getSnapshot() {
  return currentNow;
}

function getServerSnapshot() {
  return SIM_EPOCH;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
