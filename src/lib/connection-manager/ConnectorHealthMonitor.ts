/**
 * ConnectorHealthMonitor.ts — Phase 5.7.0 · EF-57.4
 * Evaluates health of every registered connector.
 * Never manages lifecycle — reads state from ConnectionManager.
 */

import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import type {
  ConnectorHealth, ConnectorState, HealthCheckResult, ConnectorId,
} from "./ConnectionManagerTypes";
import { makeCMId } from "./ConnectionManagerTypes";

export class ConnectorHealthMonitor {
  private readonly cis = new ConnectorInvocationService();
  private readonly _history: HealthCheckResult[] = [];

  // ── Check ─────────────────────────────────────────────────────────────────

  async check(connectorId: ConnectorId): Promise<HealthCheckResult> {
    const t0 = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let latencyMs: number | null = null;
    let authStatus: ConnectorState = "DISCONNECTED";
    let available = false;

    try {
      const pingStart = Date.now();
      const ping = await this.cis.invoke(
        connectorId, "connectivity.ping", {},
        { originComponent: "ConnectorHealthMonitor", reason: `EF-57.4: health check — ${connectorId}` }
      );
      latencyMs = Date.now() - pingStart;

      if (ping.record.status === "SUCCESS") {
        authStatus = "CONNECTED";
        available  = true;
      } else if (ping.record.status === "NOT_CONFIGURED") {
        authStatus = "AUTH_REQUIRED";
        warnings.push(`${connectorId} token not configured`);
      } else {
        authStatus = "ERROR";
        errors.push(`Ping returned: ${ping.record.status}`);
      }
    } catch (e) {
      authStatus = "ERROR";
      errors.push(String(e));
    }

    const healthScore = this._score(available, latencyMs, errors.length, warnings.length);
    const status = healthScore >= 80 ? "HEALTHY" : healthScore >= 50 ? "DEGRADED" : healthScore > 0 ? "UNHEALTHY" : "UNKNOWN";

    const health: ConnectorHealth = {
      status,
      authStatus,
      latencyMs,
      healthScore,
      availability: available ? 1 : 0,
      lastCheckedAt: Date.now(),
      errors,
      warnings,
    };

    const result: HealthCheckResult = {
      connectorId,
      health,
      durationMs: Date.now() - t0,
      timestamp:  Date.now(),
    };

    this._history.push(result);
    if (this._history.length > 100) this._history.splice(0, this._history.length - 100);

    return result;
  }

  async checkAll(): Promise<HealthCheckResult[]> {
    const [gh, b44] = await Promise.all([
      this.check("github"),
      this.check("base44"),
    ]);
    return [gh, b44];
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private _score(available: boolean, latencyMs: number | null, errors: number, warnings: number): number {
    if (!available) return errors > 0 ? 0 : 20;
    let score = 100;
    if (latencyMs !== null) {
      if (latencyMs > 5000) score -= 30;
      else if (latencyMs > 2000) score -= 15;
      else if (latencyMs > 1000) score -= 5;
    }
    score -= errors * 20;
    score -= warnings * 5;
    return Math.max(0, Math.min(100, score));
  }

  getHistory(): HealthCheckResult[] {
    return [...this._history].reverse();
  }
}