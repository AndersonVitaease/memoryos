/**
 * Base44AuthFlow.ts — Phase 5.7.0 · EF-57.3
 * Base44 authentication + resource discovery
 * Uses real Base44 entity API via ConnectorInvocationService.
 */

import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import type { AuthToken, AuthResult, DiscoveredData, DiscoveredResource, ConnectorId } from "./ConnectionManagerTypes";
import { makeCMId } from "./ConnectionManagerTypes";

const CONNECTOR_ID: ConnectorId = "base44";

const ENTITY_NAMES = ["Project", "Message", "ChatSession", "Document", "Task", "KnowledgeEntity", "Decision"];

export class Base44AuthFlow {
  private readonly cis = new ConnectorInvocationService();

  // ── Authenticate ──────────────────────────────────────────────────────────

  async authenticate(): Promise<AuthResult> {
    const t0 = Date.now();
    try {
      const ping = await this.cis.invoke(
        CONNECTOR_ID, "connectivity.ping", {},
        { originComponent: "Base44AuthFlow", reason: "EF-57.3: connectivity validation" }
      );

      if (ping.record.status !== "SUCCESS") {
        return {
          success:       false,
          connectorId:   CONNECTOR_ID,
          state:         "ERROR",
          token:         null,
          error:         `Base44 ping failed: ${ping.record.status}`,
          durationMs:    Date.now() - t0,
          discoveredData: null,
        };
      }

      const token: AuthToken = {
        connectorId: CONNECTOR_ID,
        token:       "***base44-session***",   // session-managed, not exposed
        tokenType:   "session",
        expiresAt:   null,
        scopes:      ["entities:read", "entities:write", "projects:read"],
        acquiredAt:  Date.now(),
        issuedBy:    "base44.com",
      };

      const discoveredData = await this.discover();

      return {
        success:       true,
        connectorId:   CONNECTOR_ID,
        state:         "CONNECTED",
        token,
        error:         null,
        durationMs:    Date.now() - t0,
        discoveredData,
      };
    } catch (e) {
      return {
        success:       false,
        connectorId:   CONNECTOR_ID,
        state:         "ERROR",
        token:         null,
        error:         String(e),
        durationMs:    Date.now() - t0,
        discoveredData: null,
      };
    }
  }

  // ── Token Validation ──────────────────────────────────────────────────────

  async validateToken(): Promise<{ valid: boolean; error: string | null }> {
    try {
      const ping = await this.cis.invoke(
        CONNECTOR_ID, "connectivity.ping", {},
        { originComponent: "Base44AuthFlow", reason: "EF-57.3: re-validation" }
      );
      return { valid: ping.record.status === "SUCCESS", error: null };
    } catch (e) {
      return { valid: false, error: String(e) };
    }
  }

  // ── Discover Resources ────────────────────────────────────────────────────

  async discover(): Promise<DiscoveredData> {
    const resources: DiscoveredResource[] = [];
    try {
      // Projects
      const projInv = await this.cis.base44ListProjects({
        originComponent: "Base44AuthFlow",
        reason: "EF-57.3: resource discovery — projects",
      });
      const projCount = (projInv.result?.data as any)?.count ?? 0;
      resources.push({ type: "applications", count: projCount, items: [] });

      // Entities
      const entityInvs = await Promise.all(
        ENTITY_NAMES.map(e =>
          this.cis.base44ListEntities(e, { originComponent: "Base44AuthFlow", reason: `EF-57.3: discovery — ${e}` })
        )
      );
      const entityCounts: Record<string, number> = {};
      ENTITY_NAMES.forEach((e, i) => {
        entityCounts[e] = (entityInvs[i].result?.data as any)?.count ?? 0;
      });

      const totalEntities = Object.values(entityCounts).reduce((s, v) => s + v, 0);
      resources.push({
        type:  "entities",
        count: totalEntities,
        items: Object.entries(entityCounts).map(([k, v]) => `${k}: ${v}`),
      });

      // Workspace
      const diagInv = await this.cis.base44WorkspaceDiagnostics({
        originComponent: "Base44AuthFlow",
        reason: "EF-57.3: workspace metadata",
      });
      const platform = (diagInv.result?.data as any)?.platform ?? "base44";
      resources.push({ type: "workspace", count: 1, items: [platform] });
    } catch (_) {
      // partial discovery
    }

    return {
      connectorId:  CONNECTOR_ID,
      discoveredAt: Date.now(),
      resources,
      summary:      `${resources.map(r => `${r.count} ${r.type}`).join(", ")}`,
    };
  }
}