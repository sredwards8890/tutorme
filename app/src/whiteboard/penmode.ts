// Palm-rejection filter for capacitive styluses that Safari reports as pointerType "touch".
// Decides per pointer whether to accept (let the whiteboard see it) or reject (swallow it).
// Real pens ("pen") and the mouse are always accepted; while a real pen is down, touches are rejected.

export type Decision = "accept" | "reject";

export interface PenModeOptions {
  enabled: boolean;
  /** Touches whose reported contact width or height exceeds this (CSS px) are treated as a palm. */
  maxContactSize: number;
  /** A second touch that starts within this many ms of the first is allowed through as a pinch. */
  pinchWindowMs: number;
}

interface Active {
  type: string;
  downAt: number;
  decision: Decision;
  reason: string;
}

export class PenModeFilter {
  opts: PenModeOptions;
  private active = new Map<number, Active>();

  constructor(opts: PenModeOptions) {
    this.opts = opts;
  }

  /** Call for pointerdown/move/up/cancel. Returns the decision and a short reason (for logging). */
  decide(ev: PointerEvent): { decision: Decision; reason: string } {
    const id = ev.pointerId;
    if (ev.type === "pointerdown") {
      const d = this.decideDown(ev);
      this.active.set(id, { type: ev.pointerType, downAt: ev.timeStamp, ...d });
      return d;
    }
    const a = this.active.get(id);
    if (ev.type === "pointerup" || ev.type === "pointercancel") {
      this.active.delete(id);
    }
    if (a) return { decision: a.decision, reason: a.reason };
    // Move/up for a pointer we never saw go down (e.g. started outside): accept to be safe.
    return { decision: "accept", reason: "untracked" };
  }

  private decideDown(ev: PointerEvent): { decision: Decision; reason: string } {
    if (!this.opts.enabled) return { decision: "accept", reason: "pen-mode off" };
    if (ev.pointerType === "pen" || ev.pointerType === "mouse") {
      return { decision: "accept", reason: ev.pointerType };
    }
    const accepted = [...this.active.values()].filter((a) => a.decision === "accept");
    if (accepted.some((a) => a.type === "pen")) return { decision: "reject", reason: "pen active" };

    const size = Math.max(ev.width || 0, ev.height || 0);
    if (size > this.opts.maxContactSize) return { decision: "reject", reason: `palm size ${size.toFixed(0)}` };

    if (accepted.length === 0) return { decision: "accept", reason: "first touch" };
    if (accepted.length === 1 && ev.timeStamp - accepted[0].downAt <= this.opts.pinchWindowMs) {
      return { decision: "accept", reason: "pinch" };
    }
    return { decision: "reject", reason: `extra touch (${accepted.length} active)` };
  }

  reset() {
    this.active.clear();
  }
}

/**
 * Make every pen event report pressure 0.5 while it is down. Excalidraw treats exactly 0.5 as
 * "no pressure sensor, simulate width from velocity". Needed for styluses that report as "pen"
 * with a constant pressure (the tutor's generic stylus reports 0.12), which would otherwise
 * draw thin uniform strokes. Overrides the getter in place, so pointer capture and event
 * identity are untouched (re-dispatching a clone breaks Excalidraw's setPointerCapture).
 * Returns a setter to toggle it and the original (raw) getter for logging.
 */
export function installPenPressureNormalizer(initiallyEnabled = true) {
  const desc = Object.getOwnPropertyDescriptor(PointerEvent.prototype, "pressure");
  const raw = desc?.get;
  let enabled = initiallyEnabled;
  if (raw) {
    Object.defineProperty(PointerEvent.prototype, "pressure", {
      configurable: true,
      get(this: PointerEvent) {
        const p = raw.call(this) as number;
        return enabled && this.pointerType === "pen" && p > 0 ? 0.5 : p;
      },
    });
  }
  return {
    setEnabled(v: boolean) { enabled = v; },
    rawPressure(ev: PointerEvent) { return raw ? (raw.call(ev) as number) : ev.pressure; },
    uninstall() { if (desc) Object.defineProperty(PointerEvent.prototype, "pressure", desc); },
  };
}

/** Attach the filter to a container in the capture phase so the whiteboard never sees rejected events. */
export function installPenModeFilter(
  el: HTMLElement,
  filter: PenModeFilter,
  onDecision?: (ev: PointerEvent, decision: Decision, reason: string) => void,
) {
  const handler = (ev: PointerEvent) => {
    const { decision, reason } = filter.decide(ev);
    onDecision?.(ev, decision, reason);
    if (decision === "reject") {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
  for (const t of types) el.addEventListener(t, handler, { capture: true, passive: false });
  return () => {
    for (const t of types) el.removeEventListener(t, handler, { capture: true });
  };
}
