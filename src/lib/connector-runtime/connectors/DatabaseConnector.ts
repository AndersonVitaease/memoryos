/**
 * DatabaseConnector.ts — P4 Official Connector
 *
 * Database abstraction connector — production implementation.
 * Delegates to Base44 entities layer (the platform's built-in database).
 * Follows the same IConnector pattern as all other official connectors.
 *
 * Pattern: identical to GmailConnector / GoogleCalendarConnector.
 * Pipeline: ConnectorBootstrap → ConnectorRegistry → UCRBridge → execute()
 *
 * Supported operations:
 *   - db.query          — filter entities by criteria
 *   - db.get            — get single entity by id
 *   - db.create         — create a new entity record
 *   - db.update         — update an existing entity record
 *   - db.delete         — delete an entity record
 *   - db.count          — count matching records
 *   - connectivity.ping
 */

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";
import { base44 } from "@/api/base44Client";

const CAPABILITIES = Object.freeze([
  "db.query",
  "db.get",
  "db.create",
  "db.update",
  "db.delete",
  "db.count",
  "connectivity.ping",
]);

// ── Result builders (same pattern as GoogleCalendarConnector) ─────────────────

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "database", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "database", executionId: eid, logs };
}

// ── DatabaseConnector ──────────────────────────────────────────────────────────

export class DatabaseConnector implements IConnector {
  readonly id = "database";

  metadata(): ConnectorMetadata {
    return {
      id: "database",
      name: "Database Connector",
      version: "1.0.0",
      description: "Official database abstraction connector — delegates to Base44 entities layer.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      capabilityReversibility: {
        "db.query": "safe",
        "db.get": "safe",
        "db.count": "safe",
        "db.create": "reversible",
        "db.update": "reversible",
        "db.delete": "irreversible",
        "connectivity.ping": "safe",
      },
    };
  }

  validate(): boolean { return true; }

  async initialize(_ctx: ConnectorContext): Promise<void> {}

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: "Database connector ready — Base44 entities layer available",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid   = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    // Require entity name for all db operations
    if (operation !== "connectivity.ping") {
      const entity = payload.entity as string;
      if (!entity || typeof entity !== "string") {
        return fail("payload.entity (string) is required", "validation", start, eid, logs, operation);
      }
    }

    try {
      return await this._dispatch(operation, payload, start, eid, logs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    start: number,
    eid: string,
    logs: ConnectorLog[],
  ): Promise<ConnectorResult> {

    const entityName = payload.entity as string;

    switch (operation) {

      case "connectivity.ping": {
        logs.push(makeLog("info", `[${operation}] Base44 entities layer available`));
        return ok({ pong: true, provider: "base44-entities" }, start, eid, logs, operation);
      }

      case "db.query": {
        const filter  = (payload.filter as Record<string, unknown>) ?? {};
        const sort    = (payload.sort as string)  ?? "-created_date";
        const limit   = (payload.limit as number) ?? 50;
        const entity  = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        const records = Object.keys(filter).length > 0
          ? await entity.filter(filter, sort, limit)
          : await entity.list(sort, limit);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} count=${records.length}`));
        return ok({ records, count: records.length }, start, eid, logs, operation);
      }

      case "db.get": {
        const id = payload.id as string;
        if (!id) return fail("payload.id (string) is required", "validation", start, eid, logs, operation);
        const entity = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        const record = await entity.get(id);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} id=${id}`));
        return ok({ record }, start, eid, logs, operation);
      }

      case "db.create": {
        const data = (payload.data as Record<string, unknown>) ?? {};
        const entity = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        const record = await entity.create(data);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} id=${record?.id}`));
        return ok({ record }, start, eid, logs, operation);
      }

      case "db.update": {
        const id   = payload.id as string;
        const data = (payload.data as Record<string, unknown>) ?? {};
        if (!id) return fail("payload.id (string) is required", "validation", start, eid, logs, operation);
        const entity = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        const record = await entity.update(id, data);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} id=${id}`));
        return ok({ record }, start, eid, logs, operation);
      }

      case "db.delete": {
        const id = payload.id as string;
        if (!id) return fail("payload.id (string) is required", "validation", start, eid, logs, operation);
        const entity = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        await entity.delete(id);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} id=${id}`));
        return ok({ deleted: true, id }, start, eid, logs, operation);
      }

      case "db.count": {
        const filter = (payload.filter as Record<string, unknown>) ?? {};
        const entity = (base44.entities as any)[entityName];
        if (!entity) return fail(`Unknown entity: "${entityName}"`, "validation", start, eid, logs, operation);
        const records = Object.keys(filter).length > 0
          ? await entity.filter(filter, "-created_date", 500)
          : await entity.list("-created_date", 500);
        logs.push(makeLog("info", `[${operation}] entity=${entityName} count=${records.length}`));
        return ok({ count: records.length }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}