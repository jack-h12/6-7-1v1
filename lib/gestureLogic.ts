/**
 * 6-7 Gesture Detector — opposed-pose counter.
 * ---------------------------------------------------------------------------
 * Rep rule:
 *   • Both hands are simultaneously visible with ANY landmark of one hand in
 *     the TOP zone and ANY landmark of the other hand in the BOTTOM zone.
 *   • Each transition INTO a new opposed configuration counts as one rep.
 *   • Holding the same opposed pose does NOT keep adding reps; flipping to
 *     the mirrored opposed pose (top/bottom hands swapped) counts again.
 *
 * The caller passes per-hand min/max Y (highest and lowest landmark) so the
 * detector treats the whole hand as the trigger, not just the wrist.
 */

export type Wrist = "left" | "right";
export type Boundary = "top" | "bottom";

/** Kept for type compatibility with consumers; detector is always IDLE now. */
export type GestureState = "IDLE" | "ARMED";

interface OpposedConfig {
  topWrist: Wrist;
  bottomWrist: Wrist;
}

export interface GestureConfigShape {
  /** Y above this = "TOP zone" (in normalized image coords, 0 is top). */
  TOP_Y: number;
  /** Y below this = "BOTTOM zone". */
  BOTTOM_Y: number;
  /** Retained for back-compat; unused in the pose-only detector. */
  EDGE_DEBOUNCE_MS: number;
  /** If a wrist hasn't been seen for this long, treat the next sighting as a fresh start. */
  OFFSCREEN_RESUME_MS: number;
  /** EMA alpha applied to wrist Y (1 = no smoothing, just passthrough). */
  EMA_ALPHA: number;
  /** Window in which consecutive reps extend the combo counter (UI flair). */
  COMBO_WINDOW_MS: number;
}

export const GestureConfig: GestureConfigShape = {
  TOP_Y: 0.35,
  BOTTOM_Y: 0.65,
  EDGE_DEBOUNCE_MS: 50,
  OFFSCREEN_RESUME_MS: 150,
  EMA_ALPHA: 1.0,
  COMBO_WINDOW_MS: 900,
};

export interface GestureTick {
  /** Smallest (highest on screen) landmark Y of the right hand, or null if absent. */
  rightMinY: number | null;
  /** Largest (lowest on screen) landmark Y of the right hand, or null if absent. */
  rightMaxY: number | null;
  leftMinY: number | null;
  leftMaxY: number | null;
  t: number;
}

export interface GestureLogEntry {
  t: number;
  msg: string;
}

export interface GestureSnapshot {
  reps: number;
  combo: number;
  comboMultiplier: number;
  lastEventAt: number;
  state: GestureState;
  handVisible: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  smoothedLeftY: number | null;
  smoothedRightY: number | null;
  log: GestureLogEntry[];
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const LOG_CAP = 16;

export class GestureDetector {
  // --- score / combo (UI) ---
  private reps = 0;
  private combo = 0;
  private comboExpiresAt = 0;
  private lastEventAt = 0;

  // --- latest per-hand vertical extents (any landmark) ---
  private leftMinY: number | null = null;
  private leftMaxY: number | null = null;
  private rightMinY: number | null = null;
  private rightMaxY: number | null = null;

  // --- last opposed configuration counted (held poses don't double-count) ---
  private prevOpposed: OpposedConfig | null = null;

  // --- log ring buffer ---
  private log: GestureLogEntry[] = [];

  public onRep?: (snapshot: GestureSnapshot) => void;
  public onLog?: (entry: GestureLogEntry) => void;

  constructor(private readonly config: GestureConfigShape = { ...GestureConfig }) {}

  configure(partial: Partial<GestureConfigShape>) {
    Object.assign(this.config, partial);
  }

  reset() {
    this.reps = 0;
    this.combo = 0;
    this.comboExpiresAt = 0;
    this.lastEventAt = 0;
    this.leftMinY = this.leftMaxY = this.rightMinY = this.rightMaxY = null;
    this.prevOpposed = null;
    this.log = [];
    this.pushLog(0, "reset");
  }

  update(tick: GestureTick): GestureSnapshot {
    const { rightMinY, rightMaxY, leftMinY, leftMaxY, t } = tick;
    this.rightMinY = rightMinY != null ? clamp(rightMinY, 0, 1) : null;
    this.rightMaxY = rightMaxY != null ? clamp(rightMaxY, 0, 1) : null;
    this.leftMinY = leftMinY != null ? clamp(leftMinY, 0, 1) : null;
    this.leftMaxY = leftMaxY != null ? clamp(leftMaxY, 0, 1) : null;

    this.checkOpposedPose(t);

    if (this.combo > 0 && t > this.comboExpiresAt) this.combo = 0;

    const rightVisible = rightMinY != null;
    const leftVisible = leftMinY != null;
    return this.snapshot(rightVisible, leftVisible);
  }

  private checkOpposedPose(t: number) {
    const lMin = this.leftMinY;
    const lMax = this.leftMaxY;
    const rMin = this.rightMinY;
    const rMax = this.rightMaxY;
    if (lMin == null || lMax == null || rMin == null || rMax == null) {
      this.prevOpposed = null;
      return;
    }
    const cfg = this.config;
    // "Hand is in top zone" = ANY landmark above TOP_Y (smallest y < TOP_Y).
    // "Hand is in bottom zone" = ANY landmark below BOTTOM_Y (largest y > BOTTOM_Y).
    const leftInTop = lMin < cfg.TOP_Y;
    const leftInBottom = lMax > cfg.BOTTOM_Y;
    const rightInTop = rMin < cfg.TOP_Y;
    const rightInBottom = rMax > cfg.BOTTOM_Y;
    let current: OpposedConfig | null = null;
    if (leftInTop && rightInBottom && !(rightInTop && leftInBottom)) {
      current = { topWrist: "left", bottomWrist: "right" };
    } else if (rightInTop && leftInBottom && !(leftInTop && rightInBottom)) {
      current = { topWrist: "right", bottomWrist: "left" };
    }
    if (!current) {
      this.prevOpposed = null;
      return;
    }
    const same =
      this.prevOpposed &&
      this.prevOpposed.topWrist === current.topWrist &&
      this.prevOpposed.bottomWrist === current.bottomWrist;
    if (same) return;

    this.reps += 1;
    if (t < this.comboExpiresAt) this.combo += 1;
    else this.combo = 1;
    this.comboExpiresAt = t + this.config.COMBO_WINDOW_MS;
    this.lastEventAt = t;
    this.prevOpposed = current;
    this.pushLog(
      t,
      `rep=${this.reps} ✓ (top=${current.topWrist}, bottom=${current.bottomWrist})`,
    );
    this.onRep?.(this.snapshot(true, true));
  }

  private pushLog(t: number, msg: string) {
    const entry = { t, msg };
    this.log.push(entry);
    if (this.log.length > LOG_CAP) this.log.shift();
    this.onLog?.(entry);
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[6-7 gesture @${t.toFixed(0)}] ${msg}`);
    }
  }

  private comboMultiplier(): number {
    if (this.combo >= 20) return 4;
    if (this.combo >= 10) return 3;
    if (this.combo >= 5) return 2;
    return 1;
  }

  snapshot(rightVisible: boolean, leftVisible: boolean): GestureSnapshot {
    return {
      reps: this.reps,
      combo: this.combo,
      comboMultiplier: this.comboMultiplier(),
      lastEventAt: this.lastEventAt,
      state: "IDLE",
      handVisible: rightVisible || leftVisible,
      rightVisible,
      leftVisible,
      smoothedLeftY:
        this.leftMinY != null && this.leftMaxY != null
          ? (this.leftMinY + this.leftMaxY) / 2
          : null,
      smoothedRightY:
        this.rightMinY != null && this.rightMaxY != null
          ? (this.rightMinY + this.rightMaxY) / 2
          : null,
      log: this.log.slice(),
    };
  }

  get score(): number {
    return this.reps;
  }
}
