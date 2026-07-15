/**
 * ExecutionPolicy.ts — Engineering Sprint E-02.3A
 * Declares the execution policy contract for the Runtime Engine.
 *
 * SRP: apenas contrato de política de execução.
 * Nesta sprint: apenas timeout é implementado.
 * Os demais campos são estrutura preparada para sprints futuras.
 *
 * Nenhum connector, nenhum runtime, nenhuma rede.
 */

// ── ExecutionPolicy ───────────────────────────────────────────────────────────

export interface ExecutionPolicy {
  /** Max total execution time in ms. Default: 30_000. */
  readonly timeoutMs: number;

  /** Max per-step time in ms. Default: 10_000. */
  readonly stepTimeoutMs: number;

  /** Retry configuration (algorithm: Sprint E-02.4+). */
  readonly retry: RetryConfig;

  /** Confirmation requirement (implementation: Sprint E-02.5+). */
  readonly confirmation: ConfirmationConfig;

  /** Parallelism configuration (implementation: Sprint E-02.6+). */
  readonly parallelism: ParallelismConfig;

  /** Priority level for queuing (implementation: Sprint E-02.6+). */
  readonly priority: ExecutionPriority;

  /** Circuit breaker config (implementation: Sprint E-02.7+). */
  readonly circuitBreaker: CircuitBreakerConfig;

  /** Rate limit config (implementation: Sprint E-02.7+). */
  readonly rateLimit: RateLimitConfig;
}

// ── Sub-configs (structures only) ─────────────────────────────────────────────

export interface RetryConfig {
  readonly enabled:     boolean;
  readonly maxAttempts: number;
}

export interface ConfirmationConfig {
  readonly required: boolean;
}

export interface ParallelismConfig {
  readonly enabled:      boolean;
  readonly maxConcurrent: number;
}

export type ExecutionPriority = "low" | "normal" | "high" | "critical";

export interface CircuitBreakerConfig {
  readonly enabled:         boolean;
  readonly failureThreshold: number;
}

export interface RateLimitConfig {
  readonly enabled:       boolean;
  readonly requestsPerMs: number;
}

// ── Default policy (conversation runtime) ────────────────────────────────────

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = Object.freeze({
  timeoutMs:     30_000,
  stepTimeoutMs: 10_000,
  retry:         Object.freeze({ enabled: false, maxAttempts: 1 }),
  confirmation:  Object.freeze({ required: false }),
  parallelism:   Object.freeze({ enabled: false, maxConcurrent: 1 }),
  priority:      "normal",
  circuitBreaker: Object.freeze({ enabled: false, failureThreshold: 5 }),
  rateLimit:     Object.freeze({ enabled: false, requestsPerMs: 0 }),
});

// ── Policy builder (fluent, for testing and future use) ───────────────────────

export function buildPolicy(overrides: Partial<ExecutionPolicy>): ExecutionPolicy {
  return Object.freeze({ ...DEFAULT_EXECUTION_POLICY, ...overrides });
}