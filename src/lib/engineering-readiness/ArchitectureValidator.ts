/**
 * ArchitectureValidator.ts — Sprint 6.3.5
 * Validates architecture authority, contracts, and layer compliance.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "WARN", detail, critical };
}

export class ArchitectureValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    const archModules: Array<[string, string, boolean]> = [
      ["ArchitectureAuthority",     "../architecture-authority/ArchitectureAuthority",     true],
      ["ContractRegistry",          "../architecture-authority/ContractRegistry",           false],
      ["BreakingChangeDetector",    "../architecture-authority/BreakingChangeDetector",     false],
      ["FeatureFlagEngine",         "../architecture-authority/FeatureFlagEngine",          false],
      ["MigrationPlanner",          "../architecture-authority/MigrationPlanner",           false],
      ["ArchitectureInspector",     "../architecture-authority/ArchitectureInspector",      false],
      ["CompatibilityEngine",       "../architecture-authority/CompatibilityEngine",        false],
    ];

    for (const [name, path, critical] of archModules) {
      let ok = false;
      try {
        const mod = await import(/* @vite-ignore */ path);
        ok = !!mod && Object.keys(mod).length > 0;
      } catch { ok = false; }
      checks.push(check(`Architecture: ${name}`, ok, ok ? "Module accessible" : "Module missing", critical));
    }

    // ABV boundary protection
    let abvOk = false;
    try {
      const { ArchitecturalBoundaryValidator } = await import("../abv/ArchitecturalBoundaryValidator");
      const abv = new ArchitecturalBoundaryValidator();
      abvOk = typeof abv.validate === "function";
    } catch { abvOk = false; }
    checks.push(check("ABV Boundary Validator accessible", abvOk, abvOk ? "ABV API callable" : "ABV import failed", false));

    // Layer ordering integrity (heuristic: sprint 6.x modules all present)
    const layers = [
      "EngineeringWorkflow", "EngineeringOrchestrator", "EngineeringMemory",
      "ConnectorRuntime", "AcceptanceEngine", "AutonomousEngineeringLoop",
    ];
    const layerModuleMap: Record<string, string> = {
      EngineeringWorkflow:       "../engineering-workflow/EngineeringWorkflow",
      EngineeringOrchestrator:   "../engineering-workflow/EngineeringOrchestrator",
      EngineeringMemory:         "../engineering-memory/EngineeringMemory",
      ConnectorRuntime:          "../universal-connector-platform/ConnectorRuntime",
      AcceptanceEngine:          "../engineering-acceptance/AcceptanceEngine",
      AutonomousEngineeringLoop: "../autonomous-engineering/AutonomousEngineeringLoop",
    };
    let layersOk = 0;
    for (const l of layers) {
      try {
        const mod = await import(/* @vite-ignore */ layerModuleMap[l]);
        if (mod) layersOk++;
      } catch { /* ok */ }
    }
    checks.push(check("All architecture layers present", layersOk === layers.length, `${layersOk}/${layers.length} layers`, true));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "arch_validator",
      name: "Architecture Validator",
      domain: "Architecture",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} architecture checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[ARCH] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: failed.length > 0
        ? ["Restore missing architecture authority modules."] : [],
    };
  }
}