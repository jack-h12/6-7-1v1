"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { GestureState, HandLandmark } from "@/lib/gestureLogic";

interface PalmRef {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
}

interface OverlayHands {
  left: HandLandmark[] | null;
  right: HandLandmark[] | null;
  leftPalm: PalmRef | null;
  rightPalm: PalmRef | null;
}

/** Cap on how far we extrapolate the palm forward in time. Above ~50 ms the
 *  prediction overshoots noticeably when the hand suddenly stops or reverses. */
const MAX_PREDICTION_MS = 50;

export interface WebcamViewProps {
  active: boolean;
  /** Live ref to classified hands from the tracker — read every animation frame
   *  so the overlay paints with no React-render latency. */
  handsRef?: React.RefObject<OverlayHands>;
  /** Normalized Y thresholds for overlay lines. */
  topLine?: number;
  bottomLine?: number;
  /** Current gesture state for on-screen debug. */
  state?: GestureState;
  mirrored?: boolean;
  className?: string;
  /** Fires when the local MediaStream becomes available (or null on teardown). */
  onStream?: (stream: MediaStream | null) => void;
}

/**
 * Webcam feed with overlay that visualizes everything the gesture detector
 * is seeing:
 *   - TOP (cyan) and BOTTOM (pink) threshold lines.
 *   - RIGHT wrist dot (yellow, labeled "R"), LEFT wrist dot (magenta, "L").
 *   - A state badge in the corner (not mirrored so text reads correctly).
 */
export const WebcamView = forwardRef<HTMLVideoElement, WebcamViewProps>(function WebcamView(
  { active, handsRef, topLine = 0.35, bottomLine = 0.65, state, mirrored = true, className, onStream },
  ref
) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const setVideoRef = (el: HTMLVideoElement | null) => {
    internalVideoRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
  };

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // 60fps is critical: at 30fps a fast 6-7 rep can complete entirely
          // between two frames, so we'd never see the boundary crossings.
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
            frameRate: { ideal: 60, min: 30 },
          },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = internalVideoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
        onStream?.(stream);
      } catch (e: any) {
        setError(e?.message ?? "Could not access webcam");
      }
    })();
    return () => {
      cancelled = true;
      setReady(false);
      const v = internalVideoRef.current;
      if (v) v.srcObject = null;
      stream?.getTracks().forEach((t) => t.stop());
      onStream?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Overlay loop — single stable raf reading the live hands ref every frame.
  // No React-state dependency, so wrist dots paint immediately after each
  // MediaPipe inference without waiting for a render cycle.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = internalVideoRef.current;
      const c = canvasRef.current;
      if (v && c && v.videoWidth) {
        if (c.width !== v.videoWidth) c.width = v.videoWidth;
        if (c.height !== v.videoHeight) c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);

          // TOP threshold (cyan)
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.strokeStyle = "rgba(0,229,255,0.85)";
          ctx.beginPath();
          ctx.moveTo(0, topLine * c.height);
          ctx.lineTo(c.width, topLine * c.height);
          ctx.stroke();
          ctx.fillStyle = "rgba(0,229,255,0.85)";
          ctx.font = "bold 14px ui-sans-serif,system-ui";
          drawMirrorAwareText(ctx, "TOP", c.width - 44, topLine * c.height - 6, mirrored);

          // BOTTOM threshold (pink)
          ctx.strokeStyle = "rgba(255,46,166,0.85)";
          ctx.beginPath();
          ctx.moveTo(0, bottomLine * c.height);
          ctx.lineTo(c.width, bottomLine * c.height);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,46,166,0.85)";
          drawMirrorAwareText(ctx, "BOTTOM", c.width - 72, bottomLine * c.height + 18, mirrored);
          ctx.setLineDash([]);

          const hands = handsRef?.current;
          const now = performance.now();
          if (hands?.rightPalm) drawPalm(ctx, hands.rightPalm, now, c, "R", "#ffe600", mirrored);
          if (hands?.leftPalm)  drawPalm(ctx, hands.leftPalm,  now, c, "L", "#ff2ea6", mirrored);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [handsRef, topLine, bottomLine, mirrored]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border-4 border-black bg-black ${className ?? ""}`}>
      <video
        ref={setVideoRef}
        className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full pointer-events-none ${mirrored ? "scale-x-[-1]" : ""}`}
      />

      {/* State badge — rendered as HTML so it reads correctly regardless of mirroring */}
      {state && (
        <div className="absolute top-2 left-2 z-10 font-mono text-[11px] leading-tight bg-black/75 border-2 border-meme-yellow rounded-md px-2 py-1 text-meme-yellow pointer-events-none">
          <div className="font-display font-black tracking-wider">STATE</div>
          <div>{state}</div>
        </div>
      )}

      {!ready && !error && active && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-center p-4">
          <div>
            <div className="text-2xl font-display font-black">Loading camera…</div>
            <div className="text-sm text-white/60 mt-2">Allow webcam access in your browser.</div>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-center p-6">
          <div>
            <div className="text-2xl font-display font-black text-meme-pink">Camera blocked</div>
            <div className="text-sm text-white/70 mt-2 max-w-xs">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
});

function drawPalm(
  ctx: CanvasRenderingContext2D,
  p: PalmRef,
  now: number,
  c: HTMLCanvasElement,
  tag: string,
  color: string,
  mirrored: boolean
) {
  // Extrapolate the palm forward to "now" using its measured velocity. The
  // model's inference + capture latency is normally ~20–30 ms, so without
  // this the dot trails noticeably behind the visible hand on fast 6-7s.
  const dt = Math.min(Math.max(now - p.t, 0), MAX_PREDICTION_MS);
  const px = p.x + p.vx * dt;
  const py = p.y + p.vy * dt;
  // The canvas itself is CSS-mirrored when `mirrored` is true, so drawing in
  // raw landmark coordinates already lines the dot up with the visible hand.
  const x = px * c.width;
  const y = py * c.height;
  ctx.fillStyle = color;
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "bold 14px ui-sans-serif,system-ui";
  drawMirrorAwareText(ctx, tag, x - 5, y + 5, mirrored);
}

/** Canvas is CSS-mirrored; flip the text transform so letters read normally. */
function drawMirrorAwareText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  mirrored: boolean
) {
  if (!mirrored) { ctx.fillText(text, x, y); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
