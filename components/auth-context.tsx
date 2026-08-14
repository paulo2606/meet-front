"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiRequest, authApi, type AuthUser, type TokenResponse } from "@/lib/api";

type Session = {
  user: AuthUser;
  token: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePhoto: (photoUrl: string) => void;
  authRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<TokenResponse> | null>(null);

  const applyToken = useCallback((token: TokenResponse) => {
    const next: Session = {
      token: token.accessToken,
      user: {
        userId: token.userId,
        name: token.name,
        email: token.email,
        photoUrl: token.photoUrl ?? null,
      },
    };
    tokenRef.current = token.accessToken;
    setSession(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .refresh()
      .then((token) => {
        if (!cancelled) applyToken(token);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyToken]);

  const refreshSession = useCallback(async () => {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = authApi
        .refresh()
        .then((token) => {
          applyToken(token);
          return token;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }
    return refreshPromiseRef.current;
  }, [applyToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      applyToken(await authApi.login(email, password));
    },
    [applyToken],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      applyToken(await authApi.register(name, email, password));
    },
    [applyToken],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenRef.current = null;
      setSession(null);
    }
  }, []);

  const authRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const attempt = () => apiRequest<T>(path, init, tokenRef.current);
      try {
        return await attempt();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await refreshSession();
          return attempt();
        }
        throw error;
      }
    },
    [refreshSession],
  );

  const updatePhoto = useCallback((photoUrl: string) => {
    setSession((current) =>
      current ? { ...current, user: { ...current.user, photoUrl } } : current,
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isLoading,
      login,
      register,
      logout,
      updatePhoto,
      authRequest,
    }),
    [session, isLoading, login, register, logout, updatePhoto, authRequest],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
