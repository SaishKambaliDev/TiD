import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setStoredToken } from '../lib/api';
import type { UserProfileDTO } from '../shared/types';

interface HealthStatus {
  databaseConnected: boolean;
  databaseError: string | null;
  groqConfigured: boolean;
}

interface AuthContextValue {
  user: UserProfileDTO | null;
  loading: boolean;
  health: HealthStatus | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    timezone: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth({
        databaseConnected: h.database.connected,
        databaseError: h.database.error,
        groqConfigured: h.groqConfigured,
      });
    } catch {
      // ignore health check failure
    }

    try {
      const data = await api.me();
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.login({ email, password });
    setStoredToken(data.token);
    setUser(data.user);
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    timezone: string;
  }) => {
    const data = await api.register(payload);
    setStoredToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, health, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
