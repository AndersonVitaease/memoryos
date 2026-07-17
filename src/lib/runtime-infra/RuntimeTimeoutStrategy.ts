// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeTimeoutStrategy
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export interface TimeoutStrategy {
  timeoutMs(): number;
  hasTimeout(): boolean;
  label(): string;
}

// ── FixedTimeout ──────────────────────────────────────────────────────────────
export class FixedTimeout implements TimeoutStrategy {
  constructor(private readonly _ms: number) {}
  timeoutMs(): number { return this._ms; }
  hasTimeout(): boolean { return true; }
  label(): string { return `FixedTimeout(${this._ms}ms)`; }
}

// ── AdaptiveTimeout ───────────────────────────────────────────────────────────
export class AdaptiveTimeout implements TimeoutStrategy {
  private _samples: number[] = [];
  private _base: number;
  private _multiplier: number;
  constructor(base: number, multiplier = 2) { this._base = base; this._multiplier = multiplier; }
  record(ms: number): void { this._samples.push(ms); if (this._samples.length > 20) this._samples.shift(); }
  timeoutMs(): number {
    if (this._samples.length === 0) return this._base * this._multiplier;
    const avg = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
    return Math.round(avg * this._multiplier);
  }
  hasTimeout(): boolean { return true; }
  label(): string { return `AdaptiveTimeout(base=${this._base}ms,x${this._multiplier})`; }
}

// ── InfiniteTimeout ───────────────────────────────────────────────────────────
export class InfiniteTimeout implements TimeoutStrategy {
  timeoutMs(): number { return 0; }
  hasTimeout(): boolean { return false; }
  label(): string { return "InfiniteTimeout"; }
}

// ── ConnectorTimeout ──────────────────────────────────────────────────────────
const CONNECTOR_DEFAULTS: Record<string, number> = {
  gmail: 10000, drive: 15000, calendar: 8000, github: 12000, default: 10000,
};
export class ConnectorTimeout implements TimeoutStrategy {
  private readonly _ms: number;
  constructor(connectorType: string) {
    this._ms = CONNECTOR_DEFAULTS[connectorType.toLowerCase()] ?? CONNECTOR_DEFAULTS.default;
  }
  timeoutMs(): number { return this._ms; }
  hasTimeout(): boolean { return true; }
  label(): string { return `ConnectorTimeout(${this._ms}ms)`; }
}