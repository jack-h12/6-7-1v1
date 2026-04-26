"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MatchPhase = "idle" | "countdown" | "running" | "finished";

export interface UseMatchClockOpts {
  /** duration of the timed phase, default 10_000ms */
  durationMs?: number;
  /** called once when the match ends */
  onEnd?: () => void;
}

/**
 * Simple three-phase clock: idle -> countdown -> running -> finished.
 * The countdown component drives the transition from `countdown` -> `running`;
 * this hook then runs a rAF-driven timer for the running phase.
 */
export function useMatchClock({ durationMs = 10_000, onEnd }: UseMatchClockOpts = {}) {
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const startAt = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const start = useCallback(() => {
    endedRef.current = false;
    setRemainingMs(durationMs);
    setPhase("countdown");
  }, [durationMs]);

  const beginRunning = useCallback(() => {
    startAt.current = performance.now();
    endedRef.current = false;
    setPhase("running");
  }, []);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    endedRef.current = false;
    setRemainingMs(durationMs);
    setPhase("idle");
  }, [durationMs]);

  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      if (startAt.current == null) return;
      const elapsed = performance.now() - startAt.current;
      const rem = Math.max(0, durationMs - elapsed);
      setRemainingMs(rem);
      if (rem <= 0) {
        if (!endedRef.current) {
          endedRef.current = true;
          setPhase("finished");
          onEndRef.current?.();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, durationMs]);

  return { phase, remainingMs, start, beginRunning, reset, durationMs };
}
