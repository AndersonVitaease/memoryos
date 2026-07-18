/**
 * ExecutionStateDecoupling.cert.ts — Sprint EF-7.2.8
 *
 * Architecture validation: ExecutionState is fully decoupled from pipeline.
 * Regression: zero breaking changes, immutability preserved.
 */

import { ExecutionStateFactory, createEmptyExecutionState } from "../ExecutionState";
import { ExecutionStage }        from "../ExecutionStage";

export interface CertResult {
  suite:   string;
  name:    string;
  passed:  boolean;
  detail:  string;
}

function pass(suite: string, name: string, detail = ""): CertResult {
  return { suite, name, passed: true, detail };
}
function fail(suite: string, name: string, detail: string): CertResult {
  return { suite, name, passed: false, detail };
}

// ── Suite 111 — ExecutionStage enum ──────────────────────────────────────────

function suite111(): CertResult[] {
  const results: CertResult[] = [];
  const S = "111";

  // All 13 stages defined
  const expected = [
    "USER_INPUT","INTENT_RUNTIME","GOAL_RUNTIME","PLANNING_RUNTIME","KERNEL",
    "RUNTIME_ORCHESTRATOR","CAPABILITY_RUNTIME","CONNECTOR_RUNTIME","CONNECTOR",
    "RESULT","MEMORY","EXPLAINABILITY","AUDIT",
  ];
  for (const s of expected) {
    const ok = (ExecutionStage as Record<string, string>)[s] === s;
    results.push(ok
      ? pass(S, `ExecutionStage.${s} defined`)
      : fail(S, `ExecutionStage.${s} defined`, `missing`));
  }

  // Enum values are strings (not numbers)
  results.push(
    typeof ExecutionStage.USER_INPUT === "string"
      ? pass(S, "enum values are strings")
      : fail(S, "enum values are strings", `got ${typeof ExecutionStage.USER_INPUT}`)
  );

  return results;
}

// ── Suite 112 — moveToStage API ───────────────────────────────────────────────

function suite112(): CertResult[] {
  const results: CertResult[] = [];
  const S = "112";

  const base = ExecutionStateFactory.create({ executionId: "e1", goalId: "g1", pipelineId: "p1", stages: [] });

  // moveToStage exists
  results.push(
    typeof ExecutionStateFactory.moveToStage === "function"
      ? pass(S, "moveToStage is a function")
      : fail(S, "moveToStage is a function", "not found")
  );

  // moveToStage returns frozen object
  const moved = ExecutionStateFactory.moveToStage(base, ExecutionStage.INTENT_RUNTIME);
  results.push(
    Object.isFrozen(moved)
      ? pass(S, "moveToStage returns frozen state")
      : fail(S, "moveToStage returns frozen state", "not frozen")
  );

  // moveToStage updates currentStage
  results.push(
    moved.currentStage === ExecutionStage.INTENT_RUNTIME
      ? pass(S, "moveToStage updates currentStage")
      : fail(S, "moveToStage updates currentStage", `got ${moved.currentStage}`)
  );

  // original state is unchanged (immutability)
  results.push(
    base.currentStage !== ExecutionStage.INTENT_RUNTIME
      ? pass(S, "original state unchanged after moveToStage")
      : fail(S, "original state unchanged after moveToStage", "original mutated")
  );

  // Works for every stage in the enum
  for (const stage of Object.values(ExecutionStage)) {
    const s = ExecutionStateFactory.moveToStage(base, stage);
    results.push(
      s.currentStage === stage
        ? pass(S, `moveToStage(${stage}) works`)
        : fail(S, `moveToStage(${stage}) works`, `got ${s.currentStage}`)
    );
  }

  return results;
}

// ── Suite 113 — SRP: ExecutionState has no pipeline-specific helpers ──────────

function suite113(): CertResult[] {
  const results: CertResult[] = [];
  const S = "113";

  // These helpers must NOT be exported from ExecutionState
  const forbidden = [
    "withUserInput","withIntent","withGoal","withPlan","withKernel",
    "withOrchestrator","withCapability","withConnectorRuntime","withConnector",
    "withResult","withMemory","withExplainability","withAudit",
  ];

  // We test via dynamic import simulation — check factory has no stage-specific methods
  const factoryKeys = Object.keys(ExecutionStateFactory);
  for (const fn of forbidden) {
    const present = factoryKeys.includes(fn);
    results.push(
      !present
        ? pass(S, `ExecutionStateFactory has no ${fn}()`)
        : fail(S, `ExecutionStateFactory has no ${fn}()`, "still present — SRP violated")
    );
  }

  // Factory only exposes the approved generic API
  const approved = ["create", "update", "addExplanation", "completeStage", "moveToStage"];
  for (const fn of approved) {
    results.push(
      factoryKeys.includes(fn)
        ? pass(S, `ExecutionStateFactory.${fn}() present`)
        : fail(S, `ExecutionStateFactory.${fn}() present`, "missing")
    );
  }

  return results;
}

// ── Suite 114 — Regression: existing factory API unchanged ───────────────────

function suite114(): CertResult[] {
  const results: CertResult[] = [];
  const S = "114";

  const state = ExecutionStateFactory.create({
    executionId: "ex1", goalId: "g1", pipelineId: "pp1", stages: ["A","B","C"],
  });

  results.push(Object.isFrozen(state)      ? pass(S, "create() returns frozen") : fail(S, "create() returns frozen", "not frozen"));
  results.push(state.executionId === "ex1" ? pass(S, "executionId set")         : fail(S, "executionId set", state.executionId));
  results.push(state.status === "running"  ? pass(S, "status=running")          : fail(S, "status=running", state.status));
  results.push(state.pendingStages.length === 3 ? pass(S, "pendingStages=3")    : fail(S, "pendingStages=3", String(state.pendingStages.length)));

  const updated = ExecutionStateFactory.update(state, { status: "completed" });
  results.push(Object.isFrozen(updated)         ? pass(S, "update() returns frozen")    : fail(S, "update() returns frozen", "not frozen"));
  results.push(updated.status === "completed"   ? pass(S, "update() changes status")    : fail(S, "update() changes status", updated.status));
  results.push(state.status === "running"       ? pass(S, "update() keeps original")    : fail(S, "update() keeps original", state.status));

  const expNode = { origin: "test", evidence: ["e"], reasoning: "r", confidence: 0.9, timestamp: new Date().toISOString() };
  const withExp = ExecutionStateFactory.addExplanation(state, expNode);
  results.push(withExp.explanations.length === 1 ? pass(S, "addExplanation() works")   : fail(S, "addExplanation() works", String(withExp.explanations.length)));

  return results;
}

// ── Suite 115 — createEmptyExecutionState returns distinct instances ──────────

function suite115(): CertResult[] {
  const results: CertResult[] = [];
  const S = "115";

  const a = createEmptyExecutionState();
  const b = createEmptyExecutionState();

  // Different object references
  results.push(
    a !== b
      ? pass(S, "two calls return different instances")
      : fail(S, "two calls return different instances", "same reference — shared state")
  );

  // Structurally equal
  results.push(
    a.executionId === b.executionId &&
    a.goalId      === b.goalId     &&
    a.pipelineId  === b.pipelineId &&
    a.status      === b.status
      ? pass(S, "instances are structurally equal")
      : fail(S, "instances are structurally equal", "fields differ")
  );

  // Both frozen
  results.push(Object.isFrozen(a) ? pass(S, "instance A is frozen") : fail(S, "instance A is frozen", "not frozen"));
  results.push(Object.isFrozen(b) ? pass(S, "instance B is frozen") : fail(S, "instance B is frozen", "not frozen"));

  // Factory function exported (not a constant)
  results.push(
    typeof createEmptyExecutionState === "function"
      ? pass(S, "createEmptyExecutionState is a function (not a constant)")
      : fail(S, "createEmptyExecutionState is a function (not a constant)", typeof createEmptyExecutionState)
  );

  return results;
}

// ── Suite 116 — Pipeline isolation: two concurrent states do not share refs ───

function suite116(): CertResult[] {
  const results: CertResult[] = [];
  const S = "116";

  // Simulate two simultaneous pipelines
  const stateA = ExecutionStateFactory.moveToStage(createEmptyExecutionState(), ExecutionStage.USER_INPUT);
  const stateB = ExecutionStateFactory.moveToStage(createEmptyExecutionState(), ExecutionStage.USER_INPUT);

  // Modify pipeline A
  const stateAModified = ExecutionStateFactory.moveToStage(stateA, ExecutionStage.KERNEL);

  // Pipeline B must remain at USER_INPUT
  results.push(
    stateB.currentStage === ExecutionStage.USER_INPUT
      ? pass(S, "pipeline B unaffected by pipeline A mutation")
      : fail(S, "pipeline B unaffected by pipeline A mutation", `got ${stateB.currentStage}`)
  );

  // Original stateA also unaffected (immutability)
  results.push(
    stateA.currentStage === ExecutionStage.USER_INPUT
      ? pass(S, "original stateA unaffected after moveToStage")
      : fail(S, "original stateA unaffected after moveToStage", `got ${stateA.currentStage}`)
  );

  // Modified A has correct stage
  results.push(
    stateAModified.currentStage === ExecutionStage.KERNEL
      ? pass(S, "stateAModified has KERNEL stage")
      : fail(S, "stateAModified has KERNEL stage", `got ${stateAModified.currentStage}`)
  );

  // A and B are different objects
  results.push(
    stateA !== stateB
      ? pass(S, "pipeline A and B are distinct state objects")
      : fail(S, "pipeline A and B are distinct state objects", "same reference")
  );

  return results;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export function runExecutionStateDecouplingCert(): { results: CertResult[]; passed: number; total: number; certified: boolean } {
  const results = [
    ...suite111(),
    ...suite112(),
    ...suite113(),
    ...suite114(),
    ...suite115(),
    ...suite116(),
  ];
  const passed = results.filter(r => r.passed).length;
  return { results, passed, total: results.length, certified: passed === results.length };
}