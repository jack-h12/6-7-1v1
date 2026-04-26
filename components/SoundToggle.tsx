"use client";

import { useEffect, useState } from "react";

const KEY = "sixseven:sound";

export function useSound() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (v !== null) setOn(v === "1");
  }, []);
  const toggle = () => {
    setOn((v) => {
      const next = !v;
      try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };
  return { on, toggle };
}

export function SoundToggle() {
  const { on, toggle } = useSound();
  return (
    <button
      aria-label="toggle sound"
      onClick={toggle}
      className="panel px-3 py-2 font-display font-black text-sm hover:bg-white/10 transition"
    >
      {on ? "🔊 SOUND ON" : "🔇 SOUND OFF"}
    </button>
  );
}
