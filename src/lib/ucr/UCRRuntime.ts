/**
 * UCRRuntime.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * The single runtime all connector adapters execute through.
 * Adapters supply: buildRequest() + parseResponse()
 * Runtime supplies: auth header, pipeline, retry, circuit breaker, rate limiter, metrics, audit.
 */

import type { UCRConfig, UCRResponse, UCRMetrics } from "./UCRTypes";
import type { ConnectorAdapter }                    from "./UCRTypes";
import { DEFAULT_UCR_CONFIG }                       from "./UCRTypes";
import { UCRRegistry }                              from "./UCRRegistry";
import { executePipeline }                          from "./UCRPipeline";
import { UCRMetricsStore }                          from "./UCRMetricsStore";
import { UCRCircuitBreaker }                        from "./UCRCircuitBreaker";
import { UCRRateLimiter }                           from "./UCRRateLimiter";

// ── Lifecycle state per connector ─────────────────────────────────────────────

const _lifecycle = new Map<string, string>();

// ── UCRRuntime ────────────────────────────────────────────────────────────────

export const UCRRuntime = {

  /**
   * Execute an adapter operation through the full UCR pipeline.
   * @param connectorId  - registered adapter id
   * @param operation    - adapter-defined operation name
   * @param params       - goal parameters
   * @param token        - OAuth access token (injected by connector layer)
   * @param config       - optional Runtime config overrides
   */
  async execute<T = unknown>(
    connectorId: string,
    operation:   string,
    params:      Record<string, unknown>,
    token:       string,
    config:      Partial<UCRConfig> = {},
  ): Promise<UCRResponse<T>> {
    const adapter = UCRRegistry.get(connectorId);
    if (!adapter) {
      throw new Error(`UCRRuntime: no adapter registered for "${connectorId}"`);
    }

    const cfg = { ...DEFAULT_UCR_CONFIG, ...config };

    // Adapter builds the request (URL, headers, body) — Runtime owns execution
    const req = adapter.buildRequest(operation, params, token);

    // Execute through full pipeline
    const response = await executePipeline(connectorId, req, cfg) as UCRResponse<T>;

    return response;
  },

  /**
   * Execute and parse — convenience method that also runs adapter.parseResponse().
   */
  async executeAndParse<T = unknown>(
    connectorId: string,
    operation:   string,
    params:      Record<string, unknown>,
    token:       string,
    config:      Partial<UCRConfig> = {},
  ): Promise<{ ok: boolean; data: T | null; error: string | null; audit: UCRResponse["audit"] }> {
    const adapter  = UCRRegistry.get(connectorId);
    if (!adapter) throw new Error(`UCRRuntime: no adapter registered for "${connectorId}"`);

    const response = await UCRRuntime.execute<T>(connectorId, operation, params, token, config);
    if (!response.ok) {
      return { ok: false, data: null, error: response.rawText, audit: response.audit };
    }
    const parsed = adapter.parseResponse<T>(operation, response);
    return { ok: true, data: parsed, error: null, audit: response.audit };
  },

  /** Register an adapter (delegates to UCRRegistry). Plugin model entry point. */
  register(adapter: ConnectorAdapter): void {
    UCRRegistry.register(adapter);
    _lifecycle.set(adapter.id, "ready");
  },

  /** Get metrics for a specific connector. */
  metrics(connectorId: string): UCRMetrics {
    return UCRMetricsStore.snapshot(connectorId);
  },

  /** Get metrics for all connectors. */
  allMetrics(): UCRMetrics[] {
    return UCRMetricsStore.all();
  },

  /** List all registered connector IDs. */
  listConnectors(): string[] {
    return UCRRegistry.listIds();
  },

  /** Reset circuit breaker for a connector (e.g. after a fix). */
  resetCircuit(connectorId: string): void {
    UCRCircuitBreaker.reset(connectorId);
  },

  /** Lifecycle state of a connector. */
  lifecycle(connectorId: string): string {
    return _lifecycle.get(connectorId) ?? "unregistered";
  },

  /** Check if a connector is registered and ready. */
  isReady(connectorId: string): boolean {
    return UCRRegistry.has(connectorId) && _lifecycle.get(connectorId) === "ready";
  },
};