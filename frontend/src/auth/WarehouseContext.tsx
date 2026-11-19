import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Warehouse } from '../api/types';
import { useAuth } from './AuthContext';

const KEY = 'raff.warehouse';

interface WarehouseState {
  /** Active warehouses the user may see (just their own if they are limited to one). */
  warehouses: Warehouse[];
  /** Selected warehouse, or null for "all warehouses". */
  selectedId: number | null;
  selected: Warehouse | null;
  select: (id: number | null) => void;
  /** True when the user is limited to one warehouse and can't switch. */
  locked: boolean;
  /** Query parameter value for API calls (undefined = all warehouses). */
  param: number | undefined;
  /** Sensible default for forms: the selected warehouse, else the user's, else the first one. */
  defaultId: number | null;
}

const Ctx = createContext<WarehouseState | null>(null);

function readSaved(): number | null {
  try { const v = Number(localStorage.getItem(KEY)); return v > 0 ? v : null; } catch { return null; }
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<number | null>(readSaved);
  const list = useQuery({
    queryKey: ['warehouses', 'mine'],
    queryFn: () => api.get<Warehouse[]>('/api/warehouses'),
    enabled: !!user,
    staleTime: 60_000,
  });

  const warehouses = list.data ?? [];
  const locked = !!user?.warehouseId;
  // A saved choice is only honoured while that warehouse is still in the list.
  const selectedId = locked ? user!.warehouseId! : saved && warehouses.some((w) => w.id === saved) ? saved : null;

  const select = useCallback((id: number | null) => {
    setSaved(id);
    try { if (id) localStorage.setItem(KEY, String(id)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  const value = useMemo<WarehouseState>(() => ({
    warehouses,
    selectedId,
    selected: warehouses.find((w) => w.id === selectedId) ?? null,
    select,
    locked,
    param: selectedId ?? undefined,
    defaultId: selectedId ?? user?.warehouseId ?? warehouses[0]?.id ?? null,
  }), [warehouses, selectedId, select, locked, user?.warehouseId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWarehouse() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarehouse must be used inside WarehouseProvider');
  return ctx;
}
