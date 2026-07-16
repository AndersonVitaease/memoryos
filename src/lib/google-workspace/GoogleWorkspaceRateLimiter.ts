/**
 * GoogleWorkspaceRateLimiter.ts — Engineering Sprint 7.0
 * Per-service quota tracking with sliding window counters.
 * Provides backoff recommendations before quota is exceeded.
 */

import type { GWSServiceId, GWSQuota } from "./GoogleWorkspaceTypes";

// ── Default quotas (Google API defaults, conservative) ────────────────────────

const DEFAULT_QUOTAS: Record<GWSServiceId, { rpm: number; rpd: number }> = {
  gmail:    { rpm: 250, rpd: 1_000_000 },
  drive:    { rpm: 300, rpd: 1_000_000 },
  calendar: { rpm: 600, rpd: 1_000_000 },
  contacts: { rpm: 300, rpd: 1_000_000 },
  docs:     { rpm: 300, rpd: 1_000_000 },
  sheets:   { rpm: 300, rpd: 1_000_000 },
  tasks:    { rpm: 50,  rpd:    50_000 },
  keep:     { rpm: 60,  rpd:   100_000 },
};

const ONE_MIN_MS  = 60_000;
const ONE_DAY_MS  = 86_400_000;

// ── Rate Limiter ──────────────────────────────────────────────────────────────

class RateLimiterClass {
  private readonly _quotas = new Map<GWSServiceId, GWSQuota>();

  private _get(serviceId: GWSServiceId): GWSQuota {
    if (!this._quotas.has(serviceId)) {
      const cfg = DEFAULT_QUOTAS[serviceId];
      this._quotas.set(serviceId, {
        serviceId,
        requestsPerMin:  cfg.rpm,
        requestsPerDay:  cfg.rpd,
        currentMinCount: 0,
        currentDayCount: 0,
        lastResetMin:    Date.now(),
        lastResetDay:    Date.now(),
      });
    }
    return this._quotas.get(serviceId)!;
  }

  private _reset(q: GWSQuota): GWSQuota {
    const now = Date.now();
    if (now - q.lastResetMin > ONE_MIN_MS) {
      q.currentMinCount = 0;
      q.lastResetMin    = now;
    }
    if (now - q.lastResetDay > ONE_DAY_MS) {
      q.currentDayCount = 0;
      q.lastResetDay    = now;
    }
    return q;
  }

  /**
   * Check if a request is allowed. Returns { allowed, waitMs }.
   */
  check(serviceId: GWSServiceId): { allowed: boolean; waitMs: number } {
    const q = this._reset(this._get(serviceId));

    if (q.currentMinCount >= q.requestsPerMin) {
      const waitMs = ONE_MIN_MS - (Date.now() - q.lastResetMin);
      return { allowed: false, waitMs: Math.max(waitMs, 100) };
    }
    if (q.currentDayCount >= q.requestsPerDay) {
      const waitMs = ONE_DAY_MS - (Date.now() - q.lastResetDay);
      return { allowed: false, waitMs };
    }

    return { allowed: true, waitMs: 0 };
  }

  /**
   * Record a consumed request (call after a successful API call).
   */
  consume(serviceId: GWSServiceId): void {
    const q = this._reset(this._get(serviceId));
    q.currentMinCount++;
    q.currentDayCount++;
  }

  /**
   * Get current quota status for a service.
   */
  status(serviceId: GWSServiceId): GWSQuota {
    return { ...this._reset(this._get(serviceId)) };
  }

  /**
   * Get quota status for all services.
   */
  allStatus(): GWSQuota[] {
    const ids: GWSServiceId[] = ["gmail","drive","calendar","contacts","docs","sheets","tasks","keep"];
    return ids.map((id) => this.status(id));
  }

  /**
   * Reset counters for a service (e.g. after a 429 response resets the window).
   */
  reset(serviceId: GWSServiceId): void {
    const q = this._get(serviceId);
    q.currentMinCount = 0;
    q.lastResetMin    = Date.now();
  }
}

const _KEY = "__GWS_RATE_LIMITER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RateLimiterClass();
}
export const GoogleWorkspaceRateLimiter: RateLimiterClass = (
  globalThis as unknown as Record<string, RateLimiterClass>
)[_KEY];