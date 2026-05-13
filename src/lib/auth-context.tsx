import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearGuestSession, getGuestTimeRemaining, isGuestEmail } from "@/lib/guest";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified?: boolean | null;
};

type Ctx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isGuest: boolean;
  guestTimeRemaining: number | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestTimeRemaining, setGuestTimeRemaining] = useState<number | null>(null);

  const isGuest = useMemo(() => isGuestEmail(session?.user?.email), [session?.user?.email]);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user || !isGuest) {
      setGuestTimeRemaining(null);
      return;
    }

    const sync = async () => {
      const remaining = getGuestTimeRemaining();
      if (remaining === null) {
        clearGuestSession();
        await supabase.auth.signOut();
        return;
      }
      if (remaining <= 0) {
        clearGuestSession();
        await supabase.auth.signOut();
        return;
      }
      setGuestTimeRemaining(remaining);
    };

    sync();
    const interval = window.setInterval(() => {
      void sync();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session?.user?.id, isGuest]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        isGuest,
        guestTimeRemaining,
        refreshProfile: async () => session?.user && loadProfile(session.user.id),
        signOut: async () => {
          clearGuestSession();
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
