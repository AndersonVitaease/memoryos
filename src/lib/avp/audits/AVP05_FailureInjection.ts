// ══════════════════════════════════════════════════════════════════════════════
// AVP-05 — Failure Injection Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, inp } from "../AVPHelpers";
import { ExecutionChain }           from "../../execution-chain/ExecutionChain";
import { DeterministicClock }       from "../../runtime-infra/RuntimeClock";
import { DeterministicProvider }    from "../../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }          from "../../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }           from "../../runtime-infra/RuntimeMetrics";
import { IntentRuntimeStage }       from "../../execution-chain/stages/IntentRuntimeStage";
import { GoalRuntimeStage }         from "../../execution-chain/stages/GoalRuntimeStage";
import { PlanningRuntimeStage }     from "../../execution-chain/stages/PlanningRuntimeStage";
import { KernelStage }              from "../../execution-chain/stages/KernelStage";
import { MemoryStageImpl }          from "../../execution-chain/stages/MemoryStage";
import { ExplainabilityStageImpl }  from "../../execution-chain/stages/ExplainabilityStage";
import { AuditStageImpl }           from "../../execution-chain/stages/AuditStage";

function failingRuntime(methodName: string): Record<string, () => never> {
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "descriptor") return undefined;
      return () => { throw new Error(`INJECTED_FAILURE: ${String(prop)} in ${methodName}`); };
    },
  }) as Record<string, () => never>;
}

function makeBaseChainDeps(tag: string) {
  const clock   = new DeterministicClock(10);
  const ids     = new DeterministicProvider(tag);
  const bus     = new RuntimeEventBus(500);
  const metrics = new RuntimeMetrics(60000, () => clock.now());
  return { runtimeClock: clock, executionIdProvider: ids, eventBus: bus, metrics };
}

interface FailureScenario {
  tag:     string;
  dep:     Record<string, unknown>;
  stage:   string;
}

const SCENARIOS: FailureScenario[] = [
  { tag: "intent",       dep: { intentRuntime: failingRuntime("IntentRuntime") },       stage: "INTENT_RUNTIME" },
  { tag: "goal",         dep: { goalRuntime: failingRuntime("GoalRuntime") },             stage: "GOAL_RUNTIME" },
  { tag: "planning",     dep: { planningRuntime: failingRuntime("PlanningRuntime") },    stage: "PLANNING_RUNTIME" },
  { tag: "kernel",       dep: { kernel: failingRuntime("Kernel") },                      stage: "KERNEL" },
  { tag: "capability",   dep: { capabilityRuntime: failingRuntime("CapabilityRuntime") }, stage: "CAPABILITY_RUNTIME" },
  { tag: "connRuntime",  dep: { connectorRuntime: failingRuntime("ConnectorRuntime") },  stage: "CONNECTOR_RUNTIME" },
  { tag: "connector",    dep: { connectorStage: failingRuntime("ConnectorStage") },      stage: "CONNECTOR" },
  { tag: "memory",       dep: { memoryEngine: failingRuntime("MemoryStage") },           stage: "MEMORY" },
  { tag: "explainability", dep: { explainability: failingRuntime("ExplainabilityStage") }, stage: "EXPLAINABILITY" },
  { tag: "audit",        dep: { auditEngine: failingRuntime("AuditStage") },             stage: "AUDIT" },
];

export async function runAVP05(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-05", "Failure Injection Audit");

  for (const s of SCENARIOS) {
    const deps = { ...makeBaseChainDeps(`avp05-${s.tag}`), ...s.dep };
    const chain = new ExecutionChain(deps as never);

    try {
      const r = await chain.execute(inp(`failure in ${s.stage}`, `sess-${s.tag}`));

      // Must NOT be COMPLETED (failure was injected)
      if (r.status === "COMPLETED" && r.stagesPassed === 13) {
        finding(a, "HIGH", "FailureInjection", `[${s.tag}] Injected failure in ${s.stage} was silently ignored`);
        a.score -= 10;
      }

      // Must not crash the runner — report must still be returned
      if (!r.chainId) {
        finding(a, "CRITICAL", "NoCorruption", `[${s.tag}] Report corrupted — chainId missing`);
        a.score -= 15;
      }

      // Report must be frozen even on failure
      if (!Object.isFrozen(r)) {
        finding(a, "HIGH", "Immutability", `[${s.tag}] Failed report is not frozen`);
        a.score -= 5;
      }

      // Stages executed BEFORE the failure must still be recorded
      const stagesBeforeFailure = r.stages.filter(st => st.status === "COMPLETED").length;
      if (stagesBeforeFailure === 0 && s.stage !== "USER_INPUT") {
        finding(a, "MEDIUM", "GracefulInterruption", `[${s.tag}] No stages completed before failure in ${s.stage}`);
        a.score -= 3;
      }

      a.metrics[`${s.tag}_stagesPassed`] = stagesBeforeFailure;

    } catch (e: unknown) {
      // Unhandled throw = corruption risk
      finding(a, "CRITICAL", "NoCorruption", `[${s.tag}] Unhandled exception escaped ExecutionChain: ${String((e as Error).message ?? e)}`);
      a.score -= 20;
    }
  }

  a.metrics["scenariosTested"] = SCENARIOS.length;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}