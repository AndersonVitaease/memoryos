/**
 * ConnectorBootstrap.ts — Engineering Sprint 8.3
 *
 * SRP: discover, validate and register all official connectors.
 *      No other responsibility.
 *
 * Open/Closed: add new connectors to OFFICIAL_FACTORIES only.
 *   No other file changes required.
 *
 * Sprint 8.3 change: Gmail now uses the native connector-runtime GmailConnector
 *   (implements connector-runtime/IConnector directly, no adapter).
 *   All three connectors are first-class citizens of the same interface.
 */

import type { IConnector } from "./IConnector";
import type { ConnectorRegistry } from "./ConnectorRegistry";
import { runtimeEventBus } from "@/runtime/connectors/RuntimeEventBus";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BootstrapResult {
  readonly connectorsLoaded:   number;
  readonly capabilitiesLoaded: number;
  readonly bootstrapTimeMs:    number;
  readonly errors:             readonly string[];
  readonly connectorIds:       readonly string[];
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
    if (!meta?.capabilities || !Array.isArray(meta.capabilities)) {
      return `[${c.id}] metadata().capabilities must be a string[]`;
    }
    if (meta.capabilities.length === 0) {
      return `[${c.id}] metadata().capabilities is empty`;
    }
  } catch (e) {
    return `[${c.id}] metadata() threw: ${(e as Error).message}`;
  }
  return null;
}

// ── Official connector factories ───────────────────────────────────────────────
// All three use the same connector-runtime/IConnector interface. No adapters.

type ConnectorFactory = () => Promise<IConnector>;

const OFFICIAL_FACTORIES: ConnectorFactory[] = [
  async () => {
    // Sprint 8.3: native connector-runtime GmailConnector — no adapter
    const { GmailConnector } = await import("./connectors/GmailConnector");
    return new GmailConnector();
  },
  async () => {
    const { GoogleDriveConnector } = await import("./connectors/GoogleDriveConnector");
    return new GoogleDriveConnector();
  },
  async () => {
    const { GoogleCalendarConnector } = await import("./connectors/GoogleCalendarConnector");
    return new GoogleCalendarConnector();
  },
  async () => {
    // Sprint EF-39.9C: register GitHubConnector in the official bootstrap
    const { GitHubConnector } = await import("./connectors/GitHubConnector");
    return new GitHubConnector();
  },
  async () => {
    const { OpenRouterConnector } = await import("./connectors/OpenRouterConnector");
    return new OpenRouterConnector();
  },
  async () => {
    const { MemoriConnector } = await import("./connectors/MemoriConnector");
    return new MemoriConnector();
  },
  async () => {
    // RFC-014: Web Connector — sessoes autenticadas (WebSession) + capabilities
    // descobertas (CapabilityMap) via Playwright MCP. Delegacao para backend
    // functions seguras (webConnectorConnect/webConnectorDiscover).
    const { WebConnector } = await import("./connectors/WebConnector");
    return new WebConnector();
  },
  async () => {
    // MCP generico: chama servidores MCP externos (MCPServerConfig) via
    // backend function mcpClientCall (Streamable HTTP + SSE).
    const { MCPConnector } = await import("./connectors/MCPConnector");
    return new MCPConnector();
  },
  async () => {
    // OpenHands Cloud — orquestra tarefas de engenharia via backend function
    // openHandsTaskProcess (Cloud API + Agent Server REST). Conector fino,
    // mesma forma dos demais: credencial fica no backend.
    const { OpenHandsConnector } = await import("./connectors/OpenHandsConnector");
    return new OpenHandsConnector();
  },
  async () => {
    // Read-only observability over existing durable telemetry.
    const { RuntimeObservabilityConnector } = await import("./connectors/RuntimeObservabilityConnector");
    return new RuntimeObservabilityConnector();
  },
  async () => {
    const { MicrosoftGraphConnector } = await import("./connectors/MicrosoftGraphConnector");
    return new MicrosoftGraphConnector();
  },
  // ── P4 Official Connectors ────────────────────────────────────────────────
  async () => {
    const { EmailConnector } = await import("./connectors/EmailConnector");
    return new EmailConnector();
  },
  async () => {
    const { FileSystemConnector } = await import("./connectors/FileSystemConnector");
    return new FileSystemConnector();
  },
  async () => {
    const { DatabaseConnector } = await import("./connectors/DatabaseConnector");
    return new DatabaseConnector();
  },
  async () => {
    // WhatsApp Business — 5 camadas: Provider/Meta+Evolution+Baileys,
    // Event (RuntimeEventBus), Observation (KnowledgeRegistry), Watch (ConnectorGateway)
    const { WhatsAppConnector } = await import("./connectors/WhatsAppConnector");
    return new WhatsAppConnector();
  },
  // AP-03 (RFC-010/ADR-017): Adaptive Process shell connector — composite capability.
  // Inerte ate AP-04 (runtime wiring) e AP-05 (sinais no GoalRegistry).
  async () => {
    const { AdaptiveProcessConnector } = await import("./connectors/AdaptiveProcessConnector");
    return new AdaptiveProcessConnector();
  },
];

// ── ConnectorBootstrap ────────────────────────────────────────────────────────

export const ConnectorBootstrap = Object.freeze({
  /**
   * Discovers, validates, and registers all official connectors.
   * Never aborts on a single connector failure.
   * Returns an immutable BootstrapResult.
   */
  async bootstrap(registry: ConnectorRegistry): Promise<BootstrapResult> {
    const t0 = Date.now();
    const errors: string[]    = [];
    const loadedIds: string[] = [];
    let capabilitiesLoaded    = 0;

    // [RUNTIME-PROBE][CBS-01] ConnectorBootstrap.bootstrap() started
    console.log("[RUNTIME-PROBE][CBS-01]", {
      probe:        "bootstrap:started",
      t:            performance.now(),
      ts:           Date.now(),
      factoryCount: OFFICIAL_FACTORIES.length,
      regSizeAtEntry: registry.count(),
      note:         "If this fires AFTER any CXP-01, the first request arrived before bootstrap began.",
    });

    // Carrega todos os connectors em paralelo para reduzir tempo de bootstrap
    const results = await Promise.allSettled(OFFICIAL_FACTORIES.map((f) => f()));

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(`Factory failed: ${(result.reason as Error)?.message ?? result.reason}`);
        continue;
      }

      const connector = result.value;
      const err = validateConnector(connector);
      if (err) {
        errors.push(`Validation failed — ${err}`);
        continue;
      }

      if (registry.has(connector.id)) {
        errors.push(`[${connector.id}] already registered — skipped`);
        continue;
      }

      try {
        registry.register(connector);
        capabilitiesLoaded += connector.metadata().capabilities.length;
        loadedIds.push(connector.id);
        console.log("[RUNTIME-PROBE][CBS-02]", {
          probe:         "bootstrap:connectorRegistered",
          t:             performance.now(),
          ts:            Date.now(),
          connectorId:   connector.id,
          regSizeNow:    registry.count(),
          allRegistered: loadedIds.slice(),
        });
        // FIX (religado em 2026-08-02+): RuntimeEventBus existia mas nunca
        // era chamado por aqui. Emite ConnectorRegistered pra cada conector
        // que sobe com sucesso — fire-and-forget, nunca bloqueia bootstrap.
        try {
          runtimeEventBus.emit("ConnectorRegistered", connector.id, {
            capabilities: connector.metadata().capabilities,
          });
        } catch { /* nunca deixa o bus quebrar o bootstrap */ }
      } catch (e) {
        errors.push(`[${connector.id}] registry.register() threw: ${(e as Error).message}`);
      }
    }

    // [RUNTIME-PROBE][CBS-03] ConnectorBootstrap.bootstrap() complete
    console.log("[RUNTIME-PROBE][CBS-03]", {
      probe:              "bootstrap:complete",
      t:                  performance.now(),
      ts:                 Date.now(),
      bootstrapTimeMs:    Date.now() - t0,
      connectorsLoaded:   loadedIds.length,
      connectorIds:       loadedIds.slice(),
      errors:             errors.slice(),
      note:               "Bootstrap finished. Real engine will be swapped by CRP-06 immediately after this.",
    });

    return Object.freeze({
      connectorsLoaded:   loadedIds.length,
      capabilitiesLoaded,
      bootstrapTimeMs:    Date.now() - t0,
      errors:             Object.freeze(errors),
      connectorIds:       Object.freeze(loadedIds),
    });
  },
});