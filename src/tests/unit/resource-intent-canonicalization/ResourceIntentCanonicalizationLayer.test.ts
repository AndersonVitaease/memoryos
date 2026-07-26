import { afterEach, describe, expect, it } from "vitest";
import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import { ConversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import {
  CANONICAL_RESOURCE_REQUEST_SCHEMA,
  CANONICAL_RESOURCE_REQUEST_VERSION,
  PassThroughResourceIntentCanonicalizer,
  resourceIntentCanonicalizationAuditStore,
  resourceIntentCanonicalizerProvider,
} from "@/lib/resource-intent-canonicalization";

function makeGoal(parameters: Readonly<Record<string, unknown>>): ConversationGoal {
  return Object.freeze({
    id: "goal-ricl-test",
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

describe("Resource Intent Canonicalization Layer (Sprint 2)", () => {
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__;
  });

  it("creates provider and resolves default pass-through canonicalizer", () => {
    resourceIntentCanonicalizerProvider.reset();
    const canonicalizer = resourceIntentCanonicalizerProvider.get();

    expect(canonicalizer).toBeDefined();
    expect(canonicalizer.id).toBe("ricl.pass-through.v1");
  });

  it("builds minimal CanonicalResourceRequest in pass-through mode", () => {
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const parameters = Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" });
    const goal = makeGoal(parameters);

    const result = canonicalizer.canonicalize({
      userMessage: "abrir video creatina.mp4",
      goal,
      parameters: goal.parameters,
      traceId: "exec-ricl-001",
      timestampMs: 1780000001000,
    });

    expect(result.request.schema).toBe(CANONICAL_RESOURCE_REQUEST_SCHEMA);
    expect(result.request.version).toBe(CANONICAL_RESOURCE_REQUEST_VERSION);
    expect(result.request.rawText).toBe("abrir video creatina.mp4");
    expect(result.request.goalType).toBe("drive.openDocument");
    expect(result.request.selectors.literalNameCandidates).toEqual([]);
    expect(result.request.candidateSelectors).toEqual([]);
    expect(result.request.resourceHints.resourceTypes).toEqual([]);
    expect(result.request.confidence.overall).toBe(0);
    expect(result.request.metadata.extras.parameters).toBe(goal.parameters);
    expect(result.audit.contractVersion).toBe(1);
  });

  it("preserves goal and parameters without mutation", () => {
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const parameters = Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" });
    const goal = makeGoal(parameters);
    const before = JSON.stringify(goal.parameters);

    const result = canonicalizer.canonicalize({
      userMessage: "abrir video creatina.mp4",
      goal,
      parameters: goal.parameters,
    });

    expect(JSON.stringify(goal.parameters)).toBe(before);
    expect(result.request.metadata.extras.goal).toBe(goal);
    expect(result.request.metadata.extras.parameters).toBe(goal.parameters);
    expect(result.request.rawText).toBe(goal.userIntent);
  });

  it("returns immutable request and immutable audit payload", () => {
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const parameters = Object.freeze({ fileName: "video creatina.mp4" });
    const goal = makeGoal(parameters);

    const result = canonicalizer.canonicalize({
      userMessage: "abrir video creatina.mp4",
      goal,
      parameters: goal.parameters,
    });

    expect(() => {
      (result.request as unknown as { rawText: string }).rawText = "changed";
    }).toThrow();

    expect(() => {
      (result.audit.input.parameters as Record<string, unknown>)["fileName"] = "other.mp4";
    }).toThrow();
  });

  it("remains compatible with legacy planner flow", () => {
    const planner = new ConversationPlanningEngine();
    const parameters = Object.freeze({ fileName: "video creatina.mp4", query: "video creatina.mp4" });
    const goal = makeGoal(parameters);
    const canonicalizer = new PassThroughResourceIntentCanonicalizer();

    canonicalizer.canonicalize({
      userMessage: goal.userIntent,
      goal,
      parameters: goal.parameters,
    });

    const planResult = planner.plan(goal, { mode: "live" });

    expect(planResult.success).toBe(true);
    expect(planResult.plan.goalType).toBe("drive.openDocument");
    expect(planResult.plan.steps.length).toBeGreaterThanOrEqual(1);
    expect(planResult.plan.steps[0].parameters.fileName).toBe("video creatina.mp4");
  });

  it("records canonicalization audit event", () => {
    resourceIntentCanonicalizationAuditStore.clear();

    const canonicalizer = new PassThroughResourceIntentCanonicalizer();
    const goal = makeGoal(Object.freeze({ fileName: "video creatina.mp4" }));
    canonicalizer.canonicalize({ userMessage: goal.userIntent, goal, parameters: goal.parameters });

    const events = resourceIntentCanonicalizationAuditStore.getAll();
    expect(events.length).toBe(1);
    expect(events[0].record.contractVersion).toBe(1);
    expect(events[0].record.input.goalType).toBe("drive.openDocument");
    expect(events[0].record.produced.schema).toBe(CANONICAL_RESOURCE_REQUEST_SCHEMA);
  });
});
