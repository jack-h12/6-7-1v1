"use client";

import { useEffect, useRef } from "react";
import { useSound } from "./SoundToggle";

const SRC = "/Skrilla - Doot Doot (6 7) (Official Music Video).mp3";

export function HomeSong() {
  const { on } = useSound();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(SRC);
    a.loop = true;
    a.volume = 0.5;
    audioRef.current = a;

    const START_AT = 16;
    let seeked = false;
    const seekToStart = () => {
      if (seeked) return;
      try {
        a.currentTime = START_AT;
        seeked = true;
      } catch {}
    };
    if (a.readyState >= 1) seekToStart();
    else a.addEventListener("loadedmetadata", seekToStart, { once: true });

    // Loop back to 0:16 instead of 0:00.
    a.loop = false;
    a.addEventListener("ended", () => {
      try {
        a.currentTime = START_AT;
        a.play().catch(() => {});
      } catch {}
    });

    const tryPlay = () => {
      if (!audioRef.current) return;
      seekToStart();
      audioRef.current.play().catch(() => {});
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
