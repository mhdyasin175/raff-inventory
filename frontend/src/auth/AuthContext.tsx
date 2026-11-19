import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import type { CurrentUser, LoginResponse } from '../api/types';

export const P = {
  dashboard: 'dashboard.view',
  productsView: 'products.view',
  productsManage: 'products.manage',
  categories: 'categories.manage',
  movementsView: 'movements.view',
  movementsIn: 'movements.in',
  movementsOut: 'movements.out',
  movementsAdjust: 'movements.adjust',
  movementsTransfer: 'movements.transfer',
  warehouses: 'warehouses.manage',
  reports: 'reports.view',
  users: 'users.manage',
  roles: 'roles.manage',
} as const;

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const qc = useQueryClient();

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); qc.clear(); });
    if (!tokenStore.get()) return;
    // Refresh the user (and permissions) from the server on every app load.
    api.get<CurrentUser>('/api/auth/me')
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, [qc]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/api/auth/login', { username, password });
    tokenStore.set(res.token);
    setUser(res.user);
  }, []);

  const can = useCallback(
    (...perms: string[]) => !!user && perms.some((p) => user.permissions.includes(p)),
    [user],
  );

  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
