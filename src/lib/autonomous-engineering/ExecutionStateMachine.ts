/**
 * ExecutionStateMachine.ts — Sprint 6.3.3
 * Valid state transitions for the Autonomous Engineering Loop
 */

import type { AELState } from "./AELTypes";

const TRANSITIONS: Record<AELState, AELState[]> = {
  IDLE:             ["ANALYZING", "FAILED"],
  ANALYZING:        ["PLANNING", "FAILED"],
  PLANNING:         ["WAITING_APPROVAL", "IMPLEMENTING", "FAILED"],
  WAITING_APPROVAL: ["IMPLEMENTING", "FAILED"],
  IMPLEMENTING:     ["RECOVERING", "VALIDATING", "FAILED"],
  RECOVERING:       ["VALIDATING", "FAILED"],
  VALIDATING:       ["LEARNING", "FAILED"],
  LEARNING:         ["READY", "FAILED"],
  READY:            [],
  FAILED:           [],
};

export class ExecutionStateMachine {
  private _state: AELState = "IDLE";
  private _history: Array<{ state: AELState; at: number }> = [{ state: "IDLE", at: Date.now() }];

  get state(): AELState { return this._state; }

  canTransition(to: AELState): boolean {
    return TRANSITIONS[this._state]?.includes(to) ?? false;
  }

  transition(to: AELState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid transition: ${this._state} → ${to}`);
    }
    this._state = to;
    this._history.push({ state: to, at: Date.now() });
  }

  history(): Array<{ state: AELState; at: number }> {
    return [...this._history];
  }

  isTerminal(): boolean {
    return this._state === "READY" || this._state === "FAILED";
  }
}