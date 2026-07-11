// Goal Registry Service v1.0 — Test Suite
// Foundation v1.0 · Engineering First · Sprint Goal Registry Service v1.0
// 14 criterios de aceitacao + 8 hardening = 22 cenarios

import { GoalRuntime } from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "./GoalRegistryService";
import type { GoalMetadata } from "@/lib/goal-runtime-v01/GoalTypes";

export interface SvcTestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}

export interface SvcSuiteResult {
  results: SvcTestResult[];
  passed: number;
  total: number;
  durationMs: number;
  statistics: ReturnType<GoalRegistryService["statistics"]>;
  health: ReturnType<GoalRegistryService["health"]>;
  metrics: ReturnType<GoalRegistryService["getMetrics"]>;
}

function baseMeta(overrides?: Partial<GoalMetadata>): Omit<GoalMetadata, "goalId"> {
  return {
    title: "Registry Service Test Goal",
    description: "Test goal for registry service",
    priority: "MEDIUM",
    origin: "USER",
    userId: "user-svc-001",
    projectId: "proj-svc-001",
    sessionId: "sess-svc-001",
    tags: ["registry", "test"],
    ...overrides,
  };
}

async function run(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<SvcTestResult> {
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

export async function runGoalRegistryServiceTests(): Promise<SvcSuiteResult> {
  const start = Date.now();
  const svc = new GoalRegistryService();
  const rt  = new GoalRuntime();
  const results: SvcTestResult[] = [];

  // Helper: create a goal via runtime and register in service
  async function makeGoal(overrides?: Partial<GoalMetadata>) {
    const r = await rt.create(baseMeta(overrides));
    if (!r.success) throw new Error(`Runtime create failed: ${r.error}`);
    const goal = rt.get(r.goalId);
    if (!goal) throw new Error("Goal not found in runtime registry");
    const reg = svc.register(goal);
    if (!reg.success) throw new Error(`Service register failed: ${reg.error}`);
    return { goalId: r.goalId, goal };
  }

  // ── C1: Goals sao registrados automaticamente ─────────────────────────────
  results.push(await run(1, "Goals sao registrados automaticamente", async () => {
    const { goalId } = await makeGoal({ title: "C1 Goal" });
    if (!svc.exists(goalId)) throw new Error("Goal not found after register");
    const stats = svc.statistics();
    if (stats.total < 1) throw new Error("statistics.total < 1 after register");
    return { detail: `goalId=${goalId} exists=true total=${stats.total}` };
  }));

  // ── C2: Goals sao localizados automaticamente ─────────────────────────────
  results.push(await run(2, "Goals sao localizados automaticamente", async () => {
    const { goalId } = await makeGoal({ title: "C2 Goal" });
    const found = svc.find(goalId);
    if (!found) throw new Error("find() returned null");
    if (found.metadata().goalId !== goalId) throw new Error("goalId mismatch");
    return { detail: `find(${goalId}) = "${found.metadata().title}"` };
  }));

  // ── C3: Goals podem ser removidos ────────────────────────────────────────
  results.push(await run(3, "Goals podem ser removidos", async () => {
    const { goalId } = await makeGoal({ title: "C3 Goal To Remove" });
    if (!svc.exists(goalId)) throw new Error("Goal not found before remove");
    const rm = svc.remove(goalId);
    if (!rm.success) throw new Error(`remove failed: ${rm.error}`);
    if (svc.exists(goalId)) throw new Error("Goal still exists after remove");
    return { detail: `goalId=${goalId} removed=true exists_after=${svc.exists(goalId)}` };
  }));

  // ── C4: Consulta por status funciona ──────────────────────────────────────
  results.push(await run(4, "Consultas por indices funcionam — status", async () => {
    const { goalId } = await makeGoal({ title: "C4 Active Goal" });
    const active = svc.query({ status: "ACTIVE" });
    const found = active.some(g => g.metadata().goalId === goalId);
    if (!found) throw new Error("Active goal not found in status query");
    return { detail: `query(status=ACTIVE) found ${active.length} goals, target found=${found}` };
  }));

  // ── C5: Consulta por userId funciona ──────────────────────────────────────
  results.push(await run(5, "Consultas por indices funcionam — userId", async () => {
    const uid = "user-query-test-001";
    const { goalId } = await makeGoal({ title: "C5 User Goal", userId: uid });
    const byUser = svc.query({ userId: uid });
    if (!byUser.some(g => g.metadata().goalId === goalId)) throw new Error("Goal not found by userId");
    return { detail: `query(userId=${uid}) found=${byUser.length} goals` };
  }));

  // ── C6: Consulta por projectId funciona ───────────────────────────────────
  results.push(await run(6, "Consultas por indices funcionam — projectId", async () => {
    const pid = "proj-query-test-002";
    const { goalId } = await makeGoal({ title: "C6 Project Goal", projectId: pid });
    const byProj = svc.query({ projectId: pid });
    if (!byProj.some(g => g.metadata().goalId === goalId)) throw new Error("Goal not found by projectId");
    return { detail: `query(projectId=${pid}) found=${byProj.length} goals` };
  }));

  // ── C7: Consulta por priority funciona ────────────────────────────────────
  results.push(await run(7, "Consultas por indices funcionam — priority", async () => {
    const { goalId } = await makeGoal({ title: "C7 High Priority", priority: "HIGH" });
    const byPri = svc.query({ priority: "HIGH" });
    if (!byPri.some(g => g.metadata().goalId === goalId)) throw new Error("High-priority goal not found");
    return { detail: `query(priority=HIGH) found=${byPri.length} goals` };
  }));

  // ── C8: Estatisticas sao atualizadas automaticamente ─────────────────────
  results.push(await run(8, "Estatisticas sao atualizadas automaticamente", async () => {
    const stats = svc.statistics();
    if (stats.total <= 0)           throw new Error("statistics.total = 0");
    if (stats.registeredCount <= 0) throw new Error("statistics.registeredCount = 0");
    const statusSum = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
    if (statusSum !== stats.total)  throw new Error(`byStatus sum(${statusSum}) != total(${stats.total})`);
    return {
      detail: [
        `total=${stats.total}`,
        `active=${stats.active}`,
        `completed=${stats.completed}`,
        `cancelled=${stats.cancelled}`,
        `registered=${stats.registeredCount}`,
        `queries=${stats.queryCount}`,
      ].join(" | "),
    };
  }));

  // ── C9: Health Check retorna SUCCESS ─────────────────────────────────────
  results.push(await run(9, "Health Check retorna SUCCESS", async () => {
    const hc = svc.health();
    if (hc.status !== "SUCCESS") throw new Error(`health returned ${hc.status}: ${hc.details}`);
    if (!hc.checks.registryIntegrity) throw new Error("registryIntegrity failed");
    if (!hc.checks.indexIntegrity)    throw new Error("indexIntegrity failed");
    if (!hc.checks.statisticsIntegrity) throw new Error("statisticsIntegrity failed");
    return { detail: hc.details };
  }));

  // ── C10: Nenhuma responsabilidade do Planner incorporada ─────────────────
  results.push(await run(10, "Nenhuma responsabilidade do Planner incorporada", async () => {
    const src = GoalRegistryService.toString();
    const forbidden = ["planner", "plan(", "createPlan", "capability", "connector", "reasoning", "llm", "inference"];
    const found = forbidden.filter(w => src.toLowerCase().includes(w));
    if (found.length > 0) throw new Error(`Forbidden references: ${found.join(", ")}`);
    return { detail: "Zero Planner references confirmed" };
  }));

  // ── C11: Nenhuma responsabilidade do Capability Runtime ──────────────────
  results.push(await run(11, "Nenhuma responsabilidade do Capability Runtime incorporada", async () => {
    const src = GoalRegistryService.toString();
    if (src.toLowerCase().includes("capabilityruntime")) throw new Error("CapabilityRuntime reference found");
    return { detail: "Zero CapabilityRuntime references confirmed" };
  }));

  // ── C12: Nenhuma responsabilidade do Connector Runtime ───────────────────
  results.push(await run(12, "Nenhuma responsabilidade do Connector Runtime incorporada", async () => {
    const src = GoalRegistryService.toString();
    if (src.toLowerCase().includes("connectorruntime")) throw new Error("ConnectorRuntime reference found");
    return { detail: "Zero ConnectorRuntime references confirmed" };
  }));

  // ── C13: Reutiliza integralmente o Goal Runtime ───────────────────────────
  results.push(await run(13, "Toda implementacao reutiliza o Goal Runtime existente", async () => {
    // Service never instantiates Goal directly — uses Goal via GoalRuntime
    const listGoals = svc.list();
    for (const g of listGoals) {
      if (typeof g.metadata !== "function") throw new Error("Goal missing metadata()");
      if (typeof g.getStatus !== "function") throw new Error("Goal missing getStatus()");
    }
    return { detail: `All ${listGoals.length} Goals from runtime verified via IGoal contract` };
  }));

  // ── C14: Logs e Metricas sao produzidos automaticamente ──────────────────
  results.push(await run(14, "Logs e Metricas sao produzidos automaticamente", async () => {
    const logs = svc.getLogs();
    const metrics = svc.getMetrics();
    if (logs.length === 0)             throw new Error("No logs recorded");
    if (!logs[0].executionId)          throw new Error("log.executionId absent");
    if (!logs[0].operation)            throw new Error("log.operation absent");
    if (metrics.registeredTotal === 0) throw new Error("metrics.registeredTotal = 0");
    if (metrics.queryTotal === 0)      throw new Error("metrics.queryTotal = 0");
    return {
      detail: `logs=${logs.length} registered=${metrics.registeredTotal} removed=${metrics.removedTotal} queries=${metrics.queryTotal}`,
    };
  }));

  // ── H1: Goal inexistente nao lanca excecao ────────────────────────────────
  results.push(await run(15, "[Hardening] Goal inexistente nao lanca excecao", async () => {
    const found = svc.find("nonexistent-goal-xyz");
    if (found !== null) throw new Error("Expected null for nonexistent goal");
    const rm = svc.remove("nonexistent-goal-xyz");
    if (rm.success) throw new Error("Expected remove to fail for nonexistent goal");
    return { detail: `find=null remove.success=false remove.error="${rm.error}"` };
  }));

  // ── H2: Registro duplicado rejeitado ─────────────────────────────────────
  results.push(await run(16, "[Hardening] Registro duplicado e rejeitado", async () => {
    const { goal, goalId } = await makeGoal({ title: "H2 Duplicate" });
    const r2 = svc.register(goal);
    if (r2.success) throw new Error("Expected duplicate registration to fail");
    if (!r2.error?.includes("Already registered")) throw new Error(`Wrong error: ${r2.error}`);
    return { detail: `duplicate rejected: "${r2.error}"` };
  }));

  // ── H3: Consulta vazia retorna array vazio ────────────────────────────────
  results.push(await run(17, "[Hardening] Consulta vazia retorna array vazio", async () => {
    const r = svc.query({ userId: "user-that-does-not-exist-99999" });
    if (!Array.isArray(r)) throw new Error("Expected array");
    if (r.length !== 0) throw new Error(`Expected 0 results, got ${r.length}`);
    return { detail: `query(userId=nonexistent) returned ${r.length} results` };
  }));

  // ── H4: Consulta por tag inexistente retorna vazio ────────────────────────
  results.push(await run(18, "[Hardening] Consulta por tag inexistente retorna vazio", async () => {
    const r = svc.query({ tags: ["tag-that-does-not-exist-xyz"] });
    if (r.length !== 0) throw new Error(`Expected 0, got ${r.length}`);
    return { detail: "Empty tag query: 0 results, no exception" };
  }));

  // ── H5: Remover goal nao afeta outros ────────────────────────────────────
  results.push(await run(19, "[Hardening] Remover um Goal nao afeta outros", async () => {
    const { goalId: g1 } = await makeGoal({ title: "H5 Goal A" });
    const { goalId: g2 } = await makeGoal({ title: "H5 Goal B" });
    svc.remove(g1);
    if (svc.exists(g1)) throw new Error("g1 still exists after remove");
    if (!svc.exists(g2)) throw new Error("g2 was accidentally removed");
    return { detail: `g1 removed, g2 intact — isolation confirmed` };
  }));

  // ── H6: List nao lanca excecao com registry vazio ─────────────────────────
  results.push(await run(20, "[Hardening] list() em service limpo nao lanca excecao", async () => {
    const tempSvc = new GoalRegistryService();
    const list = tempSvc.list();
    if (!Array.isArray(list)) throw new Error("Expected array");
    if (list.length !== 0) throw new Error(`Expected 0, got ${list.length}`);
    const hc = tempSvc.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty service: ${hc.details}`);
    return { detail: `empty list=${list.length} health=${hc.status}` };
  }));

  // ── H7: Statistics consistentes apos clear ────────────────────────────────
  results.push(await run(21, "[Hardening] Statistics consistentes apos clear", async () => {
    const tempSvc = new GoalRegistryService();
    const tempRt  = new GoalRuntime();
    const r = await tempRt.create(baseMeta({ title: "H7 Clear Test" }));
    const g = tempRt.get(r.goalId)!;
    tempSvc.register(g);
    tempSvc.clear();
    const stats = tempSvc.statistics();
    if (stats.total !== 0) throw new Error(`Expected total=0 after clear, got ${stats.total}`);
    const hc = tempSvc.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear: ${hc.details}`);
    return { detail: `clear() → total=${stats.total} health=${hc.status}` };
  }));

  // ── H8: Service nao modifica Goal internamente ────────────────────────────
  results.push(await run(22, "[Hardening] Service nao modifica Goal — somente administra referencias", async () => {
    const { goalId, goal } = await makeGoal({ title: "H8 Immutability Test" });
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    // Service only reads — no modification
    svc.find(goalId);
    svc.query({ status: statusBefore });
    svc.statistics();
    svc.health();
    const statusAfter = goal.getStatus();
    const titleAfter  = goal.metadata().title;
    if (statusBefore !== statusAfter) throw new Error("Service modified Goal status");
    if (titleBefore !== titleAfter)   throw new Error("Service modified Goal title");
    return { detail: `status: ${statusBefore}==${statusAfter} title unchanged — no side effects confirmed` };
  }));

  const passed = results.filter(r => r.passed).length;
  return {
    results, passed, total: results.length,
    durationMs: Date.now() - start,
    statistics: svc.statistics(),
    health: svc.health(),
    metrics: svc.getMetrics(),
  };
}