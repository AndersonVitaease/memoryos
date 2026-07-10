/**
 * MQCCS — MemoryOS Quality, Compliance & Certification Specification
 * Performance Benchmarks (Capítulo 7) + Quality Gates (Capítulo 6)
 */

const BENCHMARKS = {
  "Working Memory (store)":    { p50: 5,   p95: 20,  p99: 50,  max: 200 },
  "Working Memory (retrieve)": { p50: 10,  p95: 30,  p99: 80,  max: 300 },
  "Event Bus (publish)":       { p50: 1,   p95: 5,   p99: 20,  max: 100 },
  "Connector (execution)":     { p50: 100, p95: 300, p99: 500, max: 2000 },
  "HealthCheck":               { p50: 1,   p95: 50,  p99: 200, max: 500  },
  "Specialist (process)":      { p50: 200, p95: 500, p99: 1000, max: 5000 },
};

async function measureMs(fn) {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

async function runN(fn, n = 20) {
  const times = [];
  for (let i = 0; i < n; i++) times.push(await measureMs(fn));
  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(n * 0.50)],
    p95: times[Math.floor(n * 0.95)],
    p99: times[Math.floor(n * 0.99)] ?? times[times.length - 1],
    max: times[times.length - 1],
    avg: Math.round(times.reduce((a, b) => a + b, 0) / n),
  };
}

function gate(measured, target) {
  return {
    p50:    { value: measured.p50, target: target.p50, passed: measured.p50 <= target.p50 },
    p95:    { value: measured.p95, target: target.p95, passed: measured.p95 <= target.p95 },
    p99:    { value: measured.p99, target: target.p99, passed: measured.p99 <= target.p99 },
    max:    { value: measured.max, target: target.max, passed: measured.max <= target.max },
    passed: measured.p95 <= target.p95,
  };
}

export async function runPerformanceBenchmarks() {
  const { WorkingMemoryEngine } = await import("@/lib/mri/core/memory/WorkingMemoryEngine");
  const { EventBus }             = await import("@/lib/mri/core/event-bus/EventBus");
  const { MockGovConnector }     = await import("@/lib/mri/connectors/MockGovConnector");
  const { GovernmentSpecialist } = await import("@/lib/mri/specialists/GovernmentSpecialist");

  const mem  = new WorkingMemoryEngine();
  const bus  = new EventBus();
  const gov  = new MockGovConnector();
  const spec = new GovernmentSpecialist();

  const mockCtx = {
    executionId: "bench", stepId: "s1", userId: "bench-user", sessionId: "bench-session",
    journeyId: "j1", identityContext: "PF", timeoutMs: 5000, secrets: { get: () => undefined },
  };

  const results = {};

  results["Working Memory (store)"] = gate(
    await runN(() => mem.store({ userId: "bench", sessionId: "s", identityContext: "PF", type: "FACT", tier: "working", content: {}, priority: 0.5, tags: [] })),
    BENCHMARKS["Working Memory (store)"]
  );

  results["Working Memory (retrieve)"] = gate(
    await runN(() => mem.retrieve({ userId: "bench" })),
    BENCHMARKS["Working Memory (retrieve)"]
  );

  results["Event Bus (publish)"] = gate(
    await runN(() => bus.publish({ type: "bench.event", sourceEngine: "bench", priority: "NORMAL", payload: {} })),
    BENCHMARKS["Event Bus (publish)"]
  );

  results["Connector (execution)"] = gate(
    await runN(() => gov.execute({ cpf: "000.000.000-00" }, mockCtx)),
    BENCHMARKS["Connector (execution)"]
  );

  results["HealthCheck"] = gate(
    await runN(() => gov.healthCheck()),
    BENCHMARKS["HealthCheck"]
  );

  results["Specialist (process)"] = gate(
    await runN(() => spec.process({
      query: "Como verificar CPF?", context: {}, workingMemory: {},
      identityContext: "PF", journeyId: "j1",
      knowledgeProvider: { search: async () => [] },
    })),
    BENCHMARKS["Specialist (process)"]
  );

  const allPassed = Object.values(results).every(r => r.passed);
  const score     = Math.round((Object.values(results).filter(r => r.passed).length / Object.keys(results).length) * 100);

  return { results, allPassed, score };
}