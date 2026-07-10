/**
 * MRI — MemoryOS Reference Implementation
 * HttpConnector — Connector de referência para APIs REST externas
 * Segue integralmente o Connector SDK (MDPS Capítulo 3)
 */

import type { IConnector, ExecutionContext, ConnectorResult, ValidationResult, HealthResult, ConnectorMetadata } from "../core/interfaces";

export interface HttpInput {
  url:      string;
  method:   "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?:    unknown;
}

export class HttpConnector implements IConnector {
  readonly connectorId  = "com.memoryos.http";
  readonly capabilityId = "http.request.execute";

  validate(input: unknown): ValidationResult {
    const i = input as HttpInput;
    if (!i?.url)    return { valid: false, error: "url is required" };
    if (!i?.method) return { valid: false, error: "method is required" };
    try { new URL(i.url); } catch {
      return { valid: false, error: "url is not a valid URL" };
    }
    return { valid: true };
  }

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    const i = input as HttpInput;
    const validation = this.validate(i);
    if (!validation.valid) throw new Error(validation.error);

    // Timeout via AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);

    const response = await fetch(i.url, {
      method:  i.method,
      headers: { "Content-Type": "application/json", ...(i.headers ?? {}) },
      body:    i.body ? JSON.stringify(i.body) : undefined,
      signal:  controller.signal,
    }).finally(() => clearTimeout(timer));

    const data = await response.json().catch(() => null);

    return {
      connectorId:  this.connectorId,
      capabilityId: this.capabilityId,
      status:       response.ok ? "success" : "failed",
      outputData:   { status: response.status, data },
      executionRef: { url: i.url, method: i.method },
      auditData: {
        action:    `http.${i.method.toLowerCase()}`,
        resource:  i.url,
        timestamp: new Date().toISOString(),
        userId:    ctx.userId,
      },
    };
  }

  // HTTP requests geralmente não têm rollback real
  async rollback(executionRef: unknown, ctx: ExecutionContext) {
    return {
      status:       "failed" as const,
      executionRef,
      error:        "HTTP requests cannot be rolled back automatically",
    };
  }

  async healthCheck(): Promise<HealthResult> {
    const start = Date.now();
    return {
      status:       "healthy",
      latencyMs:    Date.now() - start,
      version:      "1.0.0",
      timestamp:    new Date().toISOString(),
      dependencies: [{ name: "network", status: "ok" }],
    };
  }

  getMetadata(): ConnectorMetadata {
    return {
      connectorId:        this.connectorId,
      capabilityId:       this.capabilityId,
      supportsRollback:   false,
      estimatedLatencyMs: 500,
      version:            "1.0.0",
    };
  }
}