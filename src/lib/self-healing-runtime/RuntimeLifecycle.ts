/**
 * RuntimeLifecycle.ts — Sprint 6.3.1
 * Manages the formal lifecycle state machine of the Self-Healing Runtime.
 * States: IDLE → STARTING → READY → RESTARTING → RECOVERING → DEGRADED → STOPPED
 */

import type { RuntimeState } from "./SHRTypes";
import { RuntimeEventBus } from "./RuntimeEventBus";

const VALID_TRANSITIONS: Record<RuntimeState, RuntimeState[]> = {
  IDLE:       ["STARTING", "STOPPED"],
  STARTING:   ["READY", "FAILED"],
  READY:      ["RESTARTING", "RECOVERING", "DEGRADED", "STOPPING" as RuntimeState, "STOPPED"],
  RESTARTING: ["READY", "RECOVERING", "FAILED"],
  RECOVERING: ["READY", "DEGRADED", "FAILED"],
  DEGRADED:   ["RECOVERING", "STOPPED", "READY"],
  FAILED:     ["RECOVERING", "STOPPED"],
  STOPPED:    ["STARTING", "IDLE"],
};

export class RuntimeLifecycle {
  private _state: RuntimeState = "IDLE";
  private _bus: RuntimeEventBus;
  private _history: { state: RuntimeState; at: number }[] = [];
  private _startedAt?: number;

  constructor(bus: RuntimeEventBus) { this._bus = bus; }

  transition(next: RuntimeState, reason = ""): boolean {
    const allowed = VALID_TRANSITIONS[this._state] ?? [];
    if (!allowed.includes(next)) {
      return false;
    }

    const prev = this._state;
    this._state = next;
    this._history.unshift({ state: next, at: Date.now() });
    if (this._history.length > 100) this._history.splice(100);

    if (next === "STARTING") this._startedAt = Date.now();

    // Emit semantic events
    if (next === "READY")      this._bus.emit("RuntimeStarted",    { from: prev, reason });
    if (next === "RESTARTING") this._bus.emit("RuntimeRestarting", { from: prev, reason });
    if (next === "STOPPING" as RuntimeState)  this._bus.emit("RuntimeStopping", { from: prev, reason });
    if (next === "READY" && prev === "RECOVERING") this._bus.emit("RuntimeRecovered", { from: prev, reason });

    return true;
  }

  state(): RuntimeState { return this._state; }

  isReady(): boolean { return this._state === "READY"; }

  history(): { state: RuntimeState; at: number }[] { return [...this._history]; }

  uptimeMs(): number {
    return this._startedAt ? Date.now() - this._startedAt : 0;
  }

  forceState(state: RuntimeState): void {
    this._state = state;
    this._history.unshift({ state, at: Date.now() });
  }
}