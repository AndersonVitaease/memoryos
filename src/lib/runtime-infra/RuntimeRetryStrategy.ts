// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeRetryStrategy
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export interface RetryStrategy {
  shouldRetry(attempt: number, error?: string): boolean;
  delayMs(attempt: number): number;
  maxAttempts(): number;
  label(): string;
}

// ── NoRetry ───────────────────────────────────────────────────────────────────
export class NoRetry implements RetryStrategy {
  shouldRetry(): boolean { return false; }
  delayMs(): number { return 0; }
  maxAttempts(): number { return 1; }
  label(): string { return "NoRetry"; }
}

// ── FixedRetry ────────────────────────────────────────────────────────────────
export class FixedRetry implements RetryStrategy {
  constructor(private readonly _max: number, private readonly _delay: number) {}
  shouldRetry(attempt: number): boolean { return attempt < this._max; }
  delayMs(): number { return this._delay; }
  maxAttempts(): number { return this._max + 1; }
  label(): string { return `FixedRetry(max=${this._max},delay=${this._delay}ms)`; }
}

// ── LinearRetry ───────────────────────────────────────────────────────────────
export class LinearRetry implements RetryStrategy {
  constructor(private readonly _max: number, private readonly _baseDelay: number) {}
  shouldRetry(attempt: number): boolean { return attempt < this._max; }
  delayMs(attempt: number): number { return this._baseDelay * (attempt + 1); }
  maxAttempts(): number { return this._max + 1; }
  label(): string { return `LinearRetry(max=${this._max},base=${this._baseDelay}ms)`; }
}

// ── ExponentialRetry ──────────────────────────────────────────────────────────
export class ExponentialRetry implements RetryStrategy {
  constructor(
    private readonly _max: number,
    private readonly _baseDelay: number,
    private readonly _maxDelay = 30000
  ) {}
  shouldRetry(attempt: number): boolean { return attempt < this._max; }
  delayMs(attempt: number): number {
    return Math.min(this._baseDelay * Math.pow(2, attempt), this._maxDelay);
  }
  maxAttempts(): number { return this._max + 1; }
  label(): string { return `ExponentialRetry(max=${this._max},base=${this._baseDelay}ms)`; }
}

// ── FibonacciRetry ────────────────────────────────────────────────────────────
function fib(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) { const c = a + b; a = b; b = c; }
  return b;
}
export class FibonacciRetry implements RetryStrategy {
  constructor(private readonly _max: number, private readonly _unit: number = 100) {}
  shouldRetry(attempt: number): boolean { return attempt < this._max; }
  delayMs(attempt: number): number { return fib(attempt + 1) * this._unit; }
  maxAttempts(): number { return this._max + 1; }
  label(): string { return `FibonacciRetry(max=${this._max},unit=${this._unit}ms)`; }
}

// ── AdaptiveRetry ─────────────────────────────────────────────────────────────
export class AdaptiveRetry implements RetryStrategy {
  private _successRate = 1.0;
  constructor(private readonly _max: number, private readonly _baseDelay: number) {}
  recordSuccess(): void { this._successRate = Math.min(1, this._successRate + 0.1); }
  recordFailure(): void { this._successRate = Math.max(0, this._successRate - 0.1); }
  shouldRetry(attempt: number): boolean { return attempt < this._max; }
  delayMs(attempt: number): number {
    const factor = 1 + (1 - this._successRate) * 2;
    return Math.round(this._baseDelay * factor * (attempt + 1));
  }
  maxAttempts(): number { return this._max + 1; }
  label(): string { return `AdaptiveRetry(max=${this._max},successRate=${this._successRate.toFixed(2)})`; }
}