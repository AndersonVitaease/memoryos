import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import { ConversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import type { PlanningContext } from "@/lib/planning-engine-e022/PlanningContextTypes";
import { planningContextAuditStore } from "@/lib/planning-engine-e022/PlanningContextAuditStore";

function makeGoal(parameters: Readonly<Record<string, unknown>>): ConversationGoal {
  return Object.freeze({
    id: "goal-dual-read-test",
    type: "drive.openDocument",
    confidence: 0.9,
    parameters,
    userIntent: "abrir video creatina.mp4",
    cognitiveIntent: "general_conversation",
    createdAt: 1780000000000,
    valid: true,
    validationErrors: Object.freeze([]),
  }) as ConversationGoal;
}

function makeContext(goal: ConversationGoal, canonicalResourceRequest: Record<string, unknown>): PlanningContext {
  return Object.freeze({
    goal,
    canonicalResourceRequest: canonicalResourceRequest as PlanningContext["canonicalResourceRequest"],
    runtimeContext: Object.freeze({ executionId: "exec-dual-read", sessionId: "session-dual-read" }),
    metadata: Object.freeze({
      source: "unit-test",
      traceId: "exec-dual-read",
      featureFlagEnabled: true,
      receivedAtMs: 1780000004444,
    }),
  });
}

function makeCanonical(goal: ConversationGoal): Record<string, unknown> {
  return {
    schema: "memoryos.canonical-resource-request",
    version: 1,
    rawText: goal.userIntent,
    goalType: goal.type,
    action: "unknown",
    selectors: {
      literalNameCandidates: [],
      idCandidates: [],
      pathCandidates: [],
      queryCandidates: [],
    },
    candidateSelectors: [],
    resourceHints: {
      resourceTypes: [],
      mimeTypes: [],
      extensions: [],
      locale: null,
    },
    ambiguity: {
      isAmbiguous: false,
      reason: null,
    },
    confidence: {
      overall: 0,
      parser: null,
      classifier: null,
    },
    metadata: {
      source: "test",
      createdAtMs: 1780000001111,
      traceId: "exec-dual-read",
      tags: { mode: "pass-through" },
      extras: {
        goal,
        parameters: goal.parameters,
      },
    },
  };
}

function normalizePlan(result: ReturnType<ConversationPlanningEngine["plan"]>) {
  return {
    success: result.success,
    error: result.error,
    status: result.plan.status,
    goalType: result.plan.goalType,
    mode: result.plan.mode ?? "live",
    steps: result.plan.steps.map((step) => ({
      connector: step.connector,
      capability: step.capability,
      parameters: step.parameters,
    })),
  };
}

describe("Planner Dual Read (Sprint 4)", () => {
  beforeEach(() => {
    planningContextAuditStore.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__;
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__;
  });

  it("reads only Goal when dual-read flag is disabled", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = false;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const context = makeContext(goal, makeCanonical(goal));

    planner.plan(goal, { mode: "live", context });

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.dualRead.enabled).toBe(false);
    expect(event.record.dualRead.fieldSources.goalType).toBe("goal");
    expect(event.record.dualRead.fieldSources.parameters).toBe("goal");
  });

  it("reads only CRR when dual-read flag is enabled and CRR is complete", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const context = makeContext(goal, makeCanonical(goal));

    planner.plan(goal, { mode: "live", context });

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.dualRead.enabled).toBe(true);
    expect(event.record.dualRead.fieldSources.goalType).toBe("crr");
    expect(event.record.dualRead.fieldSources.parameters).toBe("crr");
    expect(event.record.dualRead.fallbackCount).toBe(0);
  });

  it("supports hybrid read with partial fallback", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const canonical = makeCanonical(goal);
    (canonical.metadata as Record<string, unknown>).extras = Object.freeze({ goal });
    const context = makeContext(goal, canonical);

    planner.plan(goal, { mode: "live", context });

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.dualRead.fieldSources.goalType).toBe("crr");
    expect(event.record.dualRead.fieldSources.parameters).toBe("goal");
    expect(event.record.dualRead.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(event.record.dualRead.missingFields).toContain("parameters");
  });

  it("falls back automatically for missing fields and records audit", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const canonical = makeCanonical(goal);
    (canonical.rawText as unknown as string) = "";
    const context = makeContext(goal, canonical);

    planner.plan(goal, { mode: "live", context });

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.dualRead.fieldSources.rawText).toBe("goal");
    expect(event.record.dualRead.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(event.record.dualRead.missingFields).toContain("rawText");
  });

  it("records divergences without changing the generated plan", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const canonical = makeCanonical(goal);
    (canonical.rawText as unknown as string) = "texto divergente";
    ((canonical.metadata as Record<string, unknown>).extras as Record<string, unknown>).parameters = Object.freeze({
      fileName: "outro.mp4",
    });
    const context = makeContext(goal, canonical);

    const legacy = planner.plan(goal, { mode: "live" });
    const dualRead = planner.plan(goal, { mode: "live", context });

    expect(normalizePlan(dualRead)).toEqual(normalizePlan(legacy));

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.dualRead.divergences.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps plan identical with flag on and flag off", () => {
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const context = makeContext(goal, makeCanonical(goal));

    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = false;
    const offPlan = planner.plan(goal, { mode: "live", context });

    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;
    const onPlan = planner.plan(goal, { mode: "live", context });

    expect(normalizePlan(onPlan)).toEqual(normalizePlan(offPlan));
  });

  it("tracks usage metrics for CRR reads, Goal reads and fallbacks", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const fullContext = makeContext(goal, makeCanonical(goal));
    const partialCanonical = makeCanonical(goal);
    (partialCanonical.metadata as Record<string, unknown>).extras = Object.freeze({ goal });
    const partialContext = makeContext(goal, partialCanonical);

    planner.plan(goal, { mode: "live", context: fullContext });
    planner.plan(goal, { mode: "live", context: partialContext });

    const metrics = planningContextAuditStore.getMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.crrReads).toBeGreaterThan(0);
    expect(metrics.goalReads).toBeGreaterThan(0);
    expect(metrics.fallbackCount).toBeGreaterThan(0);
    expect(metrics.averageCrrCoverage).toBeGreaterThanOrEqual(0);
    expect(metrics.averageCrrCoverage).toBeLessThanOrEqual(1);
  });

  it("exports audit events for external analysis", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();
    const context = makeContext(goal, makeCanonical(goal));

    planner.plan(goal, { mode: "live", context });

    const exported = planningContextAuditStore.export();
    expect(exported).toContain("goal-dual-read-test");
    expect(exported).toContain("dualRead");
  });
});
