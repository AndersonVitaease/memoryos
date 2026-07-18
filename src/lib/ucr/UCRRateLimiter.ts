/**
 * UCRRateLimiter.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * Per-connector sliding-window rate limiter.
 */

interface RateLimiterState {
  timestamps: number[];
}

class RateLimiterInstance {
  private s: RateLimiterState = { timestamps: [] };

  tryConsume(maxRequests: number, windowMs: number): boolean {
    const now    = Date.now();
    const cutoff = now - windowMs;
    // Evict expired timestamps
    this.s.timestamps = this.s.timestamps.filter(t => t > cutoff);

    if (this.s.timestamps.length >= maxRequests) return false;
    this.s.timestamps.push(now);
    return true;
  }

  getCount(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.s.timestamps.filter(t => t > cutoff).length;
  }

  reset(): void { this.s.timestamps = []; }
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _instances = new Map<string, RateLimiterInstance>();

export const UCRRateLimiter = {
  get(connectorId: string): RateLimiterInstance {
    if (!_instances.has(connectorId)) {
      _instances.set(connectorId, new RateLimiterInstance());
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