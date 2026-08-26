/**
 * unifiedStepIntelligenceTests.ts — EF Unified Step Intelligence
 *
 * Prova que o enriquecimento de ExecutionIntelligence roda EXATAMENTE UMA vez
 * por ExecutionStep, tanto single-step quanto multi-step, sem double-enrichment.
 *
 * Deterministico: sem rede, sem OAuth, sem DB. Investigator registry vazio
 * => enrichExecutionRequest e pass-through (params copiados, gaps=[], risks=[]).
 *
 * Cobre:
 *   A. single-step: EI enrichment roda UMA vez (prepareCount).
 *   B. multi-step: cada step passa por enrichment (nova ref, params preservados).
 *   C. single-step: Dispatcher detecta origin="execution-intelligence" e NAO re-enriquece.
 *   D. multi-step independente: duas steps da mesma wave executam em paralelo.
 *   E. enrichment nao altera id/connector/capability/dependsOn.
 *   F. needs_confirmation single-step continua funcionando (SafetyGate inalterado).
 *
 * multi-step safety remains an existing gap; this sprint only unifies EI enrichment.
 */

import { ExecutionIntelligence, enrichExecutionRequest } from "./ExecutionIntelligence";
import { ExecutionDispatcher } from "@/lib/runtime-engine/ExecutionDispatcher";
import { SafetyGate } from "./SafetyGate";
import type { ExecutionRequest, PreparedExecution } from "./ExecutionTypes";
import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  CapabilityExecutorInput,
  CapabilityExecutorOutput,
  ConnectorExecutionContext,
  ICapabilityExecutor,
  StepStatus,
} from "@/lib/runtime-engine/RuntimeTypes";

interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function ctx(origin: string): ConnectorExecutionContext {
  return { userId: "u", workspaceId: "ws", sessionId: "s", origin };
}

function step(id: string, extra?: Partial<ExecutionStep>): ExecutionStep {
  return Object.freeze({
    id,
    connector: "gmail",
    capability: "sendEmail",
    parameters: Object.freeze({ to: "a@b.com", subject: "hi" }),
    ...extra,
  });
}

class MockExecutor implements ICapabilityExecutor {
  captured: ExecutionStep[] = [];
  async execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    this.captured.push(input.step);
    return Object.freeze({
      status: "completed" as StepStatus,
      output: { ok: true },
      error: null,
    });
  }
}

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true, error: null };
  } catch (error) {
    return { name, passed: false, error: (error as Error).message };
  }
}

export async function runUnifiedStepIntelligenceTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // A. single-step: EI enrichment roda UMA vez.
  results.push(await run("A — single-step EI enrichment runs once", async () => {
    const ei = new ExecutionIntelligence();
    const req: ExecutionRequest = {
      connectorId: "gmail",
      capability: "sendEmail",
      params: { to: "a@b.com" },
      context: ctx("execution-intelligence"),
    };
    const prepared: PreparedExecution = await ei.prepare(req);
    assert(ei.stats().prepareCount === 1, "prepareCount must be 1");
    assert(prepared.enrichedParams.to === "a@b.com", "enrichedParams must preserve params");
    assert(prepared.gaps.length === 0, "gaps empty on pass-through");
    assert(prepared.risks.length === 0, "risks empty on pass-through");
    // enrichedParams deve ser um novo objeto (copia), nao a mesma ref de request.params.
    assert(prepared.enrichedParams !== req.params, "enrichedParams must be a copy, not same ref");
  }));

  // B. multi-step: cada step passa por enrichment (nova ref, params preservados).
  results.push(await run("B — multi-step each step enriched", async () => {
    const exec = new MockExecutor();
    const dispatcher = new ExecutionDispatcher(exec);
    const s = step("s1", { dependsOn: [] });
    await dispatcher.dispatch({
      executionId: "e1",
      step: s,
      stepTimeoutMs: 5000,
      connectorCtx: ctx("pipeline"),
    });
    assert(exec.captured.length === 1, "executor captured exactly one step");
    const captured = exec.captured[0];
    assert(captured !== s, "enriched step must be a NEW reference (enrichment ran)");
    assert(captured.id === s.id, "id preserved");
    assert(captured.connector === s.connector, "connector preserved");
    assert(captured.capability === s.capability, "capability preserved");
    assert(captured.parameters.to === "a@b.com", "param values preserved after pass-through enrichment");
  }));

  // C. single-step: Dispatcher detecta origin="execution-intelligence" e NAO re-enriquece.
  results.push(await run("C — single-step origin bypass (no double enrichment)", async () => {
    const exec = new MockExecutor();
    const dispatcher = new ExecutionDispatcher(exec);
    const s = step("s-single");
    await dispatcher.dispatch({
      executionId: "e2",
      step: s,
      stepTimeoutMs: 5000,
      connectorCtx: ctx("execution-intelligence"),
    });
    assert(exec.captured.length === 1, "executor captured exactly one step");
    // Bypass retorna o MESMO objeto step (sem re-enriquecer).
    assert(exec.captured[0] === s, "bypass must forward the SAME step reference (no double enrichment)");
  }));

  // D. multi-step independente: duas steps da mesma wave executam em paralelo.
  results.push(await run("D — parallel multi-step steps both complete", async () => {
    const exec = new MockExecutor();
    const dispatcher = new ExecutionDispatcher(exec);
    const s1 = step("w1", { dependsOn: [] });
    const s2 = step("w2", { dependsOn: [] });
    const [r1, r2] = await Promise.all([
      dispatcher.dispatch({ executionId: "e3", step: s1, stepTimeoutMs: 5000, connectorCtx: ctx("pipeline") }),
      dispatcher.dispatch({ executionId: "e3", step: s2, stepTimeoutMs: 5000, connectorCtx: ctx("pipeline") }),
    ]);
    assert(r1.status === "completed" && r2.status === "completed", "both parallel steps completed");
    assert(exec.captured.length === 2, "executor captured both steps");
    assert(exec.captured[0].id === "w1" && exec.captured[1].id === "w2", "both step ids captured");
  }));

  // E. enrichment nao altera id/connector/capability/dependsOn.
  results.push(await run("E — enrichment preserves step identity fields", async () => {
    const exec = new MockExecutor();
    const dispatcher = new ExecutionDispatcher(exec);
    const s = step("eid", { dependsOn: ["other"], connector: "drive", capability: "listFiles" });
    await dispatcher.dispatch({
      executionId: "e4",
      step: s,
      stepTimeoutMs: 5000,
      connectorCtx: ctx("pipeline"),
    });
    const captured = exec.captured[0];
    assert(captured.id === "eid", "id preserved");
    assert(captured.connector === "drive", "connector preserved");
    assert(captured.capability === "listFiles", "capability preserved");
    assert(Array.isArray(captured.dependsOn) && captured.dependsOn[0] === "other", "dependsOn preserved");
  }));

  // F. needs_confirmation single-step continua funcionando (SafetyGate inalterado).
  results.push(await run("F — SafetyGate needs_confirmation unchanged", async () => {
    const gate = new SafetyGate();
    const req: ExecutionRequest = {
      connectorId: "gmail",
      capability: "sendEmail",
      params: { to: "a@b.com", subject: "x", body: "y" },
      context: ctx("execution-intelligence"),
      // confirmedByUser ausente propositalmente.
    };
    const prepared: PreparedExecution = {
      request: req,
      enrichedParams: { ...req.params },
      gaps: [],
      risks: [],
    };
    const decision = gate.guard(prepared, "irreversible");
    assert(decision.type === "needs_confirmation", "irreversible without confirmation must needs_confirmation");

    // Com confirmedByUser=true -> approved (confirmation flow respeitado).
    const approved = gate.guard({ ...prepared, request: { ...req, confirmedByUser: true } }, "irreversible");
    assert(approved.type === "approved", "irreversible with confirmedByUser must be approved");

    // safe/reversible -> approved sem confirmacao.
    assert(gate.guard(prepared, "safe").type === "approved", "safe must be approved");
    assert(gate.guard(prepared, "reversible").type === "approved", "reversible must be approved");
  }));

  // Extra: helper exportado e utilizavel isoladamente (consistencia de contrato).
  results.push(await run("G — enrichExecutionRequest helper is reusable", async () => {
    const req: ExecutionRequest = {
      connectorId: "drive",
      capability: "listFiles",
      params: { folderId: "root" },
      context: ctx("pipeline"),
    };
    const out = await enrichExecutionRequest(req);
    assert(typeof out.enrichedParams === "object", "enrichedParams is object");
    assert(out.enrichedParams.folderId === "root", "params preserved");
    assert(Array.isArray(out.gaps) && Array.isArray(out.risks), "gaps/risks are arrays");
  }));

  return results;
}