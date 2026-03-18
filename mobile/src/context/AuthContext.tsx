import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  simplefinLinked: boolean;
  simplefinStatusLoading: boolean;
  refreshSimplefinStatus: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyCurrentPassword: (password: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updateEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  simplefinLinked: false,
  simplefinStatusLoading: true,
  refreshSimplefinStatus: async () => {},
  refreshUser: async () => {},
  verifyCurrentPassword: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  updateEmail: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  deleteAccount: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, needsConfirmation: false }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [simplefinLinked, setSimplefinLinked] = useState(false);
  const [simplefinStatusLoading, setSimplefinStatusLoading] = useState(true);
  const simplefinStatusInFlight = useRef<Promise<void> | null>(null);

  const refreshSimplefinStatus = async (activeSession: Session | null = session) => {
    if (!activeSession) {
      setSimplefinLinked(false);
      setSimplefinStatusLoading(false);
      return;
    }

    if (simplefinStatusInFlight.current) {
      await simplefinStatusInFlight.current;
      return;
    }

    const run = (async () => {
      setSimplefinStatusLoading(true);
      try {
        const data = await api.getSimplefinStatus();
        setSimplefinLinked(Boolean(data.linked));
      } catch {
        setSimplefinLinked(false);
      } finally {
        setSimplefinStatusLoading(false);
        simplefinStatusInFlight.current = null;
      }
    })();

    simplefinStatusInFlight.current = run;
    await run;
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(initialSession);
      await refreshSimplefinStatus(initialSession);

      if (mounted) {
        setLoading(false);
      }
    };

    initialize();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        refreshSimplefinStatus(session);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message || null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      return { error: error.message, needsConfirmation: false };
    }
    // If the user already exists or email confirmation is required
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  const signOut = async () => {
    api.clearCardsCache();
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error: error?.message || null };
  };

  const verifyCurrentPassword = async (password: string) => {
    // SECURITY NOTE: This uses signInWithPassword to verify the current password.
    // While effective, it generates a new session which handles the 'verification'.
    // This is a common pattern when a dedicated 'verify password' API is unavailable.
    const email = session?.user?.email?.trim();

    if (!email) {
      return { error: 'Unable to verify current password for this account.' };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error?.message || null };
  };

  const updateEmail = async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    return { error: error?.message || null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message || null };
  };

  const deleteAccount = async () => {
    try {
      await api.deleteAccount();
      await supabase.auth.signOut();
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete account.' };
    }
  };

  const refreshUser = useCallback(async () => {
    if (!session) return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return;

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        user: data.user,
      };
    });
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        simplefinLinked,
        simplefinStatusLoading,
        refreshSimplefinStatus: async () => refreshSimplefinStatus(),
        refreshUser,
        verifyCurrentPassword,
        requestPasswordReset,
        updateEmail,
        updatePassword,
        deleteAccount,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
