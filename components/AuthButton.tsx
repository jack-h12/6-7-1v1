"use client";

import { useState } from "react";
import { useAuth } from "./AuthContext";

export function AuthButton() {
  const { user, displayName, loading, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) {
    return <div className="nav-pill opacity-60">…</div>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-display font-black text-meme-yellow text-sm">{displayName}</span>
        <button onClick={signOut} className="nav-pill">[Sign out]</button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = mode === "signin" ? await signIn(username, password) : await signUp(username, password);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOpen(false);
    setUsername(""); setPassword("");
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setErr(null); }} className="nav-pill">
        [Log in]
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel w-full max-w-sm relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-2 right-3 text-white/60 hover:text-white text-xl"
            >
              ×
            </button>
            <div className="font-display font-black text-xl mb-3 tracking-widest">
              {mode === "signin" ? "LOG IN" : "SIGN UP"}
            </div>

            <form onSubmit={submit} className="space-y-2">
              <input
                className="w-full rounded-lg bg-black/40 border-2 border-white/20 focus:border-meme-yellow focus:outline-none px-3 py-2 text-sm"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
              <input
                className="w-full rounded-lg bg-black/40 border-2 border-white/20 focus:border-meme-yellow focus:outline-none px-3 py-2 text-sm"
                placeholder="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="btn-meme bg-meme-yellow text-black w-full !text-sm !py-2 disabled:opacity-50"
              >
                {busy ? "…" : mode === "signin" ? "Log in" : "Create account"}
              </button>
            </form>

            {err && <div className="mt-2 text-xs text-meme-pink">{err}</div>}

            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
              className="mt-3 text-xs text-white/60 underline hover:text-white"
            >
              {mode === "signin" ? "No account? Sign up" : "Have an account? Log in"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
