// Execution Dispatcher v1.0 — Test Suite
// Foundation v1.0 · Engineering First · Sprint Execution Dispatcher v1.0
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime } from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import { ExecutionDispatcher } from "./ExecutionDispatcher";
import type { GoalMetadata } from "@/lib/goal-runtime-v01/GoalTypes";

export interface DispTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface DispSuiteResult {
  results:    DispTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<ExecutionDispatcher["statistics"]>;
  health:     ReturnType<ExecutionDispatcher["health"]>;
  metrics:    ReturnType<ExecutionDispatcher["getMetrics"]>;
}

function baseMeta(overrides?: Partial<GoalMetadata>): Omit<GoalMetadata, "goalId"> {
  return {
    title: "Dispatcher Test Goal", description: "test",
    priority: "MEDIUM", origin: "USER",
    userId: "user-d-001", projectId: "proj-d-001", sessionId: "sess-d-001",
    tags: ["dispatcher", "test"],
    ...overrides,
  };
}

async function run(
  n: number, name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<DispTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runExecutionDispatcherTests(): Promise<DispSuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const sch    = new GoalScheduler(svc);
  const queue  = new GoalExecutionQueue(svc, sch);
  const disp   = new ExecutionDispatcher(svc, sch, queue);
  const results: DispTestResult[] = [];
  const future = Date.now() + 60_000;

  // Helper: full-stack goal creation
  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create(baseMeta(overrides));
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    const reg  = svc.register(goal);
    if (!reg.success) throw new Error(`Service: ${reg.error}`);
    sch.schedule(r.goalId, future, goal.metadata().priority);
    return r.goalId;
  }

  // ── C1: Goal pode ser despachado ─────────────────────────────────────────
  results.push(await run(1, "Goal pode ser despachado", async () => {
    const goalId = await makeGoal({ title: "C1 Dispatch" });
    const r = disp.dispatch(goalId);
    if (!r.success)    throw new Error(r.error);
    if (!r.dispatchId) throw new Error("dispatchId absent");
    if (!r.queueId)    throw new Error("queueId absent");
    if (!disp.exists(r.dispatchId)) throw new Error("Entry not found after dispatch");
    return { detail: `goalId=${goalId} dispatchId=${r.dispatchId} queueId=${r.queueId}` };
  }));

  // ── C2: Dispatch em lote funciona ────────────────────────────────────────
  results.push(await run(2, "Dispatch em lote funciona — dispatchReadyGoals()", async () => {
    // Create 2 new goals with fresh scheduler
    const rt2   = new GoalRuntime();
    const svc2  = new GoalRegistryService();
    const sch2  = new GoalScheduler(svc2);
    const q2    = new GoalExecutionQueue(svc2, sch2);
    const disp2 = new ExecutionDispatcher(svc2, sch2, q2);
    const g1 = await rt2.create(baseMeta({ title: "Batch A" }));
    const g2 = await rt2.create(baseMeta({ title: "Batch B" }));
    svc2.register(rt2.get(g1.goalId)!);
    svc2.register(rt2.get(g2.goalId)!);
    sch2.schedule(g1.goalId, future, "MEDIUM");
    sch2.schedule(g2.goalId, future, "HIGH");
    const batch = disp2.dispatchReadyGoals();
    if (batch.dispatched < 2) throw new Error(`Expected >=2 dispatched, got ${batch.dispatched}`);
    return { detail: `dispatched=${batch.dispatched} failed=${batch.failed} total=${batch.results.length}` };
  }));

  // ── C3: Cancelamento funciona ────────────────────────────────────────────
  results.push(await run(3, "Cancelamento de dispatch funciona", async () => {
    const goalId = await makeGoal({ title: "C3 Cancel Dispatch" });
    const r = disp.dispatch(goalId);
    if (!r.success) throw new Error(r.error);
    const cr = disp.cancelDispatch(r.dispatchId!);
    if (!cr.success) throw new Error(`cancel failed: ${cr.error}`);
    const entry = disp.list().find(e => e.dispatchId === r.dispatchId);
    if (entry?.status !== "CANCELLED") throw new Error(`Expected CANCELLED, got ${entry?.status}`);
    return { detail: `dispatchId=${r.dispatchId} status=CANCELLED` };
  }));

  // ── C4: Integracao com Scheduler ─────────────────────────────────────────
  results.push(await run(4, "Integracao com Goal Scheduler funciona", async () => {
    const schStats = sch.statistics();
    if (schStats.scheduled === 0) throw new Error("Scheduler has no schedules");
    // Dispatcher reads from scheduler list
    const schedules = sch.list();
    if (!Array.isArray(schedules)) throw new Error("scheduler.list() failed");
    return { detail: `Scheduler: scheduled=${schStats.scheduled} queue=${schStats.queueSize} list=${schedules.length}` };
  }));

  // ── C5: Integracao com Queue ──────────────────────────────────────────────
  results.push(await run(5, "Integracao com Goal Execution Queue funciona", async () => {
    const qStats = queue.statistics();
    if (qStats.enqueued === 0) throw new Error("Queue has no enqueued entries");
    const qList  = queue.list();
    if (!Array.isArray(qList)) throw new Error("queue.list() failed");
    return { detail: `Queue: enqueued=${qStats.enqueued} processed=${qStats.processed} queue=${qStats.queueSize}` };
  }));

  // ── C6: Logs sao produzidos ───────────────────────────────────────────────
  results.push(await run(6, "Logs sao produzidos automaticamente", async () => {
    const logs = disp.getLogs();
    if (logs.length === 0)    throw new Error("No logs");
    if (!logs[0].executionId) throw new Error("executionId absent");
    if (!logs[0].dispatchId)  throw new Error("dispatchId absent");
    if (!logs[0].goalId)      throw new Error("goalId absent");
    if (!logs[0].operation)   throw new Error("operation absent");
    return { detail: `logs=${logs.length} last_op=${logs[logs.length-1].operation} last_status=${logs[logs.length-1].status}` };
  }));

  // ── C7: Metricas sao produzidas ──────────────────────────────────────────
  results.push(await run(7, "Metricas sao produzidas automaticamente", async () => {
    const m = disp.getMetrics();
    if (m.dispatchTotal === 0)   throw new Error("dispatchTotal = 0");
    if (typeof m.avgDurationMs !== "number") throw new Error("avgDurationMs absent");
    return { detail: `dispatchTotal=${m.dispatchTotal} cancelled=${m.cancelledTotal} failed=${m.failedTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── C8: Estatisticas sao produzidas ──────────────────────────────────────
  results.push(await run(8, "Estatisticas sao produzidas automaticamente", async () => {
    const s = disp.statistics();
    if (s.dispatchTotal === 0)   throw new Error("dispatchTotal = 0");
    if (s.cancelledTotal === 0)  throw new Error("cancelledTotal = 0 (expected >=1 from C3)");
    if (typeof s.avgDispatchTime !== "number") throw new Error("avgDispatchTime absent");
    return { detail: `dispatched=${s.dispatchTotal} cancelled=${s.cancelledTotal} failed=${s.failedTotal} avg=${s.avgDispatchTime}ms` };
  }));

  // ── C9: Health retorna SUCCESS ────────────────────────────────────────────
  results.push(await run(9, "Health retorna SUCCESS", async () => {
    const hc = disp.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.dispatchIntegrity) throw new Error("dispatchIntegrity failed");
    if (!hc.checks.consistencyCheck)  throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C10: exists() funciona ────────────────────────────────────────────────
  results.push(await run(10, "exists() funciona corretamente", async () => {
    const goalId = await makeGoal({ title: "C10 Exists" });
    const r = disp.dispatch(goalId);
    if (!r.success) throw new Error(r.error);
    if (!disp.exists(r.dispatchId!)) throw new Error("exists() returned false after dispatch");
    if (disp.exists("nonexistent-disp-id")) throw new Error("exists() returned true for nonexistent");
    return { detail: `exists(${r.dispatchId})=true exists(nonexistent)=false` };
  }));

  // ── C11: list() funciona ──────────────────────────────────────────────────
  results.push(await run(11, "list() funciona com e sem filtro", async () => {
    const all        = disp.list();
    const dispatched = disp.list("DISPATCHED");
    const cancelled  = disp.list("CANCELLED");
    if (!Array.isArray(all))        throw new Error("list() not array");
    if (all.length === 0)           throw new Error("list() empty");
    if (!Array.isArray(dispatched)) throw new Error("list(DISPATCHED) not array");
    if (!Array.isArray(cancelled))  throw new Error("list(CANCELLED) not array");
    return { detail: `all=${all.length} dispatched=${dispatched.length} cancelled=${cancelled.length}` };
  }));

  // ── C12: clear() funciona ─────────────────────────────────────────────────
  results.push(await run(12, "clear() restaura estado limpo e consistente", async () => {
    const tempDisp = new ExecutionDispatcher();
    const tempRt   = new GoalRuntime();
    const g = await tempRt.create(baseMeta({ title: "C12 Clear" }));
    // dispatch without registry (no validation)
    tempDisp.dispatch(g.goalId);
    tempDisp.clear();
    const stats = tempDisp.statistics();
    if (stats.dispatchTotal !== 0) throw new Error(`Expected 0, got ${stats.dispatchTotal}`);
    const hc = tempDisp.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear`);
    return { detail: `clear() → dispatched=${stats.dispatchTotal} health=${hc.status}` };
  }));

  // ── C13: Runtime reutilizado ──────────────────────────────────────────────
  results.push(await run(13, "Goal Runtime e reutilizado integralmente", async () => {
    const m = rt.getMetrics();
    if (m.created === 0) throw new Error("GoalRuntime has no created goals");
    return { detail: `Runtime: created=${m.created} active=${m.active}` };
  }));

  // ── C14: Registry reutilizado ─────────────────────────────────────────────
  results.push(await run(14, "Goal Registry Service e reutilizado integralmente", async () => {
    const s = svc.statistics();
    if (s.registeredCount === 0) throw new Error("GoalRegistryService has no goals");
    return { detail: `RegistryService: total=${s.total} registered=${s.registeredCount}` };
  }));

  // ── C15: Scheduler reutilizado ────────────────────────────────────────────
  results.push(await run(15, "Goal Scheduler e reutilizado integralmente", async () => {
    const s = sch.statistics();
    if (s.scheduled === 0) throw new Error("GoalScheduler has no schedules");
    return { detail: `Scheduler: scheduled=${s.scheduled} cancelled=${s.cancelled}` };
  }));

  // ── C16: Queue reutilizada ────────────────────────────────────────────────
  results.push(await run(16, "Goal Execution Queue e reutilizada integralmente", async () => {
    const s = queue.statistics();
    if (s.enqueued === 0) throw new Error("GoalExecutionQueue has no entries");
    return { detail: `Queue: enqueued=${s.enqueued} processed=${s.processed}` };
  }));

  // ── H1: Goal inexistente rejeitado ───────────────────────────────────────
  results.push(await run(17, "[Hardening] Goal inexistente e rejeitado", async () => {
    const r = disp.dispatch("nonexistent-goal-xyz");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H2: Scheduler vazio — dispatchReadyGoals retorna 0 ───────────────────
  results.push(await run(18, "[Hardening] Scheduler vazio — dispatchReadyGoals retorna 0", async () => {
    const emptyDisp = new ExecutionDispatcher(undefined, new GoalScheduler(), new GoalExecutionQueue());
    const r = emptyDisp.dispatchReadyGoals();
    if (r.dispatched !== 0) throw new Error(`Expected 0, got ${r.dispatched}`);
    return { detail: `dispatchReadyGoals on empty scheduler: dispatched=${r.dispatched} failed=${r.failed}` };
  }));

  // ── H3: Queue indisponivel — dispatch sem queue nao lanca excecao ─────────
  results.push(await run(19, "[Hardening] Dispatcher sem Queue nao lanca excecao", async () => {
    const dispNoQ = new ExecutionDispatcher();
    const rt2     = new GoalRuntime();
    const g       = await rt2.create(baseMeta({ title: "H3 No Queue" }));
    const r = dispNoQ.dispatch(g.goalId);
    // Without registry validation, dispatch should succeed (no queue means queueId=null)
    if (!r.success) throw new Error(`Expected success without queue: ${r.error}`);
    return { detail: `dispatch without queue: success=${r.success} queueId=${r.queueId ?? "null"}` };
  }));

  // ── H4: Dispatch duplicado rejeitado ─────────────────────────────────────
  results.push(await run(20, "[Hardening] Dispatch duplicado e rejeitado", async () => {
    const goalId = await makeGoal({ title: "H4 Duplicate Dispatch" });
    const r1 = disp.dispatch(goalId);
    if (!r1.success) throw new Error(r1.error);
    const r2 = disp.dispatch(goalId);
    if (r2.success) throw new Error("Expected duplicate to fail");
    if (!r2.error?.includes("already dispatched")) throw new Error(`Wrong error: ${r2.error}`);
    return { detail: `duplicate rejected: "${r2.error}"` };
  }));

  // ── H5: Cancelamento inexistente nao lanca excecao ───────────────────────
  results.push(await run(21, "[Hardening] Cancelamento inexistente nao lanca excecao", async () => {
    const r = disp.cancelDispatch("nonexistent-dispatch-id");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H6: clear() restaura estado consistente ──────────────────────────────
  results.push(await run(22, "[Hardening] clear() restaura estado totalmente limpo", async () => {
    const tempD = new ExecutionDispatcher();
    tempD.dispatch("goal-tmp-1");
    tempD.dispatch("goal-tmp-2");
    tempD.clear();
    const m = tempD.getMetrics();
    const s = tempD.statistics();
    if (m.dispatchTotal !== 0) throw new Error(`metrics.dispatchTotal should be 0`);
    if (s.dispatchTotal !== 0) throw new Error(`stats.dispatchTotal should be 0`);
    const hc = tempD.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear: ${hc.details}`);
    return { detail: `clear() → dispatched=0 health=${hc.status}` };
  }));

  // ── H7: Dispatcher nao modifica Goal ─────────────────────────────────────
  results.push(await run(23, "[Hardening] Dispatcher nao modifica Goal — somente coordena transicao", async () => {
    const goalId     = await makeGoal({ title: "H7 Immutability" });
    const goal       = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const r = disp.dispatch(goalId);
    if (!r.success) throw new Error(r.error);
    disp.list();
    disp.statistics();
    if (goal.getStatus()      !== statusBefore) throw new Error("Dispatcher modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Dispatcher modified Goal title");
    return { detail: `status ${statusBefore}==${goal.getStatus()} — no side effects confirmed` };
  }));

  // ── H8: Health consistente em estado vazio ────────────────────────────────
  results.push(await run(24, "[Hardening] Health consistente em estado vazio", async () => {
    const emptyD = new ExecutionDispatcher();
    const hc = emptyD.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty dispatcher: ${hc.details}`);
    if (!hc.checks.consistencyCheck)  throw new Error("consistencyCheck failed");
    if (!hc.checks.dispatchIntegrity) throw new Error("dispatchIntegrity failed");
    return { detail: `empty dispatcher: health=${hc.status} details="${hc.details}"` };
  }));

  const passed = results.filter(r => r.passed).length;
  return {
    results, passed, total: results.length,
    durationMs: Date.now() - start,
    statistics: disp.statistics(),
    health:     disp.health(),
    metrics:    disp.getMetrics(),
  };
}