/**
 * ConnectionManager.ts — Phase 5.7.0 · EF-57.1
 * Centralized connector lifecycle — the ONLY authority on connector state.
 * No connector manages its own lifecycle.
 */

import { GitHubAuthFlow } from "./GitHubAuthFlow";
import { Base44AuthFlow } from "./Base44AuthFlow";
import { ConnectorHealthMonitor } from "./ConnectorHealthMonitor";
import type {
  ConnectorId, ConnectorDescriptor, ConnectorRegistration, ConnectorState,
  AuthToken, AuthResult, DiscoveredData, ConnectorHealth, ManagerDiagnostics,
} from "./ConnectionManagerTypes";
import { makeCMId } from "./ConnectionManagerTypes";

// ── Static Descriptors ────────────────────────────────────────────────────────

const DESCRIPTORS: Record<ConnectorId, ConnectorDescriptor> = {
  github: {
    id: "github", name: "GitHub", version: "1.0.0",
    capabilities: ["repositories.list", "branches.list", "commits.list", "files.read", "search"],
    authMethod: "token",
    description: "GitHub REST API — repository analysis, branch/commit history, file retrieval",
  },
  base44: {
    id: "base44", name: "Base44", version: "1.0.0",
    capabilities: ["projects.list", "entities.list", "entities.read", "workspace.diagnostics"],
    authMethod: "session",
    description: "Base44 BaaS — entity access, project discovery, application analysis",
  },
};

function emptyHealth(state: ConnectorState): ConnectorHealth {
  return {
    status: "UNKNOWN",
    authStatus: state,
    latencyMs: null,
    healthScore: 0,
    availability: 0,
    lastCheckedAt: null,
    errors: [],
    warnings: [],
  };
}

// ── ConnectionManager ─────────────────────────────────────────────────────────

export class ConnectionManager {
  private readonly _github  = new GitHubAuthFlow();
  private readonly _base44  = new Base44AuthFlow();
  private readonly _monitor = new ConnectorHealthMonitor();

  private _registry: Map<ConnectorId, ConnectorRegistration> = new Map();

  constructor() {
    // Pre-register both connectors in DISCONNECTED state
    for (const [id, descriptor] of Object.entries(DESCRIPTORS)) {
      this._registry.set(id as ConnectorId, {
        id:             makeCMId("reg"),
        connectorId:    id as ConnectorId,
        descriptor,
        state:          "DISCONNECTED",
        token:          null,
        health:         emptyHealth("DISCONNECTED"),
        lastSync:       null,
        lastSuccess:    null,
        lastFailure:    null,
        errorMessage:   null,
        registeredAt:   Date.now(),
        discoveredData: null,
      });
    }
  }

  // ── Registration / Discovery ───────────────────────────────────────────────

  getRegistration(id: ConnectorId): ConnectorRegistration | null {
    return this._registry.get(id) ?? null;
  }

  getAllRegistrations(): ConnectorRegistration[] {
    return [...this._registry.values()];
  }

  getCapabilities(id: ConnectorId): string[] {
    return DESCRIPTORS[id]?.capabilities ?? [];
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  async authenticate(id: ConnectorId): Promise<AuthResult> {
    const result = id === "github"
      ? await this._github.authenticate()
      : await this._base44.authenticate();

    const reg = this._registry.get(id);
    if (reg) {
      reg.state        = result.state;
      reg.token        = result.token;
      reg.errorMessage = result.error;
      if (result.success) {
        reg.lastSuccess    = Date.now();
        reg.discoveredData = result.discoveredData;
      } else {
        reg.lastFailure = Date.now();
      }
    }

    // Trigger health check after auth
    await this._refreshHealth(id);
    return result;
  }

  async authenticateAll(): Promise<{ github: AuthResult; base44: AuthResult }> {
    const [github, base44] = await Promise.all([
      this.authenticate("github"),
      this.authenticate("base44"),
    ]);
    return { github, base44 };
  }

  // ── Token Lifecycle ────────────────────────────────────────────────────────

  async validateToken(id: ConnectorId): Promise<{ valid: boolean; newState: ConnectorState }> {
    const flow = id === "github" ? this._github : this._base44;
    const { valid, error } = await flow.validateToken();
    const reg = this._registry.get(id);
    if (reg) {
      if (valid) {
        reg.state = "CONNECTED";
        reg.lastSuccess = Date.now();
      } else {
        reg.state        = error?.includes("expired") ? "TOKEN_EXPIRED" : "AUTH_REQUIRED";
        reg.lastFailure  = Date.now();
        reg.errorMessage = error;
      }
    }
    return { valid, newState: this._registry.get(id)?.state ?? "ERROR" };
  }

  async logout(id: ConnectorId): Promise<void> {
    const reg = this._registry.get(id);
    if (reg) {
      reg.state          = "DISCONNECTED";
      reg.token          = null;
      reg.discoveredData = null;
      reg.lastFailure    = null;
      reg.errorMessage   = null;
      reg.health         = emptyHealth("DISCONNECTED");
    }
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  async checkHealth(id: ConnectorId) {
    return this._refreshHealth(id);
  }

  async checkAllHealth() {
    const [gh, b44] = await Promise.all([
      this._refreshHealth("github"),
      this._refreshHealth("base44"),
    ]);
    return { github: gh, base44: b44 };
  }

  private async _refreshHealth(id: ConnectorId) {
    const result = await this._monitor.check(id);
    const reg    = this._registry.get(id);
    if (reg) {
      reg.health   = result.health;
      reg.lastSync = Date.now();
      if (result.health.authStatus === "CONNECTED") {
        reg.state = "CONNECTED";
      }
    }
    return result;
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  async rediscover(id: ConnectorId): Promise<DiscoveredData | null> {
    const flow = id === "github" ? this._github : this._base44;
    const data = await flow.discover();
    const reg  = this._registry.get(id);
    if (reg) {
      reg.discoveredData = data;
      reg.lastSync = Date.now();
    }
    return data;
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  getDiagnostics(): ManagerDiagnostics {
    const all     = this.getAllRegistrations();
    const connected = all.filter(r => r.state === "CONNECTED").length;
    const healthy   = all.filter(r => r.health.status === "HEALTHY").length;
    const scores    = all.map(r => r.health.healthScore);
    const overall   = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const synced    = all.map(r => r.lastSync).filter(Boolean) as number[];

    return {
      id:              makeCMId("diag"),
      generatedAt:     Date.now(),
      connectors:      all,
      totalConnectors: all.length,
      connectedCount:  connected,
      healthyCount:    healthy,
      overallHealth:   overall,
      lastFullSync:    synced.length > 0 ? Math.min(...synced) : null,
    };
  }

  getHealthHistory() {
    return this._monitor.getHistory();
  }
}