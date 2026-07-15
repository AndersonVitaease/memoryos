/**
 * RetryStrategy.ts — Engineering Sprint E-02.3A
 * Official retry strategy contract for the Runtime Engine.
 *
 * SRP: apenas contratos de estratégia de retry.
 * Nenhum algoritmo implementado nesta sprint.
 * O Runtime receberá uma IRetryStrategy no futuro (Sprint E-02.4+).
 *
 * Dependency Inversion: o Runtime dependerá apenas de IRetryStrategy —
 * não de implementações concretas.
 */

import type { RetryContext, RetryDecision } from "./RuntimeTypes";

// ── IRetryStrategy ────────────────────────────────────────────────────────────

export interface IRetryStrategy {
  /**
   * Given a retry context, decides whether and when to retry.
   * Must be pure — no side effects, no network.
   */
  decide(ctx: RetryContext): RetryDecision;
}

// ── NoRetry (default — Sprint E-02.3) ────────────────────────────────────────

export class NoRetryStrategy implements IRetryStrategy {
  decide(_ctx: RetryContext): RetryDecision {
    return Object.freeze({ shouldRetry: false, delayMs: 0, reason: "Retry disabled" });
  }
}

// ── ImmediateRetry (structure — Sprint E-02.4+) ───────────────────────────────

export class ImmediateRetryStrategy implements IRetryStrategy {
  constructor(private readonly maxAttempts: number = 3) {}

  decide(ctx: RetryContext): RetryDecision {
    if (ctx.attempt >= this.maxAttempts) {
      return Object.freeze({ shouldRetry: false, delayMs: 0, reason: `Max attempts (${this.maxAttempts}) reached` });
    }
    return Object.freeze({ shouldRetry: true, delayMs: 0, reason: "Immediate retry" });
  }
}

// ── ExponentialBackoff (structure — Sprint E-02.4+) ───────────────────────────

export class ExponentialBackoffStrategy implements IRetryStrategy {
  constructor(
    private readonly maxAttempts: number = 3,
    private readonly baseDelayMs: number = 500,
  ) {}

  decide(ctx: RetryContext): RetryDecision {
    if (ctx.attempt >= this.maxAttempts) {
      return Object.freeze({ shouldRetry: false, delayMs: 0, reason: `Max attempts (${this.maxAttempts}) reached` });
    }
    const delayMs = this.baseDelayMs * Math.pow(2, ctx.attempt - 1);
    return Object.freeze({ shouldRetry: true, delayMs, reason: `Exponential backoff: ${delayMs}ms` });
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export const noRetry = new NoRetryStrategy();