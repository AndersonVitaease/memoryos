// ══════════════════════════════════════════════════════════════════════════════
// ACL-05 — Public API Audit
// Validates public classes, interfaces, exports; flags orphan APIs and dead code.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";

// Canonical public API contract — what must exist and be importable
const REQUIRED_PUBLIC_APIS = [
  { module: "@/lib/execution-chain/ExecutionChain",              export: "ExecutionChain" },
  { module: "@/lib/execution-chain/ExecutionPipeline",           export: "ExecutionPipeline" },
  { module: "@/lib/execution-chain/PipelineBuilder",             export: "PipelineBuilder" },
  { module: "@/lib/execution-chain/ExecutionCompositionRoot",    export: "ExecutionCompositionRoot" },
  { module: "@/lib/execution-chain/RuntimeRegistry",             export: "RuntimeRegistry" },
  { module: "@/lib/execution-chain/ExecutionReportAssembler",    export: "ExecutionReportAssembler" },
  { module: "@/lib/execution-chain/PipelineInstrumentation",     export: "PipelineInstrumentation" },
  { module: "@/lib/execution-chain/PipelineValidator",           export: "PipelineValidator" },
  { module: "@/lib/execution-chain/ExecutionState",              export: "withUserInput" },
  { module: "@/lib/runtime-infra/RuntimeEventBus",               export: "RuntimeEventBus" },
  { module: "@/lib/runtime-infra/RuntimeMetrics",                export: "RuntimeMetrics" },
  { module: "@/lib/runtime-infra/RuntimeClock",                  export: "RuntimeClock" },
  { module: "@/lib/capability-runtime/CapabilityRuntime",        export: "CapabilityRuntime" },
  { module: "@/lib/capability-registry/CapabilityRegistry",      export: "CapabilityRegistry" },
];

export async function runACL05(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-05", "Public API Audit");
  const t = Date.now();

  try {
    let verified = 0;
    let orphaned  = 0;
    let deadCode  = 0;

    for (const api of REQUIRED_PUBLIC_APIS) {
      try {
        const mod = await import(/* @vite-ignore */ api.module);
        if (mod[api.export] !== undefined) {
          verified++;
          finding(a, "INFO", "PublicAPI",
            `✓ ${api.export} — exported from ${api.module}`);
        } else {
          orphaned++;
          finding(a, "HIGH", "OrphanExport",
            `${api.export} not found in ${api.module} — orphan or renamed`);
          a.score -= 6;
        }
      } catch {
        deadCode++;
        finding(a, "CRITICAL", "DeadCode",
          `Cannot resolve module '${api.module}' — dead import or missing file`);
        a.score -= 10;
      }
    }

    a.metrics["verified"] = verified;
    a.metrics["orphaned"]  = orphaned;
    a.metrics["deadCode"]  = deadCode;
    a.metrics["total"]     = REQUIRED_PUBLIC_APIS.length;

    // ── Check type-only exports (no runtime value) ────────────────────────────
    const TYPE_ONLY = [
      "@/lib/execution-chain/ExecutionChainTypes",
      "@/lib/execution-chain/PipelineStage",
      "@/lib/execution-chain/ExecutionContext",
      "@/lib/acl/ACLTypes",
      "@/lib/avp/AVPTypes",
    ];

    let typeModules = 0;
    for (const m of TYPE_ONLY) {
      try {
        await import(/* @vite-ignore */ m);
        typeModules++;
      } catch {
        finding(a, "MEDIUM", "TypeModule",
          `Type module '${m}' cannot be resolved`);
        a.score -= 3;
      }
    }
    a.metrics["typeModulesVerified"] = typeModules;

    if (orphaned === 0 && deadCode === 0) {
      finding(a, "INFO", "PublicAPI",
        `All ${verified} public APIs verified — no orphans, no dead code`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL05Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}