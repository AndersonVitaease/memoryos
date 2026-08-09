/**
 * WebConnector.ts — RFC-014: integracao do Web Connector no ConnectorRuntime.
 *
 * Implementa IConnector (connector-runtime), mesmo padrao do MCPConnector.
 * Delega toda interacao com Playwright MCP as backend functions seguras
 * `webConnectorConnect` (use) e `webConnectorDiscover` (discover). Nada de
 * cookies/credenciais no navegador — ficam no backend (ADR-019).
 *
 * Capabilities (MVP, todas read-only/safe):
 *   - web.session.list     -> lista WebSession ativas do usuario
 *   - web.capability.list   -> lista capabilities validadas (CapabilityMap) de um site
 *   - web.discover          -> dispara descoberta (webConnectorDiscover) numa WebSession ativa
 *   - web.session.use       -> reusa sessao (webConnectorConnect use): injeta cookies + navega + valida
 *   - connectivity.ping
 *
 * EXECUCAO DE CAPABILITIES VALIDADAS (form-fill + leitura de resultado) fica
 * fora do MVP do RFC-014 — e o item de maior risco e exige validacao dedicada
 * (RFC-013 spike provou a descoberta; a execucao read-only de formulario
 * sera fretada depois, com a mesma disciplina de seguranca).
 *
 * Reversibility: todas "safe" — leitura/listagem/disparo de descoberta read-only.
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
  "web.session.list",
  "web.capability.list",
  "web.discover",
  "web.session.use",
  "web.capability.execute",
  "connectivity.ping",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "web", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED - ${error} - ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "web", executionId: eid, logs };
}

export class WebConnector implements IConnector {
  readonly id = "web";

  metadata(): ConnectorMetadata {
    return {
      id: "web",
      name: "Web Connector",
      version: "1.0.0",
      description:
        "Web Connector generico (RFC-012/013/014) — sessoes autenticadas e capabilities descobertas via Playwright MCP. Delegacao para backend functions seguras.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      capabilityReversibility: {
        "web.session.list": "safe",
        "web.capability.list": "safe",
        "web.discover": "safe",
        "web.session.use": "safe",
        "web.capability.execute": "safe",
        "connectivity.ping": "safe",
      },
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Stateless — sessoes e capabilities sao resolvidas a cada chamada.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: "WebConnector pronto — sessoes via WebSession, capabilities via CapabilityMap.",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    try {
      switch (operation) {
        case "connectivity.ping": {
          return ok({ pong: true, connector: "web" }, start, eid, logs, operation);
        }

        case "web.session.list": {
          const sessions = await base44.entities.WebSession.filter({ status: "active" });
          return ok(
            { sessions: (sessions || []).map((s) => ({ id: s.id, site_url: s.site_url, site_name: s.site_name, expires_at: s.expires_at })) },
            start,
            eid,
            logs,
            operation,
          );
        }

        case "web.capability.list": {
          const siteUrl = typeof payload.siteUrl === "string" ? payload.siteUrl.trim() : null;
          if (!siteUrl) {
            return fail("siteUrl e obrigatorio para web.capability.list", start, eid, logs, operation);
          }
          const maps = await base44.entities.CapabilityMap.filter({ site_url: siteUrl });
          let capabilities: unknown[] = [];
          if (maps && maps.length > 0) {
            try {
              const parsed = JSON.parse(maps[0].capabilities || "[]");
              capabilities = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              capabilities = [];
            }
          }
          return ok({ site_url: siteUrl, capabilities, version: maps[0]?.version ?? null }, start, eid, logs, operation);
        }

        case "web.discover": {
          const webSessionId = typeof payload.webSessionId === "string" ? payload.webSessionId.trim() : null;
          if (!webSessionId) {
            return fail("webSessionId e obrigatorio para web.discover", start, eid, logs, operation);
          }
          const maxPages = typeof payload.maxPages === "number" ? payload.maxPages : undefined;
          const res = await base44.functions.invoke("webConnectorDiscover", {
            operation: "discover",
            webSessionId,
            ...(maxPages ? { maxPages } : {}),
          });
          const d = (res?.data ?? res) as Record<string, unknown> | null;
          if (d?.error) return fail(String(d.error), start, eid, logs, operation);
          return ok(
            {
              pages_explored: d?.pages_explored ?? 0,
              candidates_discovered: d?.candidates_discovered ?? 0,
              candidates: d?.candidates ?? [],
              visited_urls: d?.visited_urls ?? [],
            },
            start,
            eid,
            logs,
            operation,
          );
        }

        case "web.session.use": {
          const webSessionId = typeof payload.webSessionId === "string" ? payload.webSessionId.trim() : null;
          if (!webSessionId) {
            return fail("webSessionId e obrigatorio para web.session.use", start, eid, logs, operation);
          }
          const res = await base44.functions.invoke("webConnectorConnect", {
            operation: "use",
            webSessionId,
          });
          const d = (res?.data ?? res) as Record<string, unknown> | null;
          if (d?.error) return fail(String(d.error), start, eid, logs, operation);
          return ok(
            { sessionValid: d?.sessionValid === true, snapshotText: (d?.snapshotText as string) || "" },
            start,
            eid,
            logs,
            operation,
          );
        }

        case "web.capability.execute": {
          const webSessionId = typeof payload.webSessionId === "string" ? payload.webSessionId.trim() : null;
          const discoveredFromUrl = typeof payload.discoveredFromUrl === "string" ? payload.discoveredFromUrl.trim() : null;
          const inputFields = Array.isArray(payload.inputFields) ? payload.inputFields.map((f) => String(f)) : [];
          const inputs = payload.inputs && typeof payload.inputs === "object" ? (payload.inputs as Record<string, unknown>) : {};
          if (!webSessionId) return fail("webSessionId e obrigatorio para web.capability.execute", start, eid, logs, operation);
          if (!discoveredFromUrl) return fail("discoveredFromUrl e obrigatorio para web.capability.execute", start, eid, logs, operation);
          if (inputFields.length === 0) return fail("inputFields (array nao vazio) e obrigatorio", start, eid, logs, operation);
          const res = await base44.functions.invoke("webConnectorConnect", {
            operation: "executeCapability",
            webSessionId,
            discoveredFromUrl,
            inputFields,
            inputs,
          });
          const d = (res?.data ?? res) as Record<string, unknown> | null;
          if (d?.error) return fail(String(d.error), start, eid, logs, operation);
          return ok(
            { finalUrl: d?.finalUrl ?? "", filled: d?.filled ?? [], snapshotText: d?.snapshotText ?? "" },
            start,
            eid,
            logs,
            operation,
          );
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}