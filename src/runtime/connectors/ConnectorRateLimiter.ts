/**
 * ConnectorRateLimiter.ts
 * Enforces rate limits declared in connector manifests.
 * Supports fixed_window, sliding_window, token_bucket strategies.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { RateLimitSpec } from './interfaces/IConnectorManifest';

interface BucketState {
  readonly specId: string;
  readonly connectorId: string;
  readonly spec: RateLimitSpec;
  count: number;
  windowStart: number;
  tokens: number;
  lastRefill: number;
}

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
  readonly retryAfterMs?: number;
  readonly limitId: string;
  readonly strategy: string;
}

function bucketKey(connectorId: string, specId: string, scopeKey: string): string {
  return `${connectorId}::${specId}::${scopeKey}`;
}

export class ConnectorRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private checkCount = 0;
  private blockedCount = 0;

  private getOrCreateBucket(connectorId: string, spec: RateLimitSpec, scopeKey: string): BucketState {
    const key = bucketKey(connectorId, spec.id, scopeKey);
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        specId: spec.id,
        connectorId,
        spec,
        count: 0,
        windowStart: Date.now(),
        tokens: spec.limit,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(key)!;
  }

  private getScopeKey(spec: RateLimitSpec, userId?: string, actionId?: string): string {
    if (spec.scope === 'per_user') return userId ?? 'anonymous';
    if (spec.scope === 'per_action') return actionId ?? 'unknown';
    return 'global';
  }

  check(
    connectorId: string,
    spec: RateLimitSpec,
    userId?: string,
    actionId?: string,
  ): RateLimitCheckResult {
    this.checkCount++;
    const scopeKey = this.getScopeKey(spec, userId, actionId);
    const bucket = this.getOrCreateBucket(connectorId, spec, scopeKey);
    const now = Date.now();
    const windowMs = spec.windowSeconds * 1000;

    let allowed = false;
    let remaining = 0;

    if (spec.strategy === 'fixed_window') {
      if (now - bucket.windowStart >= windowMs) {
        bucket.count = 0;
        bucket.windowStart = now;
      }
      if (bucket.count < spec.limit) {
        allowed = true;
        bucket.count++;
      }
      remaining = Math.max(0, spec.limit - bucket.count);

    } else if (spec.strategy === 'sliding_window') {
      const elapsed = now - bucket.windowStart;
      const decayed = Math.floor((elapsed / windowMs) * spec.limit);
      bucket.count = Math.max(0, bucket.count - decayed);
      if (elapsed > windowMs) bucket.windowStart = now;
      if (bucket.count < spec.limit) {
        allowed = true;
        bucket.count++;
      }
      remaining = Math.max(0, spec.limit - bucket.count);

    } else if (spec.strategy === 'token_bucket') {
      const elapsed = now - bucket.lastRefill;
      const refill = Math.floor((elapsed / windowMs) * spec.limit);
      bucket.tokens = Math.min(spec.limit, bucket.tokens + refill);
      bucket.lastRefill = now;
      if (bucket.tokens >= 1) {
        allowed = true;
        bucket.tokens--;
      }
      remaining = bucket.tokens;
    }

    if (!allowed) {
      this.blockedCount++;
    }

    const resetAt = new Date(bucket.windowStart + windowMs).toISOString();
    const retryAfterMs = !allowed && spec.onExceeded === 'retry_after'
      ? (spec.retryAfterSeconds ?? 60) * 1000
      : undefined;

    return { allowed, remaining, resetAt, retryAfterMs, limitId: spec.id, strategy: spec.strategy };
  }

  reset(connectorId: string, specId: string, userId?: string): void {
    const prefix = `${connectorId}::${specId}::`;
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        if (!userId || key === `${prefix}${userId}`) {
          this.buckets.delete(key);
        }
      }
    }
  }

  statistics() {
    return {
      activeBuckets: this.buckets.size,
      checkCount: this.checkCount,
      blockedCount: this.blockedCount,
      blockRate: this.checkCount > 0 ? this.blockedCount / this.checkCount : 0,
    };
  }

  health() {
    return {
      status: 'HEALTHY' as const,
      details: `${this.buckets.size} active rate limit buckets`,
      checks: { bucketsIntact: true },
      checkedAt: new Date().toISOString(),
    };
  }
}