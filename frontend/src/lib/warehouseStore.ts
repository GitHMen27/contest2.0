// lib/warehouseStore.ts
'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { WarehouseEmployee } from '@/types/warehouse';

const STORAGE_KEY = 'shushary-warehouse-overrides-v1';
const EVENT_NAME = 'shushary-warehouse-store';

let cachedRaw: string | null = null;

function readRaw(): string {
  if (typeof window === 'undefined') return '[]';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function getSnapshot(): string {
  if (cachedRaw === null) cachedRaw = readRaw();
  return cachedRaw;
}

function getServerSnapshot(): string {
  return '[]';
}

function subscribe(listener: () => void) {
  const onChange = () => {
    cachedRaw = null;
    listener();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT_NAME, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT_NAME, onChange);
  };
}

function writeRaw(raw: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // localStorage может быть недоступен в приватном режиме — остаёмся в памяти.
    cachedRaw = raw;
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function readOverrides(): WarehouseEmployee[] {
  try {
    const parsed: unknown = JSON.parse(readRaw());
    return Array.isArray(parsed) ? (parsed as WarehouseEmployee[]) : [];
  } catch {
    return [];
  }
}

export function saveWarehouseEmployee(employee: WarehouseEmployee) {
  const list = readOverrides();
  const index = list.findIndex((item) => item.id === employee.id);
  const next = [...list];
  if (index >= 0) next[index] = employee;
  else next.push(employee);
  writeRaw(JSON.stringify(next));
}

export function deleteWarehouseEmployee(id: string) {
  const next = readOverrides().filter((employee) => employee.id !== id);
  writeRaw(JSON.stringify(next));
}

export function useWarehouseOverrides(): WarehouseEmployee[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WarehouseEmployee[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}
