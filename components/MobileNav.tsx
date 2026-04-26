"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./AuthContext";

/** Slide-in side menu containing all nav links + auth, for mobile only. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { user, displayName, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { signIn, signUp } = useAuth();

  const close = () => setOpen(false);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = mode === "signin" ? await signIn(username, password) : await signUp(username, password);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setAuthOpen(false); setUsername(""); setPassword("");
  };

  return (
    <>
      <button
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="nav-pill !px-3 !py-2"
      >
        <span className="block w-5">
          <span className="block h-0.5 bg-current mb-1" />
          <span className="block h-0.5 bg-current mb-1" />
          <span className="block h-0.5 bg-current" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70" onClick={close}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-black/90 border-l-2 border-white/10 p-5 flex flex-col gap-3 overflow-y-auto"
          >
            <button
              onClick={close}
              aria-label="Close"
              className="self-end text-white/70 hover:text-white text-2xl leading-none"
            >
              ×
            </button>

            <Link href="/duel" onClick={close} className="nav-pill text-center">[Play Now]</Link>
            <Link href="/practice" onClick={close} className="nav-pill text-center">[Practice Room]</Link>
            <a href="#leaderboard" onClick={close} className="nav-pill text-center">[Most Brainrotted (Leaderboard)]</a>
            <a href="#how" onClick={close} className="nav-pill text-center">[How to Play]</a>

            <div className="my-2 h-px bg-white/10" />

            {user ? (
              <>
                <div className="text-center text-sm">
                  <div className="text-white/50 text-xs">Signed in as</div>
                  <div className="font-display font-black text-meme-yellow">{displayName}</div>
                </div>
                <button onClick={() => { signOut(); close(); }} className="nav-pill text-center">
                  [Sign out]
                </button>
              </>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="nav-pill text-center">
                [Log in]
              </button>
            )}
          </aside>
        </div>
      )}

      {authOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4"
          onClick={() => setAuthOpen(false)}
        >
          <div className="panel w-full max-w-sm relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setAuthOpen(false)}
              aria-label="Close"
              className="absolute top-2 right-3 text-white/60 hover:text-white text-xl"
            >
              ×
            </button>
            <div className="font-display font-black text-xl mb-3 tracking-widest">
              {mode === "signin" ? "LOG IN" : "SIGN UP"}
            </div>

            <form onSubmit={submitAuth} className="space-y-2">
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
