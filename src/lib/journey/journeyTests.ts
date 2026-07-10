// ─── Journey Engine Tests ─────────────────────────────────────────────────────
// Foundation v1.0 · Lifecycle · Manager · Orchestrator · Tasks · Memory · Audit · Events

import {
  createJourney, getJourney, listJourneys, startJourney,
  pauseJourney, resumeJourney, cancelJourney, completeJourney,
  failJourney, archiveJourney, updateJourney, addTask,
} from "./JourneyManager";
import { orchestrateTask, orchestrateJourney } from "./JourneyOrchestrator";
import { journeyEventBus }    from "./JourneyEventBus";
import { isValidTransition, VALID_TRANSITIONS, makeTask } from "./types";
import type { JourneyGoal, JourneyStatus } from "./types";
import type { IdentityContext } from "@/lib/wme/types";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { createWorkingMemoryEngine } from "@/lib/wme";
const { engine: workingMemoryEngine } = createWorkingMemoryEngine();

bootstrapCapabilities();

export interface JourneyTestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion: ${msg}`);
}

function makeCtx(suffix = "test"): IdentityContext {
  return { userId: `user_${suffix}`, projectId: `proj_${suffix}`, sessionId: `sess_${suffix}` };
}

function makeGoal(): JourneyGoal {
  return {
    title: "Test Goal",
    description: "Validate the Journey Engine",
    subGoals: ["Create Journey", "Run Tasks"],
    constraints: ["No external deps"],
    acceptanceCriteria: ["All tests pass"],
    expectedOutcome: "Green pipeline",
    priority: "High",
  };
}

function makeJourney(suffix = `${Date.now()}`) {
  return createJourney({
    title:           `Test Journey ${suffix}`,
    objective:       "Validate orchestration",
    description:     "Automated test journey",
    goal:            makeGoal(),
    priority:        "High",
    owner:           "test-runner",
    identityContext: makeCtx(suffix),
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runJourneyTests(): Promise<JourneyTestResult[]> {
  const results: JourneyTestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try {
      await fn();
      results.push({ name, passed: true, durationMs: performance.now() - t0 });
    } catch (e) {
      results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 });
    }
  }

  // ── Journey Model ─────────────────────────────────────────────────────────

  await run("model: createJourney returns valid Journey", () => {
    const j = makeJourney();
    assert(j.id.startsWith("jrn_"), "id should have jrn_ prefix");
    assert(j.status === "Created", "initial status should be Created");
    assert(j.title === `Test Journey ${j.id.split("_")[2] ?? ""}` || j.title.startsWith("Test Journey"), "title mismatch");
    assert(Array.isArray(j.tasks), "tasks should be array");
    assert(Array.isArray(j.timeline), "timeline should be array");
    assert(Array.isArray(j.auditLog), "auditLog should be array");
    assert(j.completedAt === null, "completedAt should be null");
  });

  await run("model: identityContext isolated per Journey", () => {
    const j1 = makeJourney("a");
    const j2 = makeJourney("b");
    assert(j1.identityContext.userId !== j2.identityContext.userId, "userId should differ");
    assert(j1.identityContext.projectId !== j2.identityContext.projectId, "projectId should differ");
  });

  await run("model: getJourney retrieves by id", () => {
    const j = makeJourney();
    const retrieved = getJourney(j.id);
    assert(retrieved?.id === j.id, "should retrieve same journey");
  });

  await run("model: getJourney returns undefined for unknown id", () => {
    assert(getJourney("nope") === undefined, "should return undefined");
  });

  await run("model: listJourneys returns all created", () => {
    const before = listJourneys().length;
    makeJourney();
    assert(listJourneys().length > before, "should have more journeys after create");
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  await run("lifecycle: isValidTransition — Created → Planning", () => {
    assert(isValidTransition("Created", "Planning"), "Created → Planning must be valid");
  });

  await run("lifecycle: isValidTransition — Archived → Running is invalid", () => {
    assert(!isValidTransition("Archived", "Running"), "Archived → Running must be invalid");
  });

  await run("lifecycle: all terminal states have no outgoing transitions", () => {
    assert(VALID_TRANSITIONS["Archived"].length === 0, "Archived should have no transitions");
  });

  await run("lifecycle: startJourney transitions Created → Running", () => {
    const j = makeJourney();
    startJourney(j.id);
    assert(j.status === "Running", `expected Running, got ${j.status}`);
  });

  await run("lifecycle: pauseJourney transitions Running → Paused", () => {
    const j = makeJourney();
    startJourney(j.id);
    pauseJourney(j.id);
    assert(j.status === "Paused", `expected Paused, got ${j.status}`);
  });

  await run("lifecycle: resumeJourney transitions Paused → Running", () => {
    const j = makeJourney();
    startJourney(j.id);
    pauseJourney(j.id);
    resumeJourney(j.id);
    assert(j.status === "Running", `expected Running, got ${j.status}`);
  });

  await run("lifecycle: completeJourney sets completedAt", () => {
    const j = makeJourney();
    startJourney(j.id);
    completeJourney(j.id);
    assert(j.status === "Completed", "should be Completed");
    assert(j.completedAt !== null, "completedAt should be set");
  });

  await run("lifecycle: cancelJourney transitions to Cancelled", () => {
    const j = makeJourney();
    cancelJourney(j.id);
    assert(j.status === "Cancelled", "should be Cancelled");
  });

  await run("lifecycle: failJourney transitions Running → Failed", () => {
    const j = makeJourney();
    startJourney(j.id);
    failJourney(j.id, "test error");
    assert(j.status === "Failed", "should be Failed");
  });

  await run("lifecycle: archiveJourney from Completed", () => {
    const j = makeJourney();
    startJourney(j.id);
    completeJourney(j.id);
    archiveJourney(j.id);
    assert(j.status === "Archived", "should be Archived");
  });

  await run("lifecycle: invalid transition throws", () => {
    const j = makeJourney();
    let threw = false;
    try { resumeJourney(j.id); } catch { threw = true; }
    assert(threw, "should throw on invalid transition Created → Running");
  });

  // ── Journey Manager ───────────────────────────────────────────────────────

  await run("manager: updateJourney patches title and objective", () => {
    const j = makeJourney();
    updateJourney(j.id, { title: "Updated Title", objective: "New Obj" });
    assert(j.title === "Updated Title", "title should be updated");
    assert(j.objective === "New Obj", "objective should be updated");
  });

  await run("manager: audit log records status changes", () => {
    const j = makeJourney();
    startJourney(j.id);
    const auditEvents = j.auditLog.filter(a => a.operation === "status_change");
    assert(auditEvents.length >= 1, "should have at least 1 status_change audit entry");
  });

  await run("manager: timeline has entries after lifecycle changes", () => {
    const j = makeJourney();
    startJourney(j.id);
    assert(j.timeline.length >= 2, "should have timeline entries");
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  await run("tasks: addTask creates task with Pending status", () => {
    const j = makeJourney();
    const t = addTask(j.id, {
      description: "Test Task", requiredCapability: "mri",
      dependencies: [], input: {}, output: {}, metadata: {},
    });
    assert(t.status === "Pending", "initial task status should be Pending");
    assert(j.tasks.includes(t), "task should be in journey.tasks");
  });

  await run("tasks: makeTask helper sets defaults", () => {
    const t = makeTask({ description: "T1", requiredCapability: "mri" });
    assert(t.id.startsWith("tsk_"), "id should start with tsk_");
    assert(t.assignedCapability === null, "assignedCapability should be null");
    assert(Array.isArray(t.dependencies), "dependencies should be array");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("events: JourneyCreated fires on createJourney", () => {
    const events: string[] = [];
    const unsub = journeyEventBus.subscribe(e => events.push(e.type));
    makeJourney();
    unsub();
    assert(events.includes("JourneyCreated"), "should fire JourneyCreated");
  });

  await run("events: JourneyStarted fires on startJourney", () => {
    const events: string[] = [];
    const j = makeJourney();
    const unsub = journeyEventBus.subscribe(e => events.push(e.type));
    startJourney(j.id);
    unsub();
    assert(events.includes("JourneyStarted"), "should fire JourneyStarted");
  });

  await run("events: TaskCreated fires on addTask", () => {
    const events: string[] = [];
    const j = makeJourney();
    const unsub = journeyEventBus.subscribe(e => events.push(e.type));
    addTask(j.id, { description: "T", requiredCapability: "mri", dependencies: [], input: {}, output: {}, metadata: {} });
    unsub();
    assert(events.includes("TaskCreated"), "should fire TaskCreated");
  });

  await run("events: getHistory filters by journeyId", () => {
    const j1 = makeJourney();
    const j2 = makeJourney();
    startJourney(j1.id);
    const h = journeyEventBus.getHistory(j1.id);
    assert(h.every(e => e.journeyId === j1.id), "history should only have j1 events");
  });

  // ── Orchestrator ──────────────────────────────────────────────────────────

  await run("orchestrator: orchestrateTask resolves capability from registry", async () => {
    const j = makeJourney();
    startJourney(j.id);
    const t = addTask(j.id, {
      description: "Run MRI", requiredCapability: "mri",
      dependencies: [], input: { sprint: "test" }, output: {}, metadata: {},
    });
    const result = await orchestrateTask(j, t);
    assert(result.capabilityId === "mri", "capabilityId should be mri");
    assert(result.success, "task should succeed");
  });

  await run("orchestrator: orchestrateTask writes to Working Memory", async () => {
    const j = makeJourney();
    startJourney(j.id);
    const t = addTask(j.id, {
      description: "Memory Test", requiredCapability: "mri",
      dependencies: [], input: { data: "test" }, output: {}, metadata: {},
    });
    await orchestrateTask(j, t);
    const mem = await workingMemoryEngine.retrieve(j.identityContext, `task_output:${t.id}`);
    assert(mem.found, "output should be in Working Memory");
  });

  await run("orchestrator: orchestrateTask handles unknown capability gracefully", async () => {
    const j = makeJourney();
    startJourney(j.id);
    const t = addTask(j.id, {
      description: "Unknown Cap", requiredCapability: "unknown-cap-xyz",
      dependencies: [], input: {}, output: {}, metadata: {},
    });
    const result = await orchestrateTask(j, t);
    assert(result.capabilityId === null, "should have null capabilityId for unknown");
    assert(result.success, "task should still succeed — orchestrator coordinates, not executes");
  });

  await run("orchestrator: orchestrateJourney requires Running status", async () => {
    const j = makeJourney(); // Created
    let threw = false;
    try { await orchestrateJourney(j); } catch { threw = true; }
    assert(threw, "should throw if not Running");
  });

  await run("orchestrator: orchestrateJourney runs all pending tasks", async () => {
    const j = makeJourney();
    startJourney(j.id);
    addTask(j.id, { description: "T1", requiredCapability: "mri",  dependencies: [], input: {}, output: {}, metadata: {} });
    addTask(j.id, { description: "T2", requiredCapability: "mqccs", dependencies: [], input: {}, output: {}, metadata: {} });
    const r = await orchestrateJourney(j);
    assert(r.ran === 2, `expected 2 tasks run, got ${r.ran}`);
    assert(r.succeeded === 2, `expected 2 succeeded, got ${r.succeeded}`);
  });

  await run("orchestrator: dependency checking skips blocked tasks", async () => {
    const j = makeJourney();
    startJourney(j.id);
    const t1 = addTask(j.id, { description: "T1", requiredCapability: "mri", dependencies: [], input: {}, output: {}, metadata: {} });
    addTask(j.id, { description: "T2 (dep on T1)", requiredCapability: "mri", dependencies: [t1.id], input: {}, output: {}, metadata: {} });
    // T1 is pending, T2 depends on T1 — orchestrate only T1 first
    // Manually mark T1 as skipped to force T2 to skip
    t1.status = "Skipped";
    const r = await orchestrateJourney(j);
    // T2 depends on T1 which is now Skipped (not Completed), so T2 should also skip
    assert(r.ran === 0, "T2 should be skipped when T1 is not Completed");
  });

  // ── Working Memory integration ────────────────────────────────────────────

  await run("memory: each Journey has isolated Working Memory context", async () => {
    const j1 = makeJourney("iso1");
    const j2 = makeJourney("iso2");
    await workingMemoryEngine.store(j1.identityContext, "shared_key", "j1_value");
    await workingMemoryEngine.store(j2.identityContext, "shared_key", "j2_value");
    const r1 = await workingMemoryEngine.retrieve(j1.identityContext, "shared_key");
    const r2 = await workingMemoryEngine.retrieve(j2.identityContext, "shared_key");
    assert(r1.item?.value === "j1_value", "j1 should see its own value");
    assert(r2.item?.value === "j2_value", "j2 should see its own value");
  });

  await run("memory: clear removes only Journey's own context", async () => {
    const j1 = makeJourney("clr1");
    const j2 = makeJourney("clr2");
    await workingMemoryEngine.store(j1.identityContext, "key", "v1");
    await workingMemoryEngine.store(j2.identityContext, "key", "v2");
    await workingMemoryEngine.clear(j1.identityContext);
    const r1 = await workingMemoryEngine.retrieve(j1.identityContext, "key");
    const r2 = await workingMemoryEngine.retrieve(j2.identityContext, "key");
    assert(!r1.found, "j1 key should be cleared");
    assert(r2.found, "j2 key should remain");
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  await run("audit: createJourney records created operation", () => {
    const j = makeJourney();
    assert(j.auditLog.some(a => a.operation === "created"), "should have 'created' audit entry");
  });

  await run("audit: task lifecycle recorded in audit log", async () => {
    const j = makeJourney();
    startJourney(j.id);
    const t = addTask(j.id, { description: "Audit T", requiredCapability: "mri", dependencies: [], input: {}, output: {}, metadata: {} });
    await orchestrateTask(j, t);
    assert(j.auditLog.some(a => a.operation === "task_started"),   "should record task_started");
    assert(j.auditLog.some(a => a.operation === "task_completed"), "should record task_completed");
  });

  await run("audit: failJourney records error in audit log", () => {
    const j = makeJourney();
    startJourney(j.id);
    failJourney(j.id, "test error message");
    const failEntry = j.auditLog.find(a => a.operation === "failed");
    assert(!!failEntry, "should have failed audit entry");
    assert(failEntry?.error === "test error message", "should record error message");
  });

  // ── Capability integration ─────────────────────────────────────────────────

  await run("capability: resolves mri, mqccs, mers, mads from registry", async () => {
    const j = makeJourney();
    startJourney(j.id);
    for (const capId of ["mri", "mqccs", "mers", "mads"]) {
      const t = addTask(j.id, { description: `Run ${capId}`, requiredCapability: capId, dependencies: [], input: {}, output: {}, metadata: {} });
      const r = await orchestrateTask(j, t);
      assert(r.capabilityId === capId, `${capId} should be resolved from registry`);
    }
  });

  return results;
}