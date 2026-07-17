// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeExecutionIdProvider
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export interface IExecutionIdProvider {
  next(prefix?: string): string;
  label(): string;
}

// ── UUIDProvider ─────────────────────────────────────────────────────────────
export class UUIDProvider implements IExecutionIdProvider {
  next(prefix = "exec"): string {
    const r = (): string => Math.random().toString(36).substring(2, 10);
    return `${prefix}-${r()}${r()}`;
  }
  label(): string { return "UUIDProvider"; }
}

// ── SequentialProvider ────────────────────────────────────────────────────────
export class SequentialProvider implements IExecutionIdProvider {
  private _seq = 0;
  next(prefix = "exec"): string {
    return `${prefix}-${String(++this._seq).padStart(6, "0")}`;
  }
  reset(): void { this._seq = 0; }
  label(): string { return "SequentialProvider"; }
}

// ── DeterministicProvider ─────────────────────────────────────────────────────
export class DeterministicProvider implements IExecutionIdProvider {
  private _seq = 0;
  private readonly _seed: string;
  constructor(seed = "det") { this._seed = seed; }
  next(prefix = "exec"): string {
    return `${prefix}-${this._seed}-${String(++this._seq).padStart(6, "0")}`;
  }
  reset(): void { this._seq = 0; }
  label(): string { return "DeterministicProvider"; }
}

// ── TestProvider ──────────────────────────────────────────────────────────────
export class TestProvider implements IExecutionIdProvider {
  private _values: string[] = [];
  private _idx = 0;
  queue(...ids: string[]): this { this._values.push(...ids); return this; }
  next(prefix = "exec"): string {
    if (this._idx < this._values.length) return this._values[this._idx++];
    return `${prefix}-test-${this._idx++}`;
  }
  label(): string { return "TestProvider"; }
}

// ── Factory ───────────────────────────────────────────────────────────────────
export type IdProviderMode = "UUID" | "SEQUENTIAL" | "DETERMINISTIC" | "TEST";
export function createIdProvider(mode: IdProviderMode = "SEQUENTIAL"): IExecutionIdProvider {
  switch (mode) {
    case "UUID":          return new UUIDProvider();
    case "SEQUENTIAL":    return new SequentialProvider();
    case "DETERMINISTIC": return new DeterministicProvider();
    case "TEST":          return new TestProvider();
    default:              return new SequentialProvider();
  }
}