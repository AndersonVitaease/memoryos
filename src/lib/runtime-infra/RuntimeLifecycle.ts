// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeLifecycle
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export type LifecycleState =
  | "CREATED"
  | "QUEUED"
  | "READY"
  | "RUNNING"
  | "SUSPENDED"
  | "RESUMED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export const TERMINAL_STATES = new Set<LifecycleState>(["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"]);

export const ALLOWED_TRANSITIONS: Readonly<Record<LifecycleState, LifecycleState[]>> = {
  CREATED:   ["QUEUED", "CANCELLED"],
  QUEUED:    ["READY", "CANCELLED"],
  READY:     ["RUNNING", "CANCELLED"],
  RUNNING:   ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "SUSPENDED"],
  SUSPENDED: ["RESUMED", "CANCELLED", "FAILED"],
  RESUMED:   ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED:    [],
  CANCELLED: [],
  TIMEOUT:   [],
};

export interface StateEntry {
  readonly state: LifecycleState;
  readonly occurredAt: number;
  readonly detail: string;
}

export class RuntimeLifecycle {
  private _state: LifecycleState = "CREATED";
  private _history: StateEntry[] = [];
  private _clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this._clock = clock;
    this._history.push(Object.freeze({ state: "CREATED", occurredAt: clock(), detail: "created" }));
  }

  transition(next: LifecycleState, detail = ""): void {
    if (TERMINAL_STATES.has(this._state)) {
      throw new Error(`Cannot transition from terminal state ${this._state} to ${next}`);
    }
    const allowed = ALLOWED_TRANSITIONS[this._state] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid transition: ${this._state} -> ${next}`);
    }
    this._state = next;
    this._history.push(Object.freeze({ state: next, occurredAt: this._clock(), detail }));
  }

  // Advance through canonical path up to target
  advanceTo(target: LifecycleState): void {
    const path: LifecycleState[] = ["QUEUED", "READY", "RUNNING"];
    const idx = path.indexOf(target);
    if (idx < 0) { this.transition(target); return; }
    for (const s of path.slice(0, idx + 1)) {
      if (TERMINAL_STATES.has(this._state)) break;
      const allowed = ALLOWED_TRANSITIONS[this._state] ?? [];
      if (allowed.includes(s)) this.transition(s, `auto-advance to ${s}`);
    }
  }

  tryTransition(next: LifecycleState, detail = ""): boolean {
    try { this.transition(next, detail); return true; } catch { return false; }
  }

  state(): LifecycleState { return this._state; }
  isTerminal(): boolean { return TERMINAL_STATES.has(this._state); }
  history(): Readonly<StateEntry[]> { return Object.freeze([...this._history]); }

  isChronological(): boolean {
    const h = this._history;
    for (let i = 1; i < h.length; i++) {
      if (h[i].occurredAt < h[i - 1].occurredAt) return false;
    }
    return true;
  }
}