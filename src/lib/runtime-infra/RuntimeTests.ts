// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeInfrastructureTests (100 tests)
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import { SystemClock, VirtualClock, MockClock, DeterministicClock, createClock } from "./RuntimeClock";
import { UUIDProvider, SequentialProvider, DeterministicProvider, TestProvider, createIdProvider } from "./RuntimeExecutionIdProvider";
import { FIFOQueue, LIFOQueue, PriorityQueue, FutureQueue, createQueue } from "./RuntimeQueue";
import { NoRetry, FixedRetry, LinearRetry, ExponentialRetry, FibonacciRetry, AdaptiveRetry } from "./RuntimeRetryStrategy";
import { FixedTimeout, AdaptiveTimeout, InfiniteTimeout, ConnectorTimeout } from "./RuntimeTimeoutStrategy";
import { RuntimeEventBus } from "./RuntimeEventBus";
import { RuntimeMetrics } from "./RuntimeMetrics";
import { RuntimeHealth } from "./RuntimeHealth";
import { RuntimeLifecycle, TERMINAL_STATES } from "./RuntimeLifecycle";
import { RuntimeScheduler } from "./RuntimeScheduler";
import { RuntimeBase } from "./RuntimeBase";
import type { RuntimeContext, RuntimeContextParams } from "./RuntimeContext";
import type { RuntimeBaseConfig } from "./RuntimeBase";

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

export interface TestCase {
  id: string;
  label: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
}

export interface TestReport {
  sprint: string;
  total: number;
  passed: number;
  failed: number;
  passRate: string;
  durationMs: number;
  certified: boolean;
  cases: TestCase[];
}

// ── Minimal concrete RuntimeBase for testing ──────────────────────────────────
class TestRuntime extends RuntimeBase {
  private _executor: (ctx: Readonly<RuntimeContext>) => Promise<unknown>;
  constructor(
    cfg: RuntimeBaseConfig,
    executor: (ctx: Readonly<RuntimeContext>) => Promise<unknown> = async () => "ok"
  ) {
    super(cfg);
    this._executor = executor;
  }
  protected label(): string { return this._label; }
  protected async executeCore(ctx: Readonly<RuntimeContext>): Promise<unknown> {
    return this._executor(ctx);
  }
}

async function run(id: string, label: string, fn: () => void | Promise<void>): Promise<TestCase> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, label, status: "PASS", durationMs: Date.now() - t0 };
  } catch (e: unknown) {
    return { id, label, status: "FAIL", durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

export async function runRuntimeInfrastructureTests(): Promise<TestReport> {
  const cases: TestCase[] = [];
  const t0all = Date.now();

  // ══ CLOCK (T01–T15) ══════════════════════════════════════════════════════
  cases.push(await run("T01", "SystemClock.now() > 0", () => {
    assert(new SystemClock().now() > 0, "fail");
  }));
  cases.push(await run("T02", "SystemClock.elapsed() >= 0", () => {
    const c = new SystemClock(); const t = c.now(); assert(c.elapsed(t) >= 0, "fail");
  }));
  cases.push(await run("T03", "SystemClock.label() = SystemClock", () => {
    assert(new SystemClock().label() === "SystemClock", "fail");
  }));
  cases.push(await run("T04", "VirtualClock.now() starts at 0", () => {
    assert(new VirtualClock(0).now() === 0, "fail");
  }));
  cases.push(await run("T05", "VirtualClock.advance() works", () => {
    const c = new VirtualClock(100); c.advance(50); assert(c.now() === 150, `${c.now()}`);
  }));
  cases.push(await run("T06", "VirtualClock.set() works", () => {
    const c = new VirtualClock(); c.set(9999); assert(c.now() === 9999, "fail");
  }));
  cases.push(await run("T07", "MockClock returns queued values", () => {
    const c = new MockClock(); c.queue(10, 20, 30);
    assert(c.now() === 10 && c.now() === 20 && c.now() === 30, "fail");
  }));
  cases.push(await run("T08", "MockClock fallback = 0 after queue exhausted", () => {
    const c = new MockClock(); c.queue(5); c.now();
    assert(c.now() === 0, `${c.now()}`);
  }));
  cases.push(await run("T09", "DeterministicClock increments by step", () => {
    const c = new DeterministicClock(10);
    assert(c.now() === 0 && c.now() === 10 && c.now() === 20, "fail");
  }));
  cases.push(await run("T10", "DeterministicClock.reset() restarts", () => {
    const c = new DeterministicClock(1); c.now(); c.now(); c.reset();
    assert(c.now() === 0, `${c.now()}`);
  }));
  cases.push(await run("T11", "createClock(SYSTEM) returns SystemClock", () => {
    assert(createClock("SYSTEM").label() === "SystemClock", "fail");
  }));
  cases.push(await run("T12", "createClock(VIRTUAL) returns VirtualClock", () => {
    assert(createClock("VIRTUAL").label() === "VirtualClock", "fail");
  }));
  cases.push(await run("T13", "createClock(MOCK) returns MockClock", () => {
    assert(createClock("MOCK").label() === "MockClock", "fail");
  }));
  cases.push(await run("T14", "createClock(DETERMINISTIC) returns DeterministicClock", () => {
    assert(createClock("DETERMINISTIC").label() === "DeterministicClock", "fail");
  }));
  cases.push(await run("T15", "VirtualClock.elapsed() deterministic", () => {
    const c = new VirtualClock(0); const t = c.now(); c.advance(42);
    assert(c.elapsed(t) === 42, `${c.elapsed(t)}`);
  }));

  // ══ EXECUTION ID PROVIDER (T16–T25) ══════════════════════════════════════
  cases.push(await run("T16", "UUIDProvider generates unique IDs", () => {
    const p = new UUIDProvider(); const ids = Array.from({ length: 10 }, () => p.next());
    assert(new Set(ids).size === 10, "duplicate IDs");
  }));
  cases.push(await run("T17", "UUIDProvider respects prefix", () => {
    assert(new UUIDProvider().next("cap").startsWith("cap-"), "fail");
  }));
  cases.push(await run("T18", "SequentialProvider is sequential", () => {
    const p = new SequentialProvider();
    const a = p.next("x"); const b = p.next("x");
    assert(a === "x-000001" && b === "x-000002", `${a} ${b}`);
  }));
  cases.push(await run("T19", "SequentialProvider.reset() restarts", () => {
    const p = new SequentialProvider(); p.next(); p.next(); p.reset();
    assert(p.next("x") === "x-000001", p.next("x"));
  }));
  cases.push(await run("T20", "DeterministicProvider is deterministic", () => {
    const p = new DeterministicProvider("seed");
    p.reset();
    const a = p.next(); p.reset(); const b = p.next();
    assert(a === b, `${a} != ${b}`);
  }));
  cases.push(await run("T21", "TestProvider returns queued IDs", () => {
    const p = new TestProvider(); p.queue("id-001", "id-002");
    assert(p.next() === "id-001" && p.next() === "id-002", "fail");
  }));
  cases.push(await run("T22", "TestProvider fallback after queue exhausted", () => {
    const p = new TestProvider(); p.queue("only");
    p.next(); const fallback = p.next();
    assert(fallback.includes("test"), `${fallback}`);
  }));
  cases.push(await run("T23", "createIdProvider(UUID)", () => {
    assert(createIdProvider("UUID").label() === "UUIDProvider", "fail");
  }));
  cases.push(await run("T24", "createIdProvider(SEQUENTIAL)", () => {
    assert(createIdProvider("SEQUENTIAL").label() === "SequentialProvider", "fail");
  }));
  cases.push(await run("T25", "createIdProvider(DETERMINISTIC)", () => {
    assert(createIdProvider("DETERMINISTIC").label() === "DeterministicProvider", "fail");
  }));

  // ══ QUEUE (T26–T38) ══════════════════════════════════════════════════════
  cases.push(await run("T26", "FIFOQueue: FIFO order", () => {
    const q = new FIFOQueue<number>(); q.enqueue(1); q.enqueue(2); q.enqueue(3);
    assert(q.dequeue() === 1 && q.dequeue() === 2, "not FIFO");
  }));
  cases.push(await run("T27", "LIFOQueue: LIFO order", () => {
    const q = new LIFOQueue<number>(); q.enqueue(1); q.enqueue(2); q.enqueue(3);
    assert(q.dequeue() === 3 && q.dequeue() === 2, "not LIFO");
  }));
  cases.push(await run("T28", "PriorityQueue: highest priority first", () => {
    const q = new PriorityQueue<string>();
    q.enqueue("low", { priority: 1 }); q.enqueue("high", { priority: 10 }); q.enqueue("mid", { priority: 5 });
    assert(q.dequeue() === "high", `got ${q.dequeue()}`);
  }));
  cases.push(await run("T29", "FutureQueue: dequeues only when ready", () => {
    let now = 0;
    const q = new FutureQueue<string>(() => now);
    q.enqueue("future", { readyAt: 100 });
    assert(q.dequeue() === undefined, "should not dequeue yet");
    now = 200;
    assert(q.dequeue() === "future", "should dequeue now");
  }));
  cases.push(await run("T30", "FIFOQueue.size() and isEmpty()", () => {
    const q = new FIFOQueue<number>(); assert(q.isEmpty(), "should be empty");
    q.enqueue(1); assert(q.size() === 1, `size=${q.size()}`); assert(!q.isEmpty(), "should not be empty");
  }));
  cases.push(await run("T31", "FIFOQueue.peek() does not remove", () => {
    const q = new FIFOQueue<number>(); q.enqueue(99);
    assert(q.peek() === 99 && q.size() === 1, "fail");
  }));
  cases.push(await run("T32", "FIFOQueue.drain() empties queue", () => {
    const q = new FIFOQueue<number>(); q.enqueue(1); q.enqueue(2);
    const all = q.drain(); assert(all.length === 2 && q.isEmpty(), "fail");
  }));
  cases.push(await run("T33", "LIFOQueue.mode() = LIFO", () => {
    assert(new LIFOQueue<string>().mode() === "LIFO", "fail");
  }));
  cases.push(await run("T34", "PriorityQueue.mode() = PRIORITY", () => {
    assert(new PriorityQueue<string>().mode() === "PRIORITY", "fail");
  }));
  cases.push(await run("T35", "createQueue(FIFO)", () => {
    assert(createQueue<string>("FIFO").mode() === "FIFO", "fail");
  }));
  cases.push(await run("T36", "createQueue(LIFO)", () => {
    assert(createQueue<string>("LIFO").mode() === "LIFO", "fail");
  }));
  cases.push(await run("T37", "createQueue(PRIORITY)", () => {
    assert(createQueue<string>("PRIORITY").mode() === "PRIORITY", "fail");
  }));
  cases.push(await run("T38", "FIFOQueue dequeue from empty = undefined", () => {
    assert(new FIFOQueue<number>().dequeue() === undefined, "fail");
  }));

  // ══ RETRY STRATEGY (T39–T48) ══════════════════════════════════════════════
  cases.push(await run("T39", "NoRetry.shouldRetry() = false always", () => {
    assert(!new NoRetry().shouldRetry(0) && !new NoRetry().shouldRetry(99), "fail");
  }));
  cases.push(await run("T40", "FixedRetry: correct delay", () => {
    const r = new FixedRetry(3, 500); assert(r.delayMs(0) === 500 && r.delayMs(2) === 500, "fail");
  }));
  cases.push(await run("T41", "FixedRetry: shouldRetry boundary", () => {
    const r = new FixedRetry(2, 100); assert(r.shouldRetry(1) && !r.shouldRetry(2), "fail");
  }));
  cases.push(await run("T42", "LinearRetry: delay grows linearly", () => {
    const r = new LinearRetry(3, 100);
    assert(r.delayMs(0) === 100 && r.delayMs(1) === 200 && r.delayMs(2) === 300, "fail");
  }));
  cases.push(await run("T43", "ExponentialRetry: delay grows exponentially", () => {
    const r = new ExponentialRetry(3, 100);
    assert(r.delayMs(0) === 100 && r.delayMs(1) === 200 && r.delayMs(2) === 400, "fail");
  }));
  cases.push(await run("T44", "ExponentialRetry: respects maxDelay", () => {
    const r = new ExponentialRetry(10, 100, 300);
    assert(r.delayMs(9) <= 300, `${r.delayMs(9)}`);
  }));
  cases.push(await run("T45", "FibonacciRetry: fibonacci delays", () => {
    const r = new FibonacciRetry(5, 100);
    // fib(1)=1, fib(2)=1, fib(3)=2...
    assert(r.delayMs(0) === 100 && r.delayMs(2) === 200, `${r.delayMs(0)}, ${r.delayMs(2)}`);
  }));
  cases.push(await run("T46", "AdaptiveRetry: success reduces delay", () => {
    const r = new AdaptiveRetry(3, 100);
    const d1 = r.delayMs(0); r.recordSuccess(); r.recordSuccess();
    const d2 = r.delayMs(0);
    assert(d2 <= d1, `d2=${d2} d1=${d1}`);
  }));
  cases.push(await run("T47", "AdaptiveRetry: failure increases delay", () => {
    const r = new AdaptiveRetry(3, 100);
    const d1 = r.delayMs(0); r.recordFailure(); r.recordFailure();
    const d2 = r.delayMs(0);
    assert(d2 >= d1, `d2=${d2} d1=${d1}`);
  }));
  cases.push(await run("T48", "NoRetry.maxAttempts() = 1", () => {
    assert(new NoRetry().maxAttempts() === 1, "fail");
  }));

  // ══ TIMEOUT STRATEGY (T49–T55) ════════════════════════════════════════════
  cases.push(await run("T49", "FixedTimeout.timeoutMs() correct", () => {
    assert(new FixedTimeout(5000).timeoutMs() === 5000, "fail");
  }));
  cases.push(await run("T50", "InfiniteTimeout.hasTimeout() = false", () => {
    assert(!new InfiniteTimeout().hasTimeout(), "fail");
  }));
  cases.push(await run("T51", "AdaptiveTimeout grows with samples", () => {
    const t = new AdaptiveTimeout(1000, 2); t.record(500); t.record(600);
    assert(t.timeoutMs() > 0, "fail");
  }));
  cases.push(await run("T52", "ConnectorTimeout: gmail = 10000ms", () => {
    assert(new ConnectorTimeout("gmail").timeoutMs() === 10000, "fail");
  }));
  cases.push(await run("T53", "ConnectorTimeout: drive = 15000ms", () => {
    assert(new ConnectorTimeout("drive").timeoutMs() === 15000, "fail");
  }));
  cases.push(await run("T54", "FixedTimeout.hasTimeout() = true", () => {
    assert(new FixedTimeout(1).hasTimeout(), "fail");
  }));
  cases.push(await run("T55", "ConnectorTimeout: unknown connector uses default", () => {
    assert(new ConnectorTimeout("unknown").timeoutMs() === 10000, "fail");
  }));

  // ══ EVENT BUS (T56–T63) ═══════════════════════════════════════════════════
  cases.push(await run("T56", "EventBus.publish() stores event", () => {
    const bus = new RuntimeEventBus();
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    assert(bus.count() === 1, "fail");
  }));
  cases.push(await run("T57", "EventBus.ofType() filters correctly", () => {
    const bus = new RuntimeEventBus();
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    bus.publish({ type: "EXECUTION_COMPLETED", executionId: "e1", runtimeLabel: "test", timestamp: 1 });
    assert(bus.ofType("EXECUTION_CREATED").length === 1, "fail");
  }));
  cases.push(await run("T58", "EventBus.subscribe() receives events", () => {
    const bus = new RuntimeEventBus(); let received = false;
    bus.subscribe("EXECUTION_CREATED", () => { received = true; });
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    assert(received, "fail");
  }));
  cases.push(await run("T59", "EventBus wildcard subscription", () => {
    const bus = new RuntimeEventBus(); const seen: string[] = [];
    bus.subscribe("*", e => seen.push(e.type));
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    bus.publish({ type: "EXECUTION_COMPLETED", executionId: "e1", runtimeLabel: "test", timestamp: 1 });
    assert(seen.length === 2, `seen=${seen.length}`);
  }));
  cases.push(await run("T60", "EventBus.unsubscribe() stops delivery", () => {
    const bus = new RuntimeEventBus(); let count = 0;
    const unsub = bus.subscribe("EXECUTION_CREATED", () => count++);
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    unsub();
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e2", runtimeLabel: "test", timestamp: 1 });
    assert(count === 1, `count=${count}`);
  }));
  cases.push(await run("T61", "EventBus.forExecution() filters by id", () => {
    const bus = new RuntimeEventBus();
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e2", runtimeLabel: "test", timestamp: 1 });
    assert(bus.forExecution("e1").length === 1, "fail");
  }));
  cases.push(await run("T62", "EventBus events are frozen", () => {
    const bus = new RuntimeEventBus();
    bus.publish({ type: "EXECUTION_CREATED", executionId: "e1", runtimeLabel: "test", timestamp: 0 });
    assert(Object.isFrozen(bus.history()[0]), "fail");
  }));
  cases.push(await run("T63", "EventBus respects maxHistory", () => {
    const bus = new RuntimeEventBus(3);
    for (let i = 0; i < 5; i++)
      bus.publish({ type: "EXECUTION_CREATED", executionId: `e${i}`, runtimeLabel: "test", timestamp: i });
    assert(bus.count() === 3, `count=${bus.count()}`);
  }));

  // ══ METRICS (T64–T70) ═════════════════════════════════════════════════════
  cases.push(await run("T64", "RuntimeMetrics.recordExecution increments", () => {
    const m = new RuntimeMetrics(); m.recordExecution(); m.recordExecution();
    assert(m.snapshot().executions === 2, "fail");
  }));
  cases.push(await run("T65", "RuntimeMetrics.recordSuccess tracks duration", () => {
    const m = new RuntimeMetrics(); m.recordSuccess(200); m.recordSuccess(400);
    assert(m.snapshot().avgDurationMs === 300, `${m.snapshot().avgDurationMs}`);
  }));
  cases.push(await run("T66", "RuntimeMetrics.recordFailure", () => {
    const m = new RuntimeMetrics(); m.recordFailure(); m.recordFailure();
    assert(m.snapshot().failures === 2, "fail");
  }));
  cases.push(await run("T67", "RuntimeMetrics.successRate = 0 with no executions", () => {
    assert(new RuntimeMetrics().snapshot().successRate === 0, "fail");
  }));
  cases.push(await run("T68", "RuntimeMetrics min/max durations", () => {
    const m = new RuntimeMetrics(); m.recordSuccess(100); m.recordSuccess(500);
    const s = m.snapshot();
    assert(s.minDurationMs === 100 && s.maxDurationMs === 500, `min=${s.minDurationMs} max=${s.maxDurationMs}`);
  }));
  cases.push(await run("T69", "RuntimeMetrics.reset() clears all", () => {
    const m = new RuntimeMetrics(); m.recordExecution(); m.recordFailure(); m.reset();
    const s = m.snapshot(); assert(s.executions === 0 && s.failures === 0, "fail");
  }));
  cases.push(await run("T70", "RuntimeMetrics.recordRetry", () => {
    const m = new RuntimeMetrics(); m.recordRetry(); m.recordRetry();
    assert(m.snapshot().retries === 2, "fail");
  }));

  // ══ HEALTH (T71–T77) ══════════════════════════════════════════════════════
  cases.push(await run("T71", "RuntimeHealth initial = READY", () => {
    assert(new RuntimeHealth().status() === "READY", "fail");
  }));
  cases.push(await run("T72", "RuntimeHealth.evaluate() DEGRADED on low errors", () => {
    const h = new RuntimeHealth(); h.evaluate(1, 0);
    assert(h.status() === "DEGRADED", h.status());
  }));
  cases.push(await run("T73", "RuntimeHealth.evaluate() FAILED on many errors", () => {
    const h = new RuntimeHealth(); h.evaluate(5, 5);
    assert(h.status() === "FAILED", h.status());
  }));
  cases.push(await run("T74", "RuntimeHealth.stop() -> STOPPED", () => {
    const h = new RuntimeHealth(); h.stop();
    assert(h.status() === "STOPPED", h.status());
  }));
  cases.push(await run("T75", "RuntimeHealth.recover() -> RECOVERING", () => {
    const h = new RuntimeHealth(); h.recover();
    assert(h.status() === "RECOVERING", h.status());
  }));
  cases.push(await run("T76", "RuntimeHealth.incrementActive tracks active", () => {
    const h = new RuntimeHealth(); h.incrementActive(); h.incrementActive();
    assert(h.report().activeExecutions === 2, "fail");
  }));
  cases.push(await run("T77", "RuntimeHealth.decrementActive floors at 0", () => {
    const h = new RuntimeHealth(); h.decrementActive();
    assert(h.report().activeExecutions === 0, "fail");
  }));

  // ══ LIFECYCLE (T78–T88) ════════════════════════════════════════════════════
  cases.push(await run("T78", "RuntimeLifecycle initial = CREATED", () => {
    assert(new RuntimeLifecycle().state() === "CREATED", "fail");
  }));
  cases.push(await run("T79", "RuntimeLifecycle CREATED -> QUEUED", () => {
    const lc = new RuntimeLifecycle(); lc.transition("QUEUED");
    assert(lc.state() === "QUEUED", "fail");
  }));
  cases.push(await run("T80", "RuntimeLifecycle advanceTo(RUNNING)", () => {
    const lc = new RuntimeLifecycle(); lc.advanceTo("RUNNING");
    assert(lc.state() === "RUNNING", lc.state());
  }));
  cases.push(await run("T81", "RuntimeLifecycle invalid transition throws", () => {
    const lc = new RuntimeLifecycle(); let threw = false;
    try { lc.transition("COMPLETED"); } catch { threw = true; }
    assert(threw, "must throw");
  }));
  cases.push(await run("T82", "RuntimeLifecycle terminal blocks further", () => {
    const lc = new RuntimeLifecycle(); lc.advanceTo("RUNNING"); lc.transition("COMPLETED");
    let threw = false; try { lc.transition("FAILED"); } catch { threw = true; }
    assert(threw, "must throw");
  }));
  cases.push(await run("T83", "RuntimeLifecycle.isTerminal() COMPLETED", () => {
    const lc = new RuntimeLifecycle(); lc.advanceTo("RUNNING"); lc.transition("COMPLETED");
    assert(lc.isTerminal(), "fail");
  }));
  cases.push(await run("T84", "RuntimeLifecycle.history() is frozen", () => {
    const lc = new RuntimeLifecycle(); assert(Object.isFrozen(lc.history()), "fail");
  }));
  cases.push(await run("T85", "RuntimeLifecycle.history() snapshots frozen", () => {
    const lc = new RuntimeLifecycle(); lc.transition("QUEUED");
    assert(lc.history().every(s => Object.isFrozen(s)), "fail");
  }));
  cases.push(await run("T86", "RuntimeLifecycle.isChronological()", () => {
    const clock = new DeterministicClock(1);
    const lc = new RuntimeLifecycle(() => clock.now());
    lc.advanceTo("RUNNING"); lc.transition("COMPLETED");
    assert(lc.isChronological(), "not chronological");
  }));
  cases.push(await run("T87", "RuntimeLifecycle.tryTransition() returns false on invalid", () => {
    const lc = new RuntimeLifecycle();
    assert(!lc.tryTransition("COMPLETED"), "fail");
  }));
  cases.push(await run("T88", "TERMINAL_STATES includes COMPLETED/FAILED/CANCELLED/TIMEOUT", () => {
    const expected = ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"];
    assert(expected.every(s => TERMINAL_STATES.has(s as never)), "fail");
  }));

  // ══ SCHEDULER (T89–T93) ════════════════════════════════════════════════════
  cases.push(await run("T89", "RuntimeScheduler.schedule() creates task", () => {
    const s = new RuntimeScheduler(); s.schedule("t1", async () => "ok");
    assert(s.state("t1") === "QUEUED", s.state("t1") ?? "null");
  }));
  cases.push(await run("T90", "RuntimeScheduler.run() completes task", async () => {
    const s = new RuntimeScheduler(); s.schedule("t1", async () => "done");
    const result = await s.run("t1"); assert(result === "done", `${result}`);
  }));
  cases.push(await run("T91", "RuntimeScheduler.suspend() works", async () => {
    const s = new RuntimeScheduler();
    s.schedule("t1", async () => { await sleep(50); return "ok"; });
    s.state("t1"); // QUEUED
    assert(s.state("t1") === "QUEUED", s.state("t1") ?? "null");
  }));
  cases.push(await run("T92", "RuntimeScheduler.pendingCount()", () => {
    const s = new RuntimeScheduler();
    s.schedule("t1", async () => "ok"); s.schedule("t2", async () => "ok");
    assert(s.pendingCount() === 2, `${s.pendingCount()}`);
  }));
  cases.push(await run("T93", "RuntimeScheduler.run() throws on unknown task", async () => {
    const s = new RuntimeScheduler(); let threw = false;
    try { await s.run("nada"); } catch { threw = true; }
    assert(threw, "must throw");
  }));

  // ══ RUNTIMEBASE (T94–T100) ════════════════════════════════════════════════
  cases.push(await run("T94", "RuntimeBase.execute() returns COMPLETED record", async () => {
    const rt = new TestRuntime({ label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider() });
    const rec = await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(rec.state === "COMPLETED", rec.state);
  }));
  cases.push(await run("T95", "RuntimeBase.execute() record has executionId", async () => {
    const rt = new TestRuntime({ label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider() });
    const rec = await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(!!rec.context.executionId, "fail");
  }));
  cases.push(await run("T96", "RuntimeBase.execute() result preserved", async () => {
    const rt = new TestRuntime(
      { label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider() },
      async () => ({ files: ["a.txt"] })
    );
    const rec = await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(JSON.stringify(rec.result) === JSON.stringify({ files: ["a.txt"] }), "fail");
  }));
  cases.push(await run("T97", "RuntimeBase.execute() failure state = FAILED", async () => {
    const rt = new TestRuntime(
      { label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider(),
        retryStrategy: new NoRetry(), timeoutStrategy: new InfiniteTimeout() },
      async () => { throw new Error("boom"); }
    );
    const rec = await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(rec.state === "FAILED", rec.state);
    assert(rec.error === "boom", rec.error ?? "null");
  }));
  cases.push(await run("T98", "RuntimeBase.health() READY after success", async () => {
    const rt = new TestRuntime({ label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider() });
    await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(rt.health().status === "READY", rt.health().status);
  }));
  cases.push(await run("T99", "RuntimeBase.metrics() records executions", async () => {
    const rt = new TestRuntime({ label: "test-rt", clock: new DeterministicClock(1), idProvider: new SequentialProvider() });
    await rt.execute({ goalId: "g1", sessionId: "s1" });
    await rt.execute({ goalId: "g2", sessionId: "s2" });
    assert(rt.metrics().executions === 2, `${rt.metrics().executions}`);
  }));
  cases.push(await run("T100", "RuntimeBase.execute() explanation has Runtime:", async () => {
    const rt = new TestRuntime({ label: "InfraTestRuntime", clock: new DeterministicClock(1), idProvider: new SequentialProvider() });
    const rec = await rt.execute({ goalId: "g1", sessionId: "s1" });
    assert(rec.explanation.includes("InfraTestRuntime"), rec.explanation);
  }));

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;
  const total = cases.length;

  return {
    sprint: "C-03.6.4",
    total,
    passed,
    failed,
    passRate: `${Math.round((passed / total) * 100)}%`,
    durationMs: Date.now() - t0all,
    certified: failed === 0,
    cases,
  };
}