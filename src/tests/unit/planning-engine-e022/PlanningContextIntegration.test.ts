import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import { ConversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import type { PlanningContext } from "@/lib/planning-engine-e022/PlanningContextTypes";
import { planningContextAuditStore } from "@/lib/planning-engine-e022/PlanningContextAuditStore";
import {
  PassThroughResourceIntentCanonicalizer,
  isCanonicalResourceRequestEnabled,
} from "@/lib/resource-intent-canonicalization";

function makeGoal(parameters: Readonly<Record<string, unknown>>): ConversationGoal {
  return Object.freeze({
    id: "goal-plan-context-test",
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

function makePlanningContext(goal: ConversationGoal, featureFlagEnabled: boolean): PlanningContext {
  const canonicalizer = new PassThroughResourceIntentCanonicalizer();
  const canonicalized = canonicalizer.canonicalize({
    userMessage: goal.userIntent,
    goal,
    parameters: goal.parameters,
    traceId: "exec-planning-context",
    timestampMs: 1780000001111,
  });

  return Object.freeze({
    goal,
    canonicalResourceRequest: canonicalized.request,
    runtimeContext: Object.freeze({
      executionId: "exec-planning-context",
      sessionId: "session-001",
    }),
    metadata: Object.freeze({
      source: "unit-test",
      traceId: "exec-planning-context",
      featureFlagEnabled,
      receivedAtMs: 1780000002222,
    }),
  });
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

describe("PlanningContext integration (Sprint 3)", () => {
  beforeEach(() => {
    planningContextAuditStore.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__;
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__;
  });

  it("planner accepts goal + canonical request context when feature flag is enabled", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__ = true;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const context = makePlanningContext(goal, true);
    const planner = new ConversationPlanningEngine();

    const result = planner.plan(goal, { mode: "live", context });

    expect(result.success).toBe(true);
    expect(result.plan.goalType).toBe("drive.openDocument");

    const events = planningContextAuditStore.getAll();
    expect(events.length).toBe(1);
    expect(events[0].record.comparison.hasCanonicalResourceRequest).toBe(true);
    expect(events[0].record.comparison.contractVersion).toBe(1);
  });

  it("feature flag disabled keeps behavior identical and no context audit is recorded", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__ = false;

    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const planner = new ConversationPlanningEngine();

    const legacy = planner.plan(goal, { mode: "live" });
    const stillLegacy = planner.plan(goal, { mode: "live", context: null });

    expect(normalizePlan(stillLegacy)).toEqual(normalizePlan(legacy));
    expect(isCanonicalResourceRequestEnabled()).toBe(false);
    expect(planningContextAuditStore.getAll().length).toBe(0);
  });

  it("comparison detects and records divergences without changing planning output", () => {
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const context = makePlanningContext(goal, true);
    const planner = new ConversationPlanningEngine();

    const divergentContext: PlanningContext = Object.freeze({
      ...context,
      canonicalResourceRequest: Object.freeze({
        ...context.canonicalResourceRequest!,
        rawText: "texto divergente",
        action: "open",
        metadata: Object.freeze({
          ...context.canonicalResourceRequest!.metadata,
          extras: Object.freeze({
            ...context.canonicalResourceRequest!.metadata.extras,
            parameters: Object.freeze({ fileName: "outro.mp4" }),
          }),
        }),
      }),
    });

    const legacy = planner.plan(goal, { mode: "live" });
    const withDivergence = planner.plan(goal, { mode: "live", context: divergentContext });

    expect(normalizePlan(withDivergence)).toEqual(normalizePlan(legacy));

    const event = planningContextAuditStore.getAll()[0];
    expect(event.record.comparison.valid).toBe(false);
    expect(event.record.comparison.divergences.length).toBeGreaterThanOrEqual(1);
  });

  it("planner continues using only legacy goal parameters for decisions", () => {
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const context = makePlanningContext(goal, true);
    const planner = new ConversationPlanningEngine();

    const result = planner.plan(goal, { mode: "live", context });

    expect(result.plan.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.plan.steps[0].parameters.fileName).toBe("video creatina.mp4");
    expect(result.plan.steps[0].parameters.query).toBe("video creatina.mp4");
  });

  it("regression: plan structure stays identical before and after context intake", () => {
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const context = makePlanningContext(goal, true);
    const planner = new ConversationPlanningEngine();

    const before = planner.plan(goal, { mode: "live" });
    const after = planner.plan(goal, { mode: "live", context });

    expect(normalizePlan(after)).toEqual(normalizePlan(before));
  });

  it("exposes equivalence metrics through planner metrics", () => {
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const context = makePlanningContext(goal, true);
    const planner = new ConversationPlanningEngine();

    planner.plan(goal, { mode: "live", context });

    const metrics = planner.getMetrics();
    expect(metrics.contextValidation.total).toBe(1);
    expect(metrics.contextValidation.withCanonicalResourceRequest).toBe(1);
    expect(metrics.contextValidation.validComparisons).toBe(1);
    expect(metrics.contextValidation.divergences).toBe(0);
  });
});
