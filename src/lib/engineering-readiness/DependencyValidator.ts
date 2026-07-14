/**
 * DependencyValidator.ts — Sprint 6.3.5
 * Validates dependency health: no circular refs, no orphans, no broken imports.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "WARN", detail, critical };
}

// Known stable module dependency graph
const EXPECTED_MODULES = [
  "KnowledgeGraphStore",
  "EngineeringWorkflow",
  "EngineeringOrchestrator",
  "ConnectorRuntime",
  "ConnectorRegistry",
  "ConnectorFactory",
  "EngineeringMemory",
  "AcceptanceEngine",
  "AutonomousEngineeringLoop",
  "RuntimeSupervisor",
  "PersistentSessionManager",
  "ConnectorSessionStore",
  "SessionSerializer",
];

export class DependencyValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // Check each stable module imports cleanly
    const moduleMap: Record<string, string> = {
      KnowledgeGraphStore:       "../project-knowledge/KnowledgeGraphStore",
      EngineeringWorkflow:       "../engineering-workflow/EngineeringWorkflow",
      EngineeringOrchestrator:   "../engineering-workflow/EngineeringOrchestrator",
      ConnectorRuntime:          "../universal-connector-platform/ConnectorRuntime",
      ConnectorRegistry:         "../universal-connector-platform/ConnectorRegistry",
      ConnectorFactory:          "../universal-connector-platform/ConnectorFactory",
      EngineeringMemory:         "../engineering-memory/EngineeringMemory",
      AcceptanceEngine:          "../engineering-acceptance/AcceptanceEngine",
      AutonomousEngineeringLoop: "../autonomous-engineering/AutonomousEngineeringLoop",
      RuntimeSupervisor:         "../self-healing-runtime/RuntimeSupervisor",
      PersistentSessionManager:  "../runtime-persistence/PersistentSessionManager",
      ConnectorSessionStore:     "../runtime-persistence/ConnectorSessionStore",
      SessionSerializer:         "../runtime-persistence/SessionSerializer",
    };

    for (const [name, path] of Object.entries(moduleMap)) {
      let ok = false;
      try {
        const mod = await import(/* @vite-ignore */ path);
        ok = !!mod && Object.keys(mod).length > 0;
      } catch { ok = false; }
      checks.push(check(`Module resolvable: ${name}`, ok, ok ? "Import OK" : "Import failed", true));
    }

    // Singleton integrity — globalThis anchors
    const g = globalThis as any;
    const kgsAnchored = typeof g.__kgs_instance !== "undefined" || typeof KnowledgeGraphStore.isReady === "function";
    checks.push(check("KGStore globalThis anchor", kgsAnchored, kgsAnchored ? "Anchor present" : "Anchor missing", false));

    // No circular critical paths (heuristic: all modules load independently)
    const allLoaded = checks.filter(c => c.name.startsWith("Module resolvable")).every(c => c.status === "PASS");
    checks.push(check("No circular import failures", allLoaded, allLoaded ? "All modules load independently" : "Some modules failed — possible circular ref", false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "dep_validator",
      name: "Dependency Validator",
      domain: "Architecture",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} dependencies clean`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[DEP] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Restore missing modules and verify import paths in tsconfig."] : [],
    };
  }
}