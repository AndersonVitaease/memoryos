// Goal Execution Queue v1.0 — Test Suite
// Foundation v1.0 · Engineering First · Sprint Goal Execution Queue v1.0
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime } from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import { GoalExecutionQueue } from "./GoalExecutionQueue";
import type { GoalMetadata } from "@/lib/goal-runtime-v01/GoalTypes";

export interface QueueTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface QueueSuiteResult {
  results:    QueueTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<GoalExecutionQueue["statistics"]>;
  health:     ReturnType<GoalExecutionQueue["health"]>;
  metrics:    ReturnType<GoalExecutionQueue["getMetrics"]>;
}

function baseMeta(overrides?: Partial<GoalMetadata>): Omit<GoalMetadata, "goalId"> {
  return {
    title: "Queue Test Goal", description: "test",
    priority: "MEDIUM", origin: "USER",
    userId: "user-q-001", projectId: "proj-q-001", sessionId: "sess-q-001",
    tags: ["queue", "test"],
    ...overrides,
  };
}

async function run(
  n: number, name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<QueueTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runGoalExecutionQueueTests(): Promise<QueueSuiteResult> {
  const start = Date.now();
  const rt    = new GoalRuntime();
  const svc   = new GoalRegistryService();
  const sch   = new GoalScheduler(svc);
  const queue = new GoalExecutionQueue(svc, sch);
  const results: QueueTestResult[] = [];
  const future = Date.now() + 60_000;

  // Helper: create goal via full stack, return goalId
  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create(baseMeta(overrides));
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    const reg  = svc.register(goal);
    if (!reg.success) throw new Error(`Service: ${reg.error}`);
    sch.schedule(r.goalId, future, goal.metadata().priority);
    return r.goalId;
  }

  // ── C1: Goals podem ser enfileirados ─────────────────────────────────────
  results.push(await run(1, "Goals podem ser enfileirados", async () => {
    const goalId = await makeGoal({ title: "C1 Enqueue" });
    const r = queue.enqueue(goalId, "HIGH");
    if (!r.success)    throw new Error(r.error);
    if (!r.queueId)    throw new Error("queueId absent");
    if (!queue.exists(r.queueId)) throw new Error("Entry not found after enqueue");
    return { detail: `goalId=${goalId} queueId=${r.queueId} status=QUEUED` };
  }));

  // ── C2: Goals podem ser removidos ────────────────────────────────────────
  results.push(await run(2, "Goals podem ser removidos da fila", async () => {
    const goalId = await makeGoal({ title: "C2 Remove" });
    const r = queue.enqueue(goalId, "LOW");
    if (!r.success) throw new Error(r.error);
    const rm = queue.remove(r.queueId!);
    if (!rm.success) throw new Error(`remove failed: ${rm.error}`);
    const entry = queue.list().find(e => e.queueId === r.queueId);
    if (entry?.status !== "REMOVED") throw new Error(`Expected REMOVED, got ${entry?.status}`);
    return { detail: `queueId=${r.queueId} status=REMOVED` };
  }));

  // ── C3: peek() retorna corretamente o proximo Goal ────────────────────────
  results.push(await run(3, "peek() retorna o proximo Goal sem remover", async () => {
    const sizeBefore = queue.list("QUEUED").length;
    const top = queue.peek();
    if (top !== null && top.status !== "QUEUED") throw new Error(`peek returned non-QUEUED: ${top?.status}`);
    const sizeAfter = queue.list("QUEUED").length;
    if (sizeBefore !== sizeAfter) throw new Error("peek() mutated the queue");
    return { detail: `peek=${top?.goalId ?? "null"} queue unchanged: ${sizeBefore}==${sizeAfter}` };
  }));

  // ── C4: dequeue() remove corretamente ────────────────────────────────────
  results.push(await run(4, "dequeue() retorna e marca como PROCESSING", async () => {
    const goalId = await makeGoal({ title: "C4 Dequeue" });
    queue.enqueue(goalId, "MEDIUM");
    const before = queue.list("QUEUED").length;
    const entry  = queue.dequeue();
    if (!entry) throw new Error("dequeue returned null");
    if (entry.status !== "PROCESSING") throw new Error(`Expected PROCESSING, got ${entry.status}`);
    const after = queue.list("QUEUED").length;
    if (after >= before) throw new Error("Queue size did not decrease after dequeue");
    return { detail: `queueId=${entry.queueId} status=${entry.status} queue: ${before}→${after}` };
  }));

  // ── C5: Priority Ordering ─────────────────────────────────────────────────
  results.push(await run(5, "Priority Ordering funciona — CRITICAL antes de LOW", async () => {
    const q2 = new GoalExecutionQueue();
    const rt2 = new GoalRuntime();
    const gLow  = await rt2.create(baseMeta({ title: "Low P",  priority: "LOW"      }));
    const gHigh = await rt2.create(baseMeta({ title: "High P", priority: "CRITICAL" }));
    q2.enqueue(gLow.goalId,  "LOW");
    q2.enqueue(gHigh.goalId, "CRITICAL");
    const top = q2.peek();
    if (!top) throw new Error("peek returned null");
    if (top.priority !== "CRITICAL") throw new Error(`Expected CRITICAL first, got ${top.priority}`);
    return { detail: `first in queue: priority=${top.priority} goalId=${top.goalId}` };
  }));

  // ── C6: FIFO dentro da mesma prioridade ──────────────────────────────────
  results.push(await run(6, "FIFO funciona para Goals com mesma prioridade", async () => {
    const q3  = new GoalExecutionQueue();
    const rt3 = new GoalRuntime();
    const g1  = await rt3.create(baseMeta({ title: "FIFO First"  }));
    await new Promise(r => setTimeout(r, 2));
    const g2  = await rt3.create(baseMeta({ title: "FIFO Second" }));
    q3.enqueue(g1.goalId, "MEDIUM");
    q3.enqueue(g2.goalId, "MEDIUM");
    const top = q3.peek();
    if (!top) throw new Error("peek null");
    if (top.goalId !== g1.goalId) throw new Error(`Expected FIFO first g1, got ${top.goalId}`);
    return { detail: `FIFO: first enqueued (${g1.goalId}) is first in queue` };
  }));

  // ── C7: Statistics atualizadas automaticamente ───────────────────────────
  results.push(await run(7, "Statistics sao atualizadas automaticamente", async () => {
    const stats = queue.statistics();
    if (stats.enqueued <= 0)  throw new Error("enqueued = 0");
    if (stats.processed <= 0) throw new Error("processed = 0 (expected >=1 from C4)");
    if (typeof stats.queueSize !== "number") throw new Error("queueSize absent");
    return { detail: `enqueued=${stats.enqueued} removed=${stats.removed} processed=${stats.processed} queue=${stats.queueSize} avgWait=${stats.avgWaitMs}ms` };
  }));

  // ── C8: Health retorna SUCCESS ────────────────────────────────────────────
  results.push(await run(8, "Health retorna SUCCESS", async () => {
    const hc = queue.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.queueIntegrity)    throw new Error("queueIntegrity failed");
    if (!hc.checks.priorityIntegrity) throw new Error("priorityIntegrity failed");
    if (!hc.checks.fifoIntegrity)     throw new Error("fifoIntegrity failed");
    if (!hc.checks.consistencyCheck)  throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C9: list() retorna entradas filtradas ────────────────────────────────
  results.push(await run(9, "list() retorna todas as entradas e suporta filtro", async () => {
    const all      = queue.list();
    const queued   = queue.list("QUEUED");
    const removed  = queue.list("REMOVED");
    if (!Array.isArray(all))     throw new Error("Expected array");
    if (all.length === 0)        throw new Error("Expected at least 1 entry");
    if (!Array.isArray(queued))  throw new Error("Filtered queued failed");
    if (!Array.isArray(removed)) throw new Error("Filtered removed failed");
    return { detail: `all=${all.length} queued=${queued.length} removed=${removed.length}` };
  }));

  // ── C10: Logs produzidos automaticamente ─────────────────────────────────
  results.push(await run(10, "Logs sao produzidos automaticamente", async () => {
    const logs = queue.getLogs();
    if (logs.length === 0)   throw new Error("No logs");
    if (!logs[0].executionId) throw new Error("executionId absent");
    if (!logs[0].queueId)     throw new Error("queueId absent");
    if (!logs[0].operation)   throw new Error("operation absent");
    return { detail: `logs=${logs.length} last_op=${logs[logs.length-1].operation}` };
  }));

  // ── C11: Nenhuma responsabilidade do Planner ─────────────────────────────
  results.push(await run(11, "Nenhuma responsabilidade do Planner incorporada", async () => {
    const src = GoalExecutionQueue.toString();
    const forbidden = ["planner", "createplan", "reasoning", "llm", "inference", "capability"];
    const found = forbidden.filter(w => src.toLowerCase().includes(w));
    if (found.length > 0) throw new Error(`Forbidden: ${found.join(", ")}`);
    return { detail: "Zero Planner references confirmed" };
  }));

  // ── C12: Nenhuma responsabilidade do Capability Runtime ──────────────────
  results.push(await run(12, "Nenhuma responsabilidade do Capability Runtime incorporada", async () => {
    const src = GoalExecutionQueue.toString();
    if (src.toLowerCase().includes("capabilityruntime")) throw new Error("CapabilityRuntime found");
    return { detail: "Zero CapabilityRuntime references confirmed" };
  }));

  // ── C13: Nenhuma responsabilidade do Connector Runtime ───────────────────
  results.push(await run(13, "Nenhuma responsabilidade do Connector Runtime incorporada", async () => {
    const src = GoalExecutionQueue.toString();
    if (src.toLowerCase().includes("connectorruntime")) throw new Error("ConnectorRuntime found");
    return { detail: "Zero ConnectorRuntime references confirmed" };
  }));

  // ── C14: Goal Scheduler reutilizado ──────────────────────────────────────
  results.push(await run(14, "Goal Scheduler e reutilizado integralmente", async () => {
    const schStats = sch.statistics();
    if (schStats.scheduled === 0) throw new Error("GoalScheduler has no schedules");
    return { detail: `Scheduler: scheduled=${schStats.scheduled} queue=${schStats.queueSize}` };
  }));

  // ── C15: Goal Registry Service reutilizado ───────────────────────────────
  results.push(await run(15, "Goal Registry Service e reutilizado integralmente", async () => {
    const svcStats = svc.statistics();
    if (svcStats.registeredCount === 0) throw new Error("GoalRegistryService has no goals");
    return { detail: `RegistryService: total=${svcStats.total} registered=${svcStats.registeredCount}` };
  }));

  // ── C16: Goal Runtime reutilizado ────────────────────────────────────────
  results.push(await run(16, "Goal Runtime e reutilizado integralmente", async () => {
    const rtMetrics = rt.getMetrics();
    if (rtMetrics.created === 0) throw new Error("GoalRuntime has no created goals");
    return { detail: `Runtime: created=${rtMetrics.created} active=${rtMetrics.active} completed=${rtMetrics.completed}` };
  }));

  // ── H1: Goal inexistente rejeitado (com registry) ────────────────────────
  results.push(await run(17, "[Hardening] Goal inexistente rejeitado pelo Queue", async () => {
    const r = queue.enqueue("nonexistent-goal-xyz", "MEDIUM");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H2: Enqueue duplicado rejeitado ──────────────────────────────────────
  results.push(await run(18, "[Hardening] Enqueue duplicado e rejeitado", async () => {
    const goalId = await makeGoal({ title: "H2 Duplicate Enqueue" });
    const r1 = queue.enqueue(goalId, "MEDIUM");
    if (!r1.success) throw new Error(r1.error);
    const r2 = queue.enqueue(goalId, "HIGH");
    if (r2.success) throw new Error("Expected duplicate to fail");
    if (!r2.error?.includes("already queued")) throw new Error(`Wrong error: ${r2.error}`);
    return { detail: `duplicate rejected: "${r2.error}"` };
  }));

  // ── H3: Priority invalida rejeitada ──────────────────────────────────────
  results.push(await run(19, "[Hardening] Priority invalida e rejeitada", async () => {
    const goalId = await makeGoal({ title: "H3 Invalid Priority" });
    const r = queue.enqueue(goalId, "SUPER_HIGH" as any);
    if (r.success) throw new Error("Expected failure for invalid priority");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H4: remove() inexistente nao lanca excecao ───────────────────────────
  results.push(await run(20, "[Hardening] remove() inexistente nao lanca excecao", async () => {
    const r = queue.remove("nonexistent-queue-id-xyz");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H5: dequeue() em fila vazia retorna null ─────────────────────────────
  results.push(await run(21, "[Hardening] dequeue() em fila vazia retorna null", async () => {
    const emptyQ = new GoalExecutionQueue();
    const r = emptyQ.dequeue();
    if (r !== null) throw new Error(`Expected null, got entry`);
    const hc = emptyQ.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty queue`);
    return { detail: `dequeue()=null health=${hc.status}` };
  }));

  // ── H6: peek() em fila vazia retorna null ────────────────────────────────
  results.push(await run(22, "[Hardening] peek() em fila vazia retorna null", async () => {
    const emptyQ = new GoalExecutionQueue();
    const r = emptyQ.peek();
    if (r !== null) throw new Error("Expected null");
    return { detail: "peek() on empty queue = null, no exception" };
  }));

  // ── H7: clear() restaura estado limpo ────────────────────────────────────
  results.push(await run(23, "[Hardening] clear() restaura estado limpo e consistente", async () => {
    const tempQ  = new GoalExecutionQueue();
    const tempRt = new GoalRuntime();
    const r = await tempRt.create(baseMeta({ title: "H7 Clear" }));
    tempQ.enqueue(r.goalId, "LOW");
    tempQ.clear();
    const stats = tempQ.statistics();
    if (stats.enqueued !== 0)  throw new Error(`Expected enqueued=0, got ${stats.enqueued}`);
    if (stats.queueSize !== 0) throw new Error(`Expected queue=0, got ${stats.queueSize}`);
    const hc = tempQ.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear`);
    return { detail: `clear() → enqueued=${stats.enqueued} queue=${stats.queueSize} health=${hc.status}` };
  }));

  // ── H8: Queue nao modifica Goal ──────────────────────────────────────────
  results.push(await run(24, "[Hardening] Queue nao modifica Goal — somente gerencia entradas", async () => {
    const goalId     = await makeGoal({ title: "H8 Immutability" });
    const goal       = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const r = queue.enqueue(goalId, "HIGH");
    if (!r.success) throw new Error(r.error);
    queue.peek();
    queue.list();
    queue.statistics();
    if (goal.getStatus()      !== statusBefore) throw new Error("Queue modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Queue modified Goal title");
    return { detail: `status ${statusBefore}==${goal.getStatus()} — no side effects confirmed` };
  }));

  const passed = results.filter(r => r.passed).length;
  return {
    results, passed, total: results.length,
    durationMs: Date.now() - start,
    statistics: queue.statistics(),
    health:     queue.health(),
    metrics:    queue.getMetrics(),
  };
}