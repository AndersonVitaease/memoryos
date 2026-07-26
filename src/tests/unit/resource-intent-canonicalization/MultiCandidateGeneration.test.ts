import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import { ConversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import type { PlanningContext } from "@/lib/planning-engine-e022/PlanningContextTypes";
import { planningContextAuditStore } from "@/lib/planning-engine-e022/PlanningContextAuditStore";
import {
  PassThroughResourceIntentCanonicalizer,
  resourceIntentCanonicalizationAuditStore,
} from "@/lib/resource-intent-canonicalization";

function makeGoal(parameters: Readonly<Record<string, unknown>>): ConversationGoal {
  return Object.freeze({
    id: "goal-candidate-test",
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

function makeContext(goal: ConversationGoal, request: PlanningContext["canonicalResourceRequest"]): PlanningContext {
  return Object.freeze({
    goal,
    canonicalResourceRequest: request,
    runtimeContext: Object.freeze({ executionId: "exec-candidate", sessionId: "session-candidate" }),
    metadata: Object.freeze({
      source: "unit-test",
      traceId: "exec-candidate",
      featureFlagEnabled: true,
      receivedAtMs: Date.now(),
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

describe("RICL Multi Candidate Generation (Sprint 5)", () => {
  beforeEach(() => {
    resourceIntentCanonicalizationAuditStore.clear();
    planningContextAuditStore.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__;
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__;
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__;
  });

  it("does not generate additional candidates when feature flag is disabled", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = false;
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    const result = canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    expect(result.request.candidateSelectors.length).toBe(0);
    expect(result.audit.candidateGeneration.enabled).toBe(false);
    expect(result.audit.candidateGeneration.candidateCount).toBe(0);
  });

  it("generates literal candidate and preserves original text", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    const result = canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    expect(result.request.rawText).toBe("abrir video creatina.mp4");
    expect(result.request.candidateSelectors[0].strategy).toBe("literal");
    expect(result.request.candidateSelectors[0].value).toBe("abrir video creatina.mp4");
    expect(result.request.candidateSelectors[0].confidence).toBe(1);
  });

  it("generates descriptor_removed and quoted_literal candidates deterministically", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    const result = canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    const descriptorRemoved = result.request.candidateSelectors.find((c) => c.strategy === "descriptor_removed");
    const quotedLiteral = result.request.candidateSelectors.find((c) => c.strategy === "quoted_literal");

    expect(descriptorRemoved?.value).toBe("creatina.mp4");
    expect(quotedLiteral?.value).toBe("\"creatina.mp4\"");
  });

  it("maintains explicit ordering and priorities", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    const result = canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    const priorities = result.request.candidateSelectors.map((c) => c.priority);
    const ids = result.request.candidateSelectors.map((c) => c.id);

    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    expect(new Set(priorities).size).toBe(priorities.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("records strategies, generation time and candidate count in audit", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    const event = resourceIntentCanonicalizationAuditStore.getAll()[0];
    expect(event.record.candidateGeneration.enabled).toBe(true);
    expect(event.record.candidateGeneration.candidateCount).toBeGreaterThan(0);
    expect(event.record.candidateGeneration.generationDurationMs).toBeGreaterThanOrEqual(0);
    expect(event.record.candidateGeneration.strategies.length).toBeGreaterThan(0);
  });

  it("transports candidateSelectors through PlanningContext without changing plan", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;
    (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__ = false;

    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" }));
    const request = canonicalizer.canonicalize({ userMessage: goal.userIntent, goal, parameters: goal.parameters }).request;
    const context = makeContext(goal, request);
    const planner = new ConversationPlanningEngine();

    const legacy = planner.plan(goal, { mode: "live" });
    const withContext = planner.plan(goal, { mode: "live", context });

    expect(normalizePlan(withContext)).toEqual(normalizePlan(legacy));

    const plannerAudit = planningContextAuditStore.getAll()[0];
    expect(plannerAudit.record.canonicalResourceRequest?.candidateSelectors.length).toBeGreaterThan(0);
  });

  it("exposes candidate generation metrics", () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__ = true;

    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));

    canonicalizer.canonicalize({ userMessage: goal.userIntent, goal, parameters: goal.parameters });
    canonicalizer.canonicalize({ userMessage: goal.userIntent, goal, parameters: goal.parameters });

    const metrics = resourceIntentCanonicalizationAuditStore.getMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.candidateGenerationEnabled).toBe(2);
    expect(metrics.totalCandidatesGenerated).toBeGreaterThan(0);
    expect(metrics.averageCandidatesPerRequest).toBeGreaterThan(0);
  });
});
