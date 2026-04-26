"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  displayName: string | null;
}

const Ctx = createContext<AuthState | null>(null);

/** Supabase auth requires an email — we map usernames to a synthetic local domain
 *  and store the real username in user_metadata.display_name. */
const USERNAME_DOMAIN = "67duel.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
const VALID_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supa = getSupabase();
    if (!supa) { setLoading(false); return; }
    supa.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (username: string, password: string) => {
    const supa = getSupabase();
    if (!supa) return { error: "Supabase not configured" };
    if (!VALID_USERNAME.test(username)) return { error: "Username must be 3-20 letters, numbers, or underscores" };
    const { error } = await supa.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    return { error: error ? "Wrong username or password" : null };
  };

  const signUp = async (username: string, password: string) => {
    const supa = getSupabase();
    if (!supa) return { error: "Supabase not configured" };
    if (!VALID_USERNAME.test(username)) return { error: "Username must be 3-20 letters, numbers, or underscores" };
    if (password.length < 6) return { error: "Password must be at least 6 characters" };
    const { error } = await supa.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { display_name: username } },
    });
    if (error) {
      const msg = error.message.toLowerCase().includes("registered")
        ? "That username is taken"
        : error.message;
      return { error: msg };
    }
    return { error: null };
  };

  const signOut = async () => {
    const supa = getSupabase();
    if (!supa) return;
    await supa.auth.signOut();
  };

  const user = session?.user ?? null;
  const displayName: string | null =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    null;

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, displayName }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
