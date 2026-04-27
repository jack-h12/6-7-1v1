"use client";

import { useEffect, useRef } from "react";
import { useSound } from "./SoundToggle";

const SRC = "/Skrilla - Doot Doot (6 7) (Official Music Video).mp3";

export function HomeSong() {
  const { on } = useSound();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(SRC);
    a.preload = "auto";
    a.volume = 0.5;
    audioRef.current = a;

    const START_AT = 16;
    let didInitialSeek = false;
    // Only count the seek as done when metadata is actually available.
    // On mobile (esp. iOS), setting currentTime before metadata loads is a
    // silent no-op, so we must keep retrying on each readiness signal.
    const seekToStart = () => {
      if (didInitialSeek) return;
      if (a.readyState < 1) return;
      try {
        a.currentTime = START_AT;
        didInitialSeek = true;
      } catch {}
    };
    a.addEventListener("loadedmetadata", seekToStart);
    a.addEventListener("loadeddata", seekToStart);
    a.addEventListener("canplay", seekToStart);
    a.addEventListener("play", seekToStart);
    seekToStart();

    // Loop back to 0:16 instead of 0:00.
    a.loop = false;
    const onEnded = () => {
      try {
        a.currentTime = START_AT;
        a.play().catch(() => {});
      } catch {}
    };
    a.addEventListener("ended", onEnded);

    const tryPlay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(seekToStart).catch(() => {});
      }
    };

    tryPlay();

    // Fallback: most browsers block autoplay until a user gesture.
    const onGesture = () => {
      tryPlay();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      a.removeEventListener("loadedmetadata", seekToStart);
      a.removeEventListener("loadeddata", seekToStart);
      a.removeEventListener("canplay", seekToStart);
      a.removeEventListener("play", seekToStart);
      a.removeEventListener("ended", onEnded);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      a.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (on) {
      a.muted = false;
      a.play().catch(() => {});
    } else {
      a.muted = true;
    }
  }, [on]);

  return null;
}
