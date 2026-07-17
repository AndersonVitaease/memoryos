// ══════════════════════════════════════════════════════════════════════════════
// AVP-01 — Structural Architecture Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding } from "../AVPHelpers";
import { ExecutionCompositionRoot }  from "../../execution-chain/ExecutionCompositionRoot";
import { DeterministicClock }        from "../../runtime-infra/RuntimeClock";
import { PipelineInstrumentation }   from "../../execution-chain/PipelineInstrumentation";
import { ExecutionReportAssembler }  from "../../execution-chain/ExecutionReportAssembler";
import { RuntimeRegistry }           from "../../execution-chain/RuntimeRegistry";
import { PipelineValidator }         from "../../execution-chain/PipelineValidator";

export async function runAVP01(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-01", "Structural Architecture Audit");

  // ── Dependency direction: CompositionRoot must own all service construction ─
  try {
    const clock = new DeterministicClock(10);
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: clock });

    // Composition Root integrity — all services present
    const required = ["clock","idProvider","eventBus","metrics","connectorRegistry",
                      "runtimeRegistry","auditSink","pipeline","reportAssembler"] as const;
    for (const key of required) {
      if (!(key in rt)) {
        finding(a, "CRITICAL", "CompositionRoot", `Missing service: ${key}`);
        a.score -= 15;
      }
    }
    a.metrics["compositionRootServices"] = required.length;

    // Instrumentation is isolated — NOT inside ExecutionPipeline source
    const instr = new PipelineInstrumentation();
    if (typeof instr.onSuccess !== "function" || typeof instr.onFailure !== "function") {
      finding(a, "CRITICAL", "InstrumentationIsolation", "PipelineInstrumentation missing required methods");
      a.score -= 20;
    }

    // Report assembler is decoupled
    const asm = new ExecutionReportAssembler();
    if (typeof asm.assemble !== "function") {
      finding(a, "CRITICAL", "ReportAssembler", "ExecutionReportAssembler.assemble() missing");
      a.score -= 20;
    }

    // RuntimeRegistry validation
    const reg = new RuntimeRegistry(0);
    const vEmpty = reg.validate();
    if (!vEmpty.valid) {
      finding(a, "HIGH", "RuntimeRegistry", "Empty registry reports invalid: " + vEmpty.violations.join("; "));
      a.score -= 10;
    }

    // Pipeline has exactly 13 stages — structural freeze
    const validator = new PipelineValidator();
    const stageIds = [
      "USER_INPUT","INTENT_RUNTIME","GOAL_RUNTIME","PLANNING_RUNTIME",
      "KERNEL","RUNTIME_ORCHESTRATOR","CAPABILITY_RUNTIME","CONNECTOR_RUNTIME",
      "CONNECTOR","RESULT","MEMORY","EXPLAINABILITY","AUDIT",
    ];
    const fakeStages = stageIds.map(id => ({ id, execute: async () => null }));
    const val = validator.validate(fakeStages as never);
    if (!val.valid) {
      finding(a, "CRITICAL", "PipelineStructure", "PipelineValidator rejected canonical 13-stage pipeline: " + val.errors.join("; "));
      a.score -= 25;
    }
    a.metrics["pipelineStages"] = stageIds.length;

    // Connector isolation — registry resolved before use
    const connType = rt.connectorRegistry.resolve("memory");
    if (connType === undefined || connType === null) {
      finding(a, "MEDIUM", "ConnectorIsolation", "ConnectorRegistry could not resolve 'memory' connector");
      a.score -= 5;
    }

    // Mutable shared state check — runtime objects must be frozen
    if (!Object.isFrozen(rt)) {
      finding(a, "HIGH", "MutableSharedState", "ComposedRuntime is not frozen — mutable shared state risk");
      a.score -= 15;
    }

    // SRP: pipeline stages must only declare id + execute (no business logic fields)
    const pipeline = rt.pipeline as { _stages?: unknown[] };
    const stages = pipeline._stages ?? [];
    for (const s of stages as Array<{ id: string; [k: string]: unknown }>) {
      const keys = Object.keys(s).filter(k => k !== "id" && k !== "execute" && k !== "descriptor");
      if (keys.length > 0) {
        finding(a, "MEDIUM", "SRP", `Stage '${s.id}' has extra properties: ${keys.join(", ")}`);
        a.score -= 5;
      }
    }
    a.metrics["stagesInspected"] = stages.length;

    // Self-registration: all runtimes registered
    const registered = rt.runtimeRegistry.listAll();
    a.metrics["registeredRuntimes"] = registered.length;
    if (registered.length < 12) {
      finding(a, "HIGH", "RuntimeOwnership", `Only ${registered.length}/12 runtimes self-registered`);
      a.score -= 10;
    }

    // validate the full registry
    const regValidation = rt.runtimeRegistry.validate();
    if (!regValidation.valid) {
      for (const v of regValidation.violations) {
        finding(a, "MEDIUM", "RegistryIntegrity", v);
        a.score -= 3;
      }
    }

    // Dependency graph — no unresolved deps
    const graph = rt.runtimeRegistry.dependencyGraph();
    const unresolved = graph.filter(n => !n.resolved);
    a.metrics["unresolvedDependencies"] = unresolved.length;
    if (unresolved.length > 0) {
      finding(a, "HIGH", "CircularDependency", `Unresolved dependencies: ${unresolved.map(n=>n.id).join(", ")}`);
      a.score -= 10;
    }

    a.metrics["registryValidationPassed"] = regValidation.valid;
    a.metrics["dependencyGraphNodes"] = graph.length;

  } catch (e: unknown) {
    finding(a, "CRITICAL", "StructuralAuditError", String((e as Error).message ?? e));
    a.score = 0;
  }

  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}