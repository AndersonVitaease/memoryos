/**
 * UCRCircuitBreaker.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * Per-connector circuit breaker.
 * States: closed → open (after N failures) → half-open (after reset timeout) → closed
 */

interface CircuitState {
  state:          "closed" | "open" | "half-open";
  failureCount:   number;
  lastFailureAt:  number | null;
  openedAt:       number | null;
}

const DEFAULT_THRESHOLD  = 5;
const DEFAULT_RESET_MS   = 30000;

class CircuitBreakerInstance {
  private s: CircuitState = { state: "closed", failureCount: 0, lastFailureAt: null, openedAt: null };

  constructor(
    private readonly threshold: number = DEFAULT_THRESHOLD,
    private readonly resetMs:   number = DEFAULT_RESET_MS,
  ) {}

  isOpen(): boolean {
    if (this.s.state === "open") {
      // Check if reset timeout has elapsed → half-open
      if (this.s.openedAt && Date.now() - this.s.openedAt >= this.resetMs) {
        this.s.state = "half-open";
        return false;
      }
      return true;
    }
    return false;
  }

  record(success: boolean): void {
    if (success) {
      // Reset on success
      this.s = { state: "closed", failureCount: 0, lastFailureAt: null, openedAt: null };
    } else {
      this.s.failureCount++;
      this.s.lastFailureAt = Date.now();
      if (this.s.failureCount >= this.threshold) {
        this.s.state    = "open";
        this.s.openedAt = Date.now();
      }
    }
  }

  getState(): "closed" | "open" | "half-open" { return this.s.state; }
  getFailureCount(): number { return this.s.failureCount; }
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _instances = new Map<string, CircuitBreakerInstance>();

export const UCRCircuitBreaker = {
  get(connectorId: string, threshold = DEFAULT_THRESHOLD, resetMs = DEFAULT_RESET_MS): CircuitBreakerInstance {
    if (!_instances.has(connectorId)) {
      _instances.set(connectorId, new CircuitBreakerInstance(threshold, resetMs));
    }
    return _instances.get(connectorId)!;
  },
  reset(connectorId: string): void {
    _instances.delete(connectorId);
  },
  resetAll(): void {
    _instances.clear();
  },
};