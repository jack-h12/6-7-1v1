"use client";

import { useEffect, useState } from "react";

const KEY = "sixseven:sound";

// Shared store so every useSound() consumer sees the same value live.
let current = true;
const listeners = new Set<(v: boolean) => void>();
let initialized = false;

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) current = v === "1";
  } catch {}
  // Pick up changes from other tabs.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || e.newValue == null) return;
    current = e.newValue === "1";
    listeners.forEach((l) => l(current));
  });
}

function setSound(next: boolean) {
  current = next;
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
  listeners.forEach((l) => l(next));
}

export function useSound() {
  ensureInit();
  const [on, setOn] = useState(current);
  useEffect(() => {
    setOn(current);
    const l = (v: boolean) => setOn(v);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const toggle = () => setSound(!current);
  return { on, toggle };
}

export function SoundToggle({ className }: { className?: string }) {
  const { on, toggle } = useSound();
  return (
    <button
      aria-label="toggle sound"
      onClick={toggle}
      className={className ?? "panel px-3 py-2 font-display font-black text-sm hover:bg-white/10 transition"}
    >
      {on ? "🔊 SOUND ON" : "🔇 SOUND OFF"}
    </button>
  );
}
