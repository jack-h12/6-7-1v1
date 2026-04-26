"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { GestureDetector, GestureSnapshot, HandLandmark } from "./gestureLogic";

/**
 * Loads MediaPipe Tasks Vision, runs HandLandmarker in VIDEO mode, classifies
 * each detected hand as "left" or "right" from the USER'S perspective, and
 * feeds both wrist Y values per frame into the GestureDetector.
 */

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

/**
 * MediaPipe Tasks Vision reports handedness from the user's perspective on
 * the raw video stream we hand it (the CSS `scale-x-[-1]` is display-only),
 * so its "Left"/"Right" already match the user's anatomical hands.
 */
function labelHand(
  wrist: { x: number; y: number },
  raw: string | undefined,
): "left" | "right" {
  if (raw === "Left") return "left";
  if (raw === "Right") return "right";
  // No handedness for this frame — fall back to image x. In the raw
  // (unmirrored) image, a hand on the LEFT side (x<0.5) belongs to the
  // user's RIGHT hand under the selfie-mirror displayed to the user.
  return wrist.x < 0.5 ? "right" : "left";
}

export interface UseHandTrackingOptions {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onRep?: (snapshot: GestureSnapshot) => void;
}

export interface TrackedHands {
  left: HandLandmark[] | null;
  right: HandLandmark[] | null;
}

/** Wrist landmark cached for nearest-neighbour assignment across frames. */
interface WristTrack {
  x: number;
  y: number;
  /** performance.now() timestamp the position was last updated. */
  t: number;
}

/** How long a remembered wrist position is allowed to influence assignment. */
const WRIST_TRACK_TTL_MS = 800;

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function useHandTracking({ enabled, videoRef, onRep }: UseHandTrackingOptions) {
  const detectorRef = useRef<GestureDetector>(new GestureDetector());
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  // Last-known wrist positions used for sticky left/right assignment when
  // MediaPipe's per-frame handedness flickers under fast motion.
  const lastLeftRef = useRef<WristTrack | null>(null);
  const lastRightRef = useRef<WristTrack | null>(null);
  // Per-frame hand landmarks live in a ref, NOT in React state, so the
  // overlay can paint at full camera framerate without paying for a render
  // cycle each frame (which would add ~16-50ms of perceived latency).
  const handsRef = useRef<TrackedHands>({ left: null, right: null });
  const lastSnapshotRef = useRef<GestureSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(() =>
    detectorRef.current.snapshot(false, false)
  );

  useEffect(() => {
    detectorRef.current.onRep = onRep;
  }, [onRep]);

  const reset = useCallback(() => {
    detectorRef.current.reset();
    lastLeftRef.current = null;
    lastRightRef.current = null;
    handsRef.current = { left: null, right: null };
    const fresh = detectorRef.current.snapshot(false, false);
    lastSnapshotRef.current = fresh;
    setSnapshot(fresh);
  }, []);

  // Push snapshot to React state ONLY when a UI-visible field changes.
  // Per-frame churn in smoothedY values isn't user-visible — skipping it
  // saves a full render cycle every video frame.
  const publishSnapshot = useCallback((snap: GestureSnapshot) => {
    const prev = lastSnapshotRef.current;
    const changed =
      !prev ||
      prev.reps !== snap.reps ||
      prev.combo !== snap.combo ||
      prev.comboMultiplier !== snap.comboMultiplier ||
      prev.state !== snap.state ||
      prev.handVisible !== snap.handVisible ||
      prev.leftVisible !== snap.leftVisible ||
      prev.rightVisible !== snap.rightVisible;
    if (changed) {
      lastSnapshotRef.current = snap;
      setSnapshot(snap);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          // Require BOTH hands — strict alternation needs to see each wrist.
          numHands: 2,
          // Lowered from 0.5 — under motion blur the model is less confident,
          // and we'd rather get a slightly noisier landmark than no detection.
          // The state machine handles the noise via debounce + EMA.
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);

        const loop = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const lm = landmarkerRef.current;
          if (video && lm && video.readyState >= 2 && !video.paused) {
            const t = performance.now();
            if (video.currentTime !== lastVideoTimeRef.current) {
              lastVideoTimeRef.current = video.currentTime;
              try {
                const res: HandLandmarkerResult = lm.detectForVideo(video, t);
                const lms = (res.landmarks ?? []) as HandLandmark[][];
                const hd = res.handedness ?? [];

                // Expire stale wrist tracks so a long disappearance can't
                // misclassify a hand that reappeared somewhere unexpected.
                if (lastLeftRef.current && t - lastLeftRef.current.t > WRIST_TRACK_TTL_MS) {
                  lastLeftRef.current = null;
                }
                if (lastRightRef.current && t - lastRightRef.current.t > WRIST_TRACK_TTL_MS) {
                  lastRightRef.current = null;
                }

                let leftHand: HandLandmark[] | null = null;
                let rightHand: HandLandmark[] | null = null;

                if (lms.length === 2) {
                  // Two hands detected — assign by minimum total distance to
                  // last-known positions when available; otherwise fall back to
                  // MediaPipe handedness, then to image x-position.
                  const w0 = lms[0][0];
                  const w1 = lms[1][0];
                  const pl = lastLeftRef.current;
                  const pr = lastRightRef.current;
                  if (pl && pr) {
                    const same = dist2(w0, pl) + dist2(w1, pr);
                    const swap = dist2(w0, pr) + dist2(w1, pl);
                    if (same <= swap) { leftHand = lms[0]; rightHand = lms[1]; }
                    else { leftHand = lms[1]; rightHand = lms[0]; }
                  } else {
                    for (let i = 0; i < 2; i++) {
                      const label = labelHand(lms[i][0], hd[i]?.[0]?.categoryName);
                      if (label === "left" && !leftHand) leftHand = lms[i];
                      else if (label === "right" && !rightHand) rightHand = lms[i];
                    }
                    // If both ended up on the same side, split by image x.
                    if (!leftHand || !rightHand) {
                      const sorted = [...lms].sort((a, b) => a[0].x - b[0].x);
                      // raw image: smaller x = user's right hand
                      rightHand = sorted[0];
                      leftHand = sorted[1];
                    }
                  }
                } else if (lms.length === 1) {
                  // One hand — prefer last-known nearest, then handedness.
                  const w = lms[0][0];
                  const pl = lastLeftRef.current;
                  const pr = lastRightRef.current;
                  if (pl && pr) {
                    if (dist2(w, pl) <= dist2(w, pr)) leftHand = lms[0];
                    else rightHand = lms[0];
                  } else if (pl) {
                    leftHand = lms[0];
                  } else if (pr) {
                    rightHand = lms[0];
                  } else {
                    const label = labelHand(w, hd[0]?.[0]?.categoryName);
                    if (label === "left") leftHand = lms[0];
                    else rightHand = lms[0];
                  }
                }

                if (leftHand) lastLeftRef.current = { x: leftHand[0].x, y: leftHand[0].y, t };
                if (rightHand) lastRightRef.current = { x: rightHand[0].x, y: rightHand[0].y, t };

                // Synchronous ref update — overlay reads this without waiting
                // for a React render.
                handsRef.current = { left: leftHand, right: rightHand };

                // ---- Feed the detector: per-hand vertical extents across all landmarks ----
                const extents = (h: HandLandmark[] | null) => {
                  if (!h || h.length === 0) return { min: null, max: null } as const;
                  let min = h[0].y;
                  let max = h[0].y;
                  for (let i = 1; i < h.length; i++) {
                    const y = h[i].y;
                    if (y < min) min = y;
                    if (y > max) max = y;
                  }
                  return { min, max } as const;
                };
                const re = extents(rightHand);
                const le = extents(leftHand);
                const snap = detectorRef.current.update({
                  rightMinY: re.min,
                  rightMaxY: re.max,
                  leftMinY: le.min,
                  leftMaxY: le.max,
                  t,
                });
                publishSnapshot(snap);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("handLandmarker.detectForVideo", e);
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("Hand tracking init failed", e);
        setError(e?.message ?? "Failed to load hand tracker");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch {}
        landmarkerRef.current = null;
      }
      setReady(false);
    };
  }, [enabled, videoRef]);

  return { ready, error, snapshot, reset, detector: detectorRef, handsRef };
}
