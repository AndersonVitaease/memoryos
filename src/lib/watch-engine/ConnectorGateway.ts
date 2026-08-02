/**
 * ConnectorGateway.ts — Gateway de providers com Token Bucket + Circuit Breaker
 *
 * Sprint WE-02 | RFC-005 | ADR-012 | EPIC-017 FEAT-112
 *
 * Responsabilidade única: executar chamadas a providers externos com:
 * - Token Bucket por provider (rate limiting)
 * - Circuit Breaker por provider (falha isolada: 3 falhas → open)
 * - Timeout por chamada (5s default)
 * - Zero acoplamento com o Core existente
 *
 * ADR-012 §4: falha de um provider NUNCA trava outro.
 * ADR-012 §5: Circuit Breaker — open após 3 falhas, half-open após 30s.
 */

import type { DryRunResult, ProviderCheck } from "./WatchTypes";

// ── Token Bucket ──────────────────────────────────────────────────────────────

interface TokenBucket {
  tokens:     number;
  maxTokens:  number;
  refillRate: number; // tokens por segundo
  lastRefill: number; // timestamp ms
}

function refillBucket(bucket: TokenBucket): void {
  const now     = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000; // segundos
  const added   = elapsed * bucket.refillRate;
  bucket.tokens     = Math.min(bucket.maxTokens, bucket.tokens + added);
  bucket.lastRefill = now;
}

function consumeToken(bucket: TokenBucket): boolean {
  refillBucket(bucket);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// ── Circuit Breaker ───────────────────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreaker {
  state:            CircuitState;
  failures:         number;
  lastFailureAt:    number;
  halfOpenAt:       number;
  successCount:     number; // sucessos no estado half-open
}

const CIRCUIT_OPEN_THRESHOLD   = 3;    // falhas para abrir
const CIRCUIT_HALF_OPEN_DELAY  = 30_000; // ms para tentar half-open
const CIRCUIT_HALF_OPEN_PROBES = 2;    // sucessos para fechar

function isCircuitAllowing(cb: CircuitBreaker): boolean {
  const now = Date.now();
  if (cb.state === "closed")    return true;
  if (cb.state === "open") {
    if (now - cb.lastFailureAt >= CIRCUIT_HALF_OPEN_DELAY) {
      cb.state        = "half-open";
      cb.successCount = 0;
      return true;  // deixa um probe passar
    }
    return false;
  }
  // half-open: permite probes
  return true;
}

function recordSuccess(cb: CircuitBreaker): void {
  if (cb.state === "half-open") {
    cb.successCount++;
    if (cb.successCount >= CIRCUIT_HALF_OPEN_PROBES) {
      cb.state    = "closed";
      cb.failures = 0;
    }
  } else {
    cb.failures = 0;
  }
}

function recordFailure(cb: CircuitBreaker): void {
  cb.failures++;
  cb.lastFailureAt = Date.now();
  if (cb.failures >= CIRCUIT_OPEN_THRESHOLD) {
    cb.state = "open";
    console.warn(`[ConnectorGateway] Circuit aberto para provider após ${cb.failures} falhas`);
  }
}

// ── Provider Handler — interface de execução ─────────────────────────────────

export type ProviderHandler = (
  action: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

// ── ConnectorGateway ──────────────────────────────────────────────────────────

const CALL_TIMEOUT_MS    = 5_000;
const DEFAULT_MAX_TOKENS = 20;
const DEFAULT_REFILL_RPS = 2; // 2 tokens/s por provider

class ConnectorGatewayClass {
  private _buckets   = new Map<string, TokenBucket>();
  private _breakers  = new Map<string, CircuitBreaker>();
  private _handlers  = new Map<string, ProviderHandler>();
  private _callCount = 0;
  private _errorCount = 0;

  // ── Registro de providers ─────────────────────────────────────────────────

  registerProvider(id: string, handler: ProviderHandler): void {
    this._handlers.set(id, handler);
    if (!this._buckets.has(id)) {
      this._buckets.set(id, {
        tokens:     DEFAULT_MAX_TOKENS,
        maxTokens:  DEFAULT_MAX_TOKENS,
        refillRate: DEFAULT_REFILL_RPS,
        lastRefill: Date.now(),
      });
    }
    if (!this._breakers.has(id)) {
      this._breakers.set(id, {
        state:         "closed",
        failures:      0,
        lastFailureAt: 0,
        halfOpenAt:    0,
        successCount:  0,
      });
    }
  }

  // ── execute ───────────────────────────────────────────────────────────────

  async execute(
    provider: string,
    action:   string,
    params:   Record<string, unknown>,
  ): Promise<unknown> {
    this._callCount++;

    const breaker = this._getBreaker(provider);
    const bucket  = this._getBucket(provider);
    const handler = this._handlers.get(provider);

    // Circuit Breaker check
    if (!isCircuitAllowing(breaker)) {
      throw new Error(`[ConnectorGateway] Circuit aberto para '${provider}' — aguardando recuperação`);
    }

    // Token Bucket check
    if (!consumeToken(bucket)) {
      throw new Error(`[ConnectorGateway] Rate limit atingido para '${provider}' — sem tokens disponíveis`);
    }

    // Handler não registrado → stub de simulação
    const executeFn: () => Promise<unknown> = handler
      ? () => handler(action, params)
      : () => this._simulateProvider(provider, action, params);

    // Timeout wrapper
    try {
      const result = await Promise.race([
        executeFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout (${CALL_TIMEOUT_MS}ms) para ${provider}.${action}`)), CALL_TIMEOUT_MS),
        ),
      ]);
      recordSuccess(breaker);
      return result;
    } catch (err) {
      this._errorCount++;
      recordFailure(breaker);
      throw err;
    }
  }

  // ── dryRunProviders ───────────────────────────────────────────────────────

  async dryRunProviders(providerIds: string[]): Promise<DryRunResult> {
    const checks = await Promise.all(
      providerIds.map(async (id): Promise<ProviderCheck> => {
        const breaker = this._getBreaker(id);
        if (breaker.state === "open") {
          return Object.freeze({ provider: id, available: false, reason: "Circuit aberto" });
        }
        const bucket = this._getBucket(id);
        refillBucket(bucket);
        if (bucket.tokens < 1) {
          return Object.freeze({ provider: id, available: false, reason: "Rate limit ativo" });
        }
        return Object.freeze({ provider: id, available: true });
      }),
    );

    return Object.freeze({
      passed:         checks.every((c) => c.available),
      providerChecks: Object.freeze(checks),
    });
  }

  // ── Estado e métricas ─────────────────────────────────────────────────────

  getProviderStatus(providerId: string): {
    registered: boolean;
    circuitState: CircuitState;
    tokensAvailable: number;
    failures: number;
  } {
    const breaker = this._breakers.get(providerId);
    const bucket  = this._buckets.get(providerId);
    if (bucket) refillBucket(bucket);
    return {
      registered:      this._handlers.has(providerId),
      circuitState:    breaker?.state ?? "closed",
      tokensAvailable: Math.floor(bucket?.tokens ?? DEFAULT_MAX_TOKENS),
      failures:        breaker?.failures ?? 0,
    };
  }

  getMetrics() {
    return Object.freeze({
      totalCalls:      this._callCount,
      totalErrors:     this._errorCount,
      registeredCount: this._handlers.size,
    });
  }

  listProviders(): string[] {
    return [...this._handlers.keys()];
  }

  // ── Stub de simulacao para providers nao conectados ──────────────────────
  // Usado apenas quando nenhum handler real foi registrado para o provider.
  // No scheduler backend os providers reais sao avaliados diretamente via API.

  private async _simulateProvider(
    provider: string,
    action:   string,
    _params:  Record<string, unknown>,
  ): Promise<unknown> {
    const stubs: Record<string, Record<string, unknown>> = {
      gmail:    { count_unread: { count: 0 }, list_emails: { items: [], count: 0 } },
      drive:    { list_recent: { count: 0, files: [] }, get_file: null },
      calendar: { get_event_count: { count: 0 }, list_events: { items: [] } },
      web:      { fetch: { status: 200, body: "" }, check_price: { price: 0 } },
    };
    return stubs[provider]?.[action] ?? { value: null };
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  private _getBreaker(id: string): CircuitBreaker {
    if (!this._breakers.has(id)) {
      this._breakers.set(id, {
        state: "closed", failures: 0,
        lastFailureAt: 0, halfOpenAt: 0, successCount: 0,
      });
    }
    return this._breakers.get(id)!;
  }

  private _getBucket(id: string): TokenBucket {
    if (!this._buckets.has(id)) {
      this._buckets.set(id, {
        tokens: DEFAULT_MAX_TOKENS, maxTokens: DEFAULT_MAX_TOKENS,
        refillRate: DEFAULT_REFILL_RPS, lastRefill: Date.now(),
      });
    }
    return this._buckets.get(id)!;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__CONNECTOR_GATEWAY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConnectorGatewayClass();
}

export const connectorGateway: ConnectorGatewayClass = (
  globalThis as unknown as Record<string, ConnectorGatewayClass>
)[_KEY];

export { ConnectorGatewayClass };