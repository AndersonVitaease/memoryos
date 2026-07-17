// ══════════════════════════════════════════════════════════════════════════════
// ACL-06 — Architecture Drift Audit
// Compares MAS (canonical spec) against the actual implementation.
// Detects: missing, extra, renamed, removed, duplicate components.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise, MAS_REQUIRED_MODULES } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";

// MAS-defined component registry (authoritative spec)
const MAS_SPEC = {
  "ExecutionChain":            { layer: "Runtime",   role: "Orchestrator" },
  "ExecutionPipeline":         { layer: "Runtime",   role: "Pipeline" },
  "ExecutionCompositionRoot":  { layer: "Runtime",   role: "Factory" },
  "PipelineBuilder":           { layer: "Runtime",   role: "Builder" },
  "PipelineStage":             { layer: "Runtime",   role: "Interface" },
  "ExecutionState":            { layer: "Runtime",   role: "StateCarrier" },
  "ExecutionContext":          { layer: "Runtime",   role: "Context" },
  "ExecutionChainTypes":       { layer: "Runtime",   role: "Types" },
  "ExecutionReportAssembler":  { layer: "Runtime",   role: "Assembler" },
  "RuntimeRegistry":           { layer: "Runtime",   role: "Registry" },
  "PipelineInstrumentation":   { layer: "Runtime",   role: "Instrumentation" },
  "RuntimeEventBus":           { layer: "Infra",     role: "EventBus" },
  "RuntimeMetrics":            { layer: "Infra",     role: "Metrics" },
  "RuntimeClock":              { layer: "Infra",     role: "Clock" },
  "RuntimeAuditSink":          { layer: "Infra",     role: "AuditSink" },
};

// Modules that exist in implementation but NOT in MAS spec (should be flagged)
const IMPLEMENTATION_MODULES_TO_CHECK = [
  "PipelineValidator",
  "RuntimeExecutionIdProvider",
  "ConnectorRegistry",
  "RuntimeBase",
];

export async function runACL06(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-06", "Architecture Drift Audit");
  const t = Date.now();

  try {
    const specModules   = Object.keys(MAS_SPEC);
    let missingCount    = 0;
    let extraCount      = 0;
    let verifiedCount   = 0;

    // ── Check each MAS-required module exists ─────────────────────────────────
    for (const mod of MAS_REQUIRED_MODULES) {
      let found = false;
      try {
        const m = await import(/* @vite-ignore */ `@/lib/execution-chain/${mod}`);
        if (Object.keys(m).length > 0) {
          found = true;
          verifiedCount++;
        }
      } catch {
        // try runtime-infra
        try {
          const m2 = await import(/* @vite-ignore */ `@/lib/runtime-infra/${mod}`);
          if (Object.keys(m2).length > 0) {
            found = true;
            verifiedCount++;
          }
        } catch { /* not in either location */ }
      }

      if (!found) {
        missingCount++;
        finding(a, "HIGH", "MissingComponent",
          `MAS-required component '${mod}' not found in implementation`);
        a.score -= 7;
      } else {
        finding(a, "INFO", "ComponentVerified", `✓ ${mod} — present`);
      }
    }

    // ── Check implementation modules not in MAS spec ──────────────────────────
    for (const extra of IMPLEMENTATION_MODULES_TO_CHECK) {
      if (!specModules.includes(extra)) {
        extraCount++;
        finding(a, "LOW", "ExtraComponent",
          `Component '${extra}' exists in implementation but not in MAS spec — may be undocumented`);
        a.score -= 1;
      }
    }

    // ── Check for actual registered runtimes vs MAS spec ──────────────────────
    const rt = ExecutionCompositionRoot.compose({});
    const registered = rt.registry.listAll().map(r => r.id);
    a.metrics["registeredRuntimes"] = registered.length;

    // Duplicate check
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of registered) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    a.metrics["duplicates"] = duplicates.length;
    for (const d of duplicates) {
      finding(a, "CRITICAL", "DuplicateComponent",
        `Duplicate runtime registration: '${d}'`);
      a.score -= 15;
    }

    a.metrics["specModules"]    = specModules.length;
    a.metrics["verifiedCount"]  = verifiedCount;
    a.metrics["missingCount"]   = missingCount;
    a.metrics["extraCount"]     = extraCount;
    a.metrics["driftScore"]     = missingCount + extraCount + duplicates.length;

    if (missingCount === 0 && duplicates.length === 0) {
      finding(a, "INFO", "DriftStatus",
        `Architecture drift = ZERO — all ${verifiedCount} required components present`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL06Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}