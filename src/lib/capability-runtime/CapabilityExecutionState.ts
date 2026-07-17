/**
 * CapabilityExecutionState.ts — Sprint C-03.6.3
 * State machine for a single capability execution.
 * Pure deterministic transitions — no side-effects.
 */

import type { ExecutionState, StateSnapshot, TerminalState } from "./CapabilityRuntimeTypes";
import { TERMINAL_STATES } from "./CapabilityRuntimeTypes";

const ALLOWED: Readonly<Partial<Record<ExecutionState, ExecutionState[]>>> = {
  CREATED:    ["QUEUED"],
  QUEUED:     ["STARTING"],
  STARTING:   ["RUNNING"],
  RUNNING:    ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"],
  // Terminal states: no outgoing transitions
};

export class CapabilityExecutionState {
  private _state:   ExecutionState             = "CREATED";
  private readonly _history: StateSnapshot[]   = [];

  constructor() {
    this._push("CREATED", "Execution created");
  }

  /** Attempt a state transition. Throws if invalid. */
  transition(next: ExecutionState, detail = ""): void {
    if (TERMINAL_STATES.has(this._state)) {
      throw new Error(`Cannot transition from terminal state "${this._state}" to "${next}"`);
    }
    const allowed = ALLOWED[this._state] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid transition: "${this._state}" → "${next}". Allowed: [${allowed.join(", ")}]`);
    }
    this._state = next;
    this._push(next, detail);
  }

  /** Force-queue (CREATED → QUEUED → STARTING → RUNNING) for convenience. */
  advanceTo(target: "QUEUED" | "STARTING" | "RUNNING"): void {
    const path: ExecutionState[] = ["QUEUED", "STARTING", "RUNNING"];
    const idx = path.indexOf(target);
    path.slice(0, idx + 1).forEach(s => {
      if (!TERMINAL_STATES.has(this._state) && (ALLOWED[this._state] ?? []).includes(s)) {
        this.transition(s, `Auto-advance to ${s}`);
      }
    });
  }

  state(): ExecutionState { return this._state; }

  isTerminal(): boolean { return TERMINAL_STATES.has(this._state); }

  history(): readonly Readonly<StateSnapshot>[] {
    return Object.freeze([...this._history]);
  }

  private _push(state: ExecutionState, detail: string): void {
    const snapshot: StateSnapshot = Object.freeze({ state, occurredAt: Date.now(), detail }) as StateSnapshot;
    this._history.push(snapshot);
  }
}