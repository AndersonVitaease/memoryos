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

    for (const factory of OFFICIAL_FACTORIES) {
      let connector: IConnector | null = null;
      try {
        connector = await factory();
      } catch (e) {
        errors.push(`Factory failed: ${(e as Error).message}`);
        continue;
      }

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