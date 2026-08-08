'use client';

import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api-client';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['authMe'],
    queryFn: api.getAuthMe,
    retry: false,
    staleTime: 60_000,
  });

  const value: AuthContextValue = {
    isAuthenticated: data?.authenticated ?? false,
    isLoading,
    refresh: () => void queryClient.invalidateQueries({ queryKey: ['authMe'] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
