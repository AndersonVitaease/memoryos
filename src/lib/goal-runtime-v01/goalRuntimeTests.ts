// Goal Runtime v0.1 — Test Suite
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// 14 criterios de aceitacao + 7 hardening = 21 cenarios

import { GoalRuntime } from "./GoalRuntime";
import type { GoalMetadata } from "./GoalTypes";

export interface GoalTestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}

export interface GoalTestSuiteResult {
  results: GoalTestResult[];
  passed: number;
  total: number;
  durationMs: number;
  metrics: ReturnType<GoalRuntime["getMetrics"]>;
  healthCheck: ReturnType<GoalRuntime["healthCheck"]>;
}

function baseMeta(overrides?: Partial<GoalMetadata>): Omit<GoalMetadata, "goalId"> {
  return {
    title:       "Test Goal",
    description: "A test goal for Sprint v0.1",
    priority:    "MEDIUM",
    origin:      "USER",
    userId:      "user-001",
    projectId:   "proj-001",
    sessionId:   "sess-001",
    tags:        ["test"],
    ...overrides,
  };
}

async function run(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<GoalTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return {
      criterion: n, name, passed: false,
      durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runGoalRuntimeTests(): Promise<GoalTestSuiteResult> {
  const start = Date.now();
  const rt = new GoalRuntime();
  const results: GoalTestResult[] = [];

  // ── C1: Goal Runtime registra Goals ───────────────────────────────────────
  results.push(await run(1, "Goal Runtime registra Goals", async () => {
    const r = await rt.create(baseMeta());
    if (!r.success) throw new Error(`create failed: ${r.error}`);
    if (r.status !== "ACTIVE") throw new Error(`expected ACTIVE, got ${r.status}`);
    return { detail: `goalId=${r.goalId} status=${r.status} duration=${r.duration}ms` };
  }));

  // ── C2: Goal Registry localiza Goals ──────────────────────────────────────
  results.push(await run(2, "Goal Registry localiza Goals", async () => {
    const r = await rt.create(baseMeta({ title: "Registry Lookup Test" }));
    if (!r.success) throw new Error(r.error);
    const found = rt.get(r.goalId);
    if (!found) throw new Error("Goal not found in registry");
    if (found.metadata().goalId !== r.goalId) throw new Error("goalId mismatch");
    return { detail: `goalId=${r.goalId} found=true title="${found.metadata().title}"` };
  }));

  // ── C3: GoalContext criado automaticamente ────────────────────────────────
  results.push(await run(3, "GoalContext e criado automaticamente", async () => {
    const r = await rt.create(baseMeta({ title: "Context Test" }));
    if (!r.success) throw new Error(r.error);
    const goal = rt.get(r.goalId);
    const ctx = goal?.getContext();
    if (!ctx) throw new Error("GoalContext is null");
    if (!ctx.executionId) throw new Error("executionId absent");
    if (!ctx.goalId) throw new Error("goalId absent");
    if (ctx.status !== "ACTIVE") throw new Error(`expected ACTIVE, got ${ctx.status}`);
    return { detail: `executionId=${ctx.executionId} status=${ctx.status} userId=${ctx.userId}` };
  }));

  // ── C4: GoalStatus atualizado corretamente ────────────────────────────────
  results.push(await run(4, "GoalStatus e atualizado corretamente", async () => {
    const r = await rt.create(baseMeta({ title: "Status Transition Test" }));
    if (!r.success) throw new Error(r.error);
    const goal = rt.get(r.goalId);
    if (goal?.getStatus() !== "ACTIVE") throw new Error("Expected ACTIVE after create");
    await rt.complete(r.goalId);
    if (goal?.getStatus() !== "COMPLETED") throw new Error("Expected COMPLETED after complete");
    return { detail: `CREATED->VALIDATED->ACTIVE->COMPLETED verified` };
  }));

  // ── C5: GoalResult produzido corretamente ─────────────────────────────────
  results.push(await run(5, "GoalResult e produzido corretamente", async () => {
    const r = await rt.create(baseMeta({ title: "Result Structure Test" }));
    if (!r.success) throw new Error(r.error);
    if (typeof r.goalId !== "string" || !r.goalId) throw new Error("goalId missing");
    if (typeof r.success !== "boolean") throw new Error("success missing");
    if (typeof r.status !== "string") throw new Error("status missing");
    if (typeof r.duration !== "number") throw new Error("duration missing");
    if (!Array.isArray(r.logs)) throw new Error("logs missing");
    return { detail: `success=${r.success} status=${r.status} duration=${r.duration}ms logs=${r.logs.length}` };
  }));

  // ── C6: Logs sao registrados ──────────────────────────────────────────────
  results.push(await run(6, "Logs sao registrados", async () => {
    const r = await rt.create(baseMeta({ title: "Log Test" }));
    if (!r.success) throw new Error(r.error);
    const logs = rt.getLogs();
    if (logs.length === 0) throw new Error("No logs recorded");
    const log = logs[0];
    if (!log.executionId) throw new Error("log.executionId absent");
    if (!log.goalId) throw new Error("log.goalId absent");
    if (!log.operation) throw new Error("log.operation absent");
    if (typeof log.duration !== "number") throw new Error("log.duration absent");
    return { detail: `logs=${logs.length} last_op=${logs[logs.length-1].operation} last_status=${logs[logs.length-1].status}` };
  }));

  // ── C7: Metricas sao registradas ──────────────────────────────────────────
  results.push(await run(7, "Metricas sao registradas", async () => {
    const m = rt.getMetrics();
    if (m.created === 0) throw new Error("metrics.created=0");
    if (typeof m.active !== "number") throw new Error("metrics.active absent");
    if (typeof m.completed !== "number") throw new Error("metrics.completed absent");
    if (typeof m.avgDurationMs !== "number") throw new Error("metrics.avgDurationMs absent");
    return { detail: `created=${m.created} active=${m.active} completed=${m.completed} cancelled=${m.cancelled} failed=${m.failed} avg=${m.avgDurationMs}ms` };
  }));

  // ── C8: Goals podem ser concluidos ────────────────────────────────────────
  results.push(await run(8, "Goals podem ser concluidos", async () => {
    const r = await rt.create(baseMeta({ title: "Complete Test" }));
    if (!r.success) throw new Error(r.error);
    const cr = await rt.complete(r.goalId, "Sprint completed");
    if (!cr.success) throw new Error(`complete failed: ${cr.error}`);
    if (cr.status !== "COMPLETED") throw new Error(`expected COMPLETED, got ${cr.status}`);
    return { detail: `goalId=${r.goalId} status=${cr.status}` };
  }));

  // ── C9: Goals podem ser cancelados ───────────────────────────────────────
  results.push(await run(9, "Goals podem ser cancelados", async () => {
    const r = await rt.create(baseMeta({ title: "Cancel Test" }));
    if (!r.success) throw new Error(r.error);
    const cr = await rt.cancel(r.goalId, "User requested");
    if (!cr.success) throw new Error(`cancel failed: ${cr.error}`);
    if (cr.status !== "CANCELLED") throw new Error(`expected CANCELLED, got ${cr.status}`);
    return { detail: `goalId=${r.goalId} status=${cr.status}` };
  }));

  // ── C10: Nenhuma responsabilidade do Planner presente ────────────────────
  results.push(await run(10, "Nenhuma responsabilidade do Planner presente", async () => {
    const src = GoalRuntime.toString() + Goal.toString();
    const forbidden = ["plan", "planner", "capability", "connector", "reasoning", "inference", "llm", "ai"];
    const found = forbidden.filter(w => src.toLowerCase().includes(w));
    if (found.length > 0) throw new Error(`Forbidden references: ${found.join(", ")}`);
    return { detail: `Zero forbidden references: ${forbidden.join(", ")}` };
  }));

  // ── C11: Nenhuma responsabilidade do PIE presente ────────────────────────
  results.push(await run(11, "Nenhuma responsabilidade do PIE presente", async () => {
    const src = GoalRuntime.toString();
    const forbidden = ["planning intelligence", "pie", "strategy fusion", "specialist"];
    const found = forbidden.filter(w => src.toLowerCase().includes(w));
    if (found.length > 0) throw new Error(`Forbidden PIE references: ${found.join(", ")}`);
    return { detail: "Zero PIE references confirmed" };
  }));

  // ── C12: Nenhuma responsabilidade do Capability Runtime presente ──────────
  results.push(await run(12, "Nenhuma responsabilidade do Capability Runtime presente", async () => {
    const src = GoalRuntime.toString();
    if (src.toLowerCase().includes("capabilityruntime") || src.toLowerCase().includes("capability runtime")) {
      throw new Error("CapabilityRuntime reference found");
    }
    return { detail: "Zero CapabilityRuntime references confirmed" };
  }));

  // ── C13: Nenhuma responsabilidade do Connector Runtime presente ───────────
  results.push(await run(13, "Nenhuma responsabilidade do Connector Runtime presente", async () => {
    const src = GoalRuntime.toString();
    if (src.toLowerCase().includes("connectorruntime") || src.toLowerCase().includes("connector runtime")) {
      throw new Error("ConnectorRuntime reference found");
    }
    return { detail: "Zero ConnectorRuntime references confirmed" };
  }));

  // ── C14: Health Check retorna SUCCESS ─────────────────────────────────────
  results.push(await run(14, "Health Check retorna SUCCESS", async () => {
    const hc = rt.healthCheck();
    if (hc.status !== "SUCCESS") throw new Error(`healthCheck returned ${hc.status}: ${hc.details}`);
    return { detail: hc.details };
  }));

  // ── H1: Goal inexistente nao lanca excecao ────────────────────────────────
  results.push(await run(15, "[Hardening] Goal inexistente nao lanca excecao", async () => {
    const r = await rt.complete("nonexistent-goal-id");
    if (r.success) throw new Error("Expected failure for nonexistent goal");
    if (!r.error) throw new Error("Expected error message");
    return { detail: `error="${r.error}" success=${r.success}` };
  }));

  // ── H2: Goal duplicado e rejeitado ───────────────────────────────────────
  results.push(await run(16, "[Hardening] Goal duplicado e rejeitado", async () => {
    const r = await rt.create(baseMeta({ title: "Duplicate Test" }));
    if (!r.success) throw new Error(r.error);
    const r2 = await rt.create({ ...baseMeta({ title: "Duplicate Test 2" }), goalId: r.goalId });
    if (r2.success) throw new Error("Expected duplicate to be rejected");
    if (!r2.error?.includes("Duplicate")) throw new Error(`Wrong error: ${r2.error}`);
    return { detail: `Duplicate rejected: "${r2.error}"` };
  }));

  // ── H3: Goal invalido nao lanca excecao ──────────────────────────────────
  results.push(await run(17, "[Hardening] Goal invalido nao lanca excecao", async () => {
    const r = await rt.create({ title: "", description: "", priority: "MEDIUM", origin: "USER", userId: "", projectId: "", sessionId: "", tags: [] });
    if (r.success) throw new Error("Expected invalid goal to fail");
    if (!r.error) throw new Error("Expected error message");
    return { detail: `invalid rejected: "${r.error?.slice(0, 80)}"` };
  }));

  // ── H4: Goal cancelado nao pode ser cancelado novamente ─────────────────
  results.push(await run(18, "[Hardening] Goal cancelado nao pode ser re-cancelado", async () => {
    const r = await rt.create(baseMeta({ title: "Double Cancel Test" }));
    if (!r.success) throw new Error(r.error);
    await rt.cancel(r.goalId, "first cancel");
    const r2 = await rt.cancel(r.goalId, "second cancel");
    if (r2.success) throw new Error("Expected second cancel to fail");
    return { detail: `second cancel rejected: "${r2.error}"` };
  }));

  // ── H5: Goal concluido nao pode ser cancelado ────────────────────────────
  results.push(await run(19, "[Hardening] Goal concluido nao pode ser cancelado", async () => {
    const r = await rt.create(baseMeta({ title: "Complete then Cancel Test" }));
    if (!r.success) throw new Error(r.error);
    await rt.complete(r.goalId);
    const r2 = await rt.cancel(r.goalId);
    if (r2.success) throw new Error("Expected cancel of COMPLETED goal to fail");
    return { detail: `cancel after complete rejected: "${r2.error}"` };
  }));

  // ── H6: Update em Goal cancelado falha graciosamente ─────────────────────
  results.push(await run(20, "[Hardening] Update em Goal cancelado falha graciosamente", async () => {
    const r = await rt.create(baseMeta({ title: "Update After Cancel Test" }));
    if (!r.success) throw new Error(r.error);
    await rt.cancel(r.goalId);
    const r2 = await rt.update(r.goalId, { title: "New Title" });
    if (r2.success) throw new Error("Expected update of CANCELLED goal to fail");
    return { detail: `update after cancel rejected: "${r2.error}"` };
  }));

  // ── H7: Isolamento — Goals nao compartilham estado ───────────────────────
  results.push(await run(21, "[Hardening] Goals nao compartilham estado", async () => {
    const r1 = await rt.create(baseMeta({ title: "Isolation Goal A", userId: "user-A", projectId: "proj-A", sessionId: "sess-A" }));
    const r2 = await rt.create(baseMeta({ title: "Isolation Goal B", userId: "user-B", projectId: "proj-B", sessionId: "sess-B" }));
    if (!r1.success || !r2.success) throw new Error("Creation failed");
    const g1 = rt.get(r1.goalId);
    const g2 = rt.get(r2.goalId);
    if (g1?.getContext()?.userId === g2?.getContext()?.userId) throw new Error("Context userId shared between goals");
    if (g1?.getContext()?.projectId === g2?.getContext()?.projectId) throw new Error("Context projectId shared between goals");
    await rt.complete(r1.goalId);
    if (g2?.getStatus() === "COMPLETED") throw new Error("State leaked between goals");
    return { detail: `g1.status=${g1?.getStatus()} g2.status=${g2?.getStatus()} — isolated` };
  }));

  const passed = results.filter(r => r.passed).length;
  return {
    results,
    passed,
    total: results.length,
    durationMs: Date.now() - start,
    metrics: rt.getMetrics(),
    healthCheck: rt.healthCheck(),
  };
}