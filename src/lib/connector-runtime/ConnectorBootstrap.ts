/**
 * ConnectorBootstrap.ts — Engineering Sprint 8.2
 *
 * SRP: descobrir, validar e registrar todos os Connectors oficiais.
 *      Nenhuma outra responsabilidade.
 *
 * Open/Closed: novos connectors sao adicionados a OFFICIAL_CONNECTORS.
 *   ConnectorRuntimeProvider, UCR, Runtime e Pipeline permanecem inalterados.
 *
 * O ConnectorRuntimeProvider nao conhece connectors individuais.
 * Toda responsabilidade de registro reside aqui.
 */

import type { IConnector } from "./IConnector";
import type { ConnectorRegistry } from "./ConnectorRegistry";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BootstrapResult {
  readonly connectorsLoaded: number;
  readonly capabilitiesLoaded: number;
  readonly bootstrapTimeMs: number;
  readonly errors: readonly string[];
  readonly connectorIds: readonly string[];
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateConnector(c: IConnector): string | null {
  if (!c.id || typeof c.id !== "string" || c.id.trim() === "") {
    return "connectorId is missing or empty";
  }
  if (typeof c.execute !== "function") {
    return `[${c.id}] execute() is not a function`;
  }
  if (typeof c.metadata !== "function") {
    return `[${c.id}] metadata() is not a function`;
  }
  if (typeof c.health !== "function") {
    return `[${c.id}] health() is not a function`;
  }
  if (typeof c.validate !== "function") {
    return `[${c.id}] validate() is not a function`;
  }
  try {
    const meta = c.metadata();
    if (!meta || !meta.capabilities || !Array.isArray(meta.capabilities)) {
      return `[${c.id}] metadata().capabilities must be a string[]`;
    }
    if (meta.capabilities.length === 0) {
      return `[${c.id}] metadata().capabilities is empty — connector has no capabilities`;
    }
  } catch (e) {
    return `[${c.id}] metadata() threw: ${(e as Error).message}`;
  }
  return null;
}

// ── Official connector factory ────────────────────────────────────────────────
// Each factory is lazy (async import) to avoid top-level module failures.

type ConnectorFactory = () => Promise<IConnector>;

const OFFICIAL_FACTORIES: ConnectorFactory[] = [
  async () => {
    const { GmailConnector } = await import("@/lib/connector-router/connectors/GmailConnector");
    // GmailConnector (UCR variant) uses UCRTypes.IConnector, not connector-runtime IConnector.
    // We adapt the surface here to satisfy the connector-runtime registry contract.
    const inner = new GmailConnector();
    return {
      id: "gmail",
      metadata: () => ({
        id: "gmail",
        name: inner.metadata().name,
        version: inner.metadata().version,
        description: inner.metadata().description,
        author: inner.metadata().author,
        capabilities: inner.capabilities().map((c) => c.id),
      }),
      validate: () => true,
      initialize: async () => {},
      shutdown: async () => {},
      health: async () => ({
        status: inner.health().status === "healthy" ? "healthy" as const
               : inner.health().status === "degraded" ? "degraded" as const
               : "unhealthy" as const,
        connectorId: "gmail",
        checkedAt: Date.now(),
        details: inner.health().message,
      }),
      execute: async (op: string, payload: Record<string, unknown>, ctx: { executionId: string }) => {
        const { makeExecutionId } = await import("./ConnectorTypes");
        const eid = ctx.executionId ?? makeExecutionId();
        const result = await inner.execute({
          executionId: eid,
          capability: op,
          parameters: payload,
        });
        return {
          status: result.status === "success" ? "SUCCESS" as const : "FAILED" as const,
          success: result.status === "success",
          data: result.output,
          error: result.error ?? undefined,
          duration: result.durationMs,
          connectorId: "gmail",
          executionId: eid,
          logs: [],
        };
      },
    } as IConnector;
  },

  async () => {
    const { GoogleDriveConnector } = await import("@/lib/connector-runtime/connectors/GoogleDriveConnector");
    return new GoogleDriveConnector();
  },

  async () => {
    const { GoogleCalendarConnector } = await import("@/lib/connector-runtime/connectors/GoogleCalendarConnector");
    return new GoogleCalendarConnector();
  },
];

// ── ConnectorBootstrap ────────────────────────────────────────────────────────

export const ConnectorBootstrap = Object.freeze({
  /**
   * Discovers, validates, and registers all official connectors.
   * Never aborts on a single connector failure.
   * Returns immutable BootstrapResult with full statistics.
   */
  async bootstrap(registry: ConnectorRegistry): Promise<BootstrapResult> {
    const t0 = Date.now();
    const errors: string[] = [];
    const loadedIds: string[] = [];
    let capabilitiesLoaded = 0;

    for (const factory of OFFICIAL_FACTORIES) {
      let connector: IConnector | null = null;
      try {
        connector = await factory();
      } catch (e) {
        errors.push(`Factory failed to instantiate connector: ${(e as Error).message}`);
        continue;
      }

      // Validate
      const validationError = validateConnector(connector);
      if (validationError) {
        errors.push(`Validation failed — ${validationError}`);
        continue;
      }

      // Prevent duplicates
      if (registry.has(connector.id)) {
        errors.push(`[${connector.id}] already registered — skipped`);
        continue;
      }

      // Register
      try {
        registry.register(connector);
        const caps = connector.metadata().capabilities.length;
        capabilitiesLoaded += caps;
        loadedIds.push(connector.id);
      } catch (e) {
        errors.push(`[${connector.id}] registry.register() threw: ${(e as Error).message}`);
      }
    }

    return Object.freeze({
      connectorsLoaded:   loadedIds.length,
      capabilitiesLoaded,
      bootstrapTimeMs:    Date.now() - t0,
      errors:             Object.freeze(errors),
      connectorIds:       Object.freeze(loadedIds),
    });
  },
});