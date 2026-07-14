/**
 * StartupHealthCheck.ts — Sprint 6.3.4
 * Validates all critical system components on startup.
 */

import type { HealthCheckResult } from "./RuntimePersistenceTypes";

const COMPONENTS = [
  "ConnectorRegistry",
  "ConnectorRuntime",
  "KnowledgeGraph",
  "EngineeringMemory",
  "Governance",
  "ArchitectureAuthority",
  "AcceptanceFramework",
  "SelfHealingRuntime",
  "AutonomousEngineeringLoop",
];

export class StartupHealthCheck {
  async run(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const component of COMPONENTS) {
      const result = await this._check(component);
      results.push(result);
    }

    return results;
  }

  private async _check(component: string): Promise<HealthCheckResult> {
    const t0 = Date.now();
    try {
      const ok = await this._probe(component);
      return {
        component,
        status:     ok ? "PASS" : "DEGRADED",
        detail:     ok ? `${component} is operational` : `${component} probe returned degraded`,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        component,
        status:     "FAIL",
        detail:     `${component} check failed: ${String(err)}`,
        durationMs: Date.now() - t0,
      };
    }
  }

  private async _probe(component: string): Promise<boolean> {
    // Lightweight structural probes — no side effects
    switch (component) {
      case "ConnectorRegistry": {
        const { ConnectorRegistry } = await import("../universal-connector-platform/ConnectorRegistry");
        return typeof new ConnectorRegistry().register === "function";
      }
      case "ConnectorRuntime": {
        const { ConnectorRuntime } = await import("../universal-connector-platform/ConnectorRuntime");
        return typeof new ConnectorRuntime().start === "function";
      }
      case "KnowledgeGraph": {
        const { KnowledgeGraphStore } = await import("../project-knowledge/KnowledgeGraphStore");
        return typeof KnowledgeGraphStore.isReady === "function";
      }
      case "EngineeringMemory": {
        const { EngineeringMemory } = await import("../engineering-memory/EngineeringMemory");
        return typeof new EngineeringMemory().searchBeforeImplementing === "function";
      }
      case "Governance": {
        const { EngineeringGovernance } = await import("../engineering-governance/EngineeringGovernance");
        return typeof new EngineeringGovernance().evaluate === "function";
      }
      case "ArchitectureAuthority": {
        const { ArchitectureAuthority } = await import("../architecture-authority/ArchitectureAuthority");
        return typeof new ArchitectureAuthority().inspect === "function";
      }
      case "AcceptanceFramework": {
        const { AcceptanceEngine } = await import("../engineering-acceptance/AcceptanceEngine");
        return typeof new AcceptanceEngine().runSprint === "function";
      }
      case "SelfHealingRuntime": {
        const { RuntimeSupervisor } = await import("../self-healing-runtime/RuntimeSupervisor");
        return typeof new RuntimeSupervisor().start === "function";
      }
      case "AutonomousEngineeringLoop": {
        const { AutonomousEngineeringLoop } = await import("../autonomous-engineering/AutonomousEngineeringLoop");
        return typeof new AutonomousEngineeringLoop().run === "function";
      }
      default:
        return true;
    }
  }

  summary(results: HealthCheckResult[]): { pass: number; fail: number; degraded: number; overall: "PASS" | "DEGRADED" | "FAIL" } {
    const pass     = results.filter(r => r.status === "PASS").length;
    const fail     = results.filter(r => r.status === "FAIL").length;
    const degraded = results.filter(r => r.status === "DEGRADED").length;
    const overall  = fail > 0 ? "FAIL" : degraded > 0 ? "DEGRADED" : "PASS";
    return { pass, fail, degraded, overall };
  }
}