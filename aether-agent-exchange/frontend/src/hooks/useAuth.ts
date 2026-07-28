import { useState, useCallback, useContext, createContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

interface User {
  id: string;
  walletAddress: string;
  role: string;
  displayName: string | null;
  termsAccepted?: boolean;
  policyVersion?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  termsAccepted: boolean;
  login: (newToken: string, newUser: User) => void;
  logout: () => void;
  markTermsAccepted: (policyVersion: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aether_token'));
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('aether_token');
    const storedUser = localStorage.getItem('aether_user');
    if (stored && storedUser) {
      try {
        return JSON.parse(storedUser) as User;
      } catch {
        return null;
      }
    }
    return null;
  });

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('aether_token', newToken);
    localStorage.setItem('aether_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('aether_token');
    localStorage.removeItem('aether_user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('aether-auth-expired', logout);
    return () => window.removeEventListener('aether-auth-expired', logout);
  }, [logout]);

  const markTermsAccepted = useCallback((policyVersion: string) => {
    if (user) {
      const updated = { ...user, termsAccepted: true, policyVersion };
      localStorage.setItem('aether_user', JSON.stringify(updated));
      setUser(updated);
    }
  }, [user]);

  const value: AuthState = {
    user,
    token,
    isAuthenticated: !!token,
    termsAccepted: user?.termsAccepted ?? false,
    login,
    logout,
    markTermsAccepted,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
