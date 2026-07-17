// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeClock
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import type { IClock, ClockMode } from "./RuntimeClockTypes";

// ── SystemClock ───────────────────────────────────────────────────────────────
export class SystemClock implements IClock {
  now(): number { return Date.now(); }
  elapsed(since: number): number { return Date.now() - since; }
  label(): string { return "SystemClock"; }
}

// ── VirtualClock ─────────────────────────────────────────────────────────────
export class VirtualClock implements IClock {
  private _time: number;
  constructor(startMs = 0) { this._time = startMs; }
  now(): number { return this._time; }
  advance(ms: number): void { this._time += ms; }
  set(ms: number): void { this._time = ms; }
  elapsed(since: number): number { return this._time - since; }
  label(): string { return "VirtualClock"; }
}

// ── MockClock ─────────────────────────────────────────────────────────────────
export class MockClock implements IClock {
  private _values: number[] = [];
  private _idx = 0;
  private _fallback = 0;
  queue(...values: number[]): this { this._values.push(...values); return this; }
  now(): number {
    if (this._idx < this._values.length) return this._values[this._idx++];
    return this._fallback;
  }
  elapsed(since: number): number { return this.now() - since; }
  label(): string { return "MockClock"; }
}

// ── DeterministicClock ────────────────────────────────────────────────────────
export class DeterministicClock implements IClock {
  private _counter = 0;
  private _step: number;
  constructor(step = 1) { this._step = step; }
  now(): number { const v = this._counter; this._counter += this._step; return v; }
  elapsed(since: number): number { return this.now() - since; }
  reset(): void { this._counter = 0; }
  label(): string { return "DeterministicClock"; }
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createClock(mode: ClockMode = "SYSTEM"): IClock {
  switch (mode) {
    case "SYSTEM":        return new SystemClock();
    case "VIRTUAL":       return new VirtualClock();
    case "MOCK":          return new MockClock();
    case "DETERMINISTIC": return new DeterministicClock();
    default:              return new SystemClock();
  }
}