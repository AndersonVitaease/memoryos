/**
 * planningEngineTests.ts — Engineering Sprint E-02.2
 * Deterministic test suite for ConversationPlanningEngine.
 *
 * Cobertura:
 * ✓ gmail.readInbox    → 3-step plan
 * ✓ gmail.searchMessages
 * ✓ gmail.readMessage
 * ✓ calendar.listToday
 * ✓ calendar.listTomorrow
 * ✓ calendar.createEvent
 * ✓ drive.searchFiles
 * ✓ drive.openDocument
 * ✓ memory.query
 * ✓ memory.summarize
 * ✓ Goal desconhecido (unknown)  → empty plan
 * ✓ Goal invalido                → invalid_goal plan
 * ✓ Plano vazio (general.conversation)
 * ✓ Plano imutavel
 * ✓ IDs unicos
 * ✓ Observabilidade (planning_started / planning_completed / planning_failed)
 * ✓ Parametros do Goal propagados para os steps
 */

import { ConversationPlanningEngine }  from "./ConversationPlanningEngine";
import type { ConversationGoal }       from "@/lib/goals/GoalTypes";
import type { GoalType }               from "@/lib/goals/GoalTypes";
import type { PlanningEvent }          from "./ExecutionPlanTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestResult {
  name:       string;
  passed:     boolean;
  error:      string | null;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
}

async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, passed: true, error: null, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  }
}

let _gseq = 0;
function makeGoal(type: GoalType, overrides: Partial<ConversationGoal> = {}): ConversationGoal {
  const id = `test-goal-${++_gseq}`;
  return Object.freeze({
    id,
    type,
    confidence:       0.8,
    parameters:       Object.freeze({}),
    userIntent:       "test message",
    cognitiveIntent:  "general_conversation",
    createdAt:        Date.now(),
    valid:            true,
    validationErrors: Object.freeze([]),
    ...overrides,
  }) as ConversationGoal;
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runPlanningEngineTests(): Promise<{
  passed:  number;
  failed:  number;
  total:   number;
  results: TestResult[];
  verdict: "PASS" | "FAIL";
}> {
  const engine = new ConversationPlanningEngine();

  const results: TestResult[] = await Promise.all([

    // ── T01: gmail.readInbox → 3-step plan ───────────────────────────────
    run("T01 — gmail.readInbox → validate_session + gmail.readInbox + summarize", () => {
      const { plan } = engine.plan(makeGoal("gmail.readInbox"));
      assertEqual(plan.status, "planned", "status");
      assertEqual(plan.steps.length, 3, "step count");
      assertEqual(plan.steps[0].type, "validate_session", "step[0].type");
      assertEqual(plan.steps[0].connector, "google", "step[0].connector");
      assertEqual(plan.steps[1].type, "gmail.readInbox", "step[1].type");
      assertEqual(plan.steps[1].connector, "gmail", "step[1].connector");
      assertEqual(plan.steps[2].type, "summarize", "step[2].type");
      assert(plan.steps[2].connector === null, "summarize connector must be null");
    }),

    // ── T02: gmail.searchMessages ─────────────────────────────────────────
    run("T02 — gmail.searchMessages → 3-step plan", () => {
      const { plan } = engine.plan(makeGoal("gmail.searchMessages"));
      assertEqual(plan.status, "planned", "status");
      assertEqual(plan.steps[1].type, "gmail.searchMessages", "step[1].type");
      assertEqual(plan.steps[1].connector, "gmail", "connector");
    }),

    // ── T03: gmail.readMessage ────────────────────────────────────────────
    run("T03 — gmail.readMessage → 3-step plan", () => {
      const { plan } = engine.plan(makeGoal("gmail.readMessage"));
      assertEqual(plan.steps[1].type, "gmail.readMessage", "type");
      assertEqual(plan.steps.length, 3, "steps");
    }),

    // ── T04: calendar.listToday ───────────────────────────────────────────
    run("T04 — calendar.listToday → validate + listToday + summarize", () => {
      const { plan } = engine.plan(makeGoal("calendar.listToday"));
      assertEqual(plan.steps[1].type, "calendar.listToday", "type");
      assertEqual(plan.steps[1].connector, "calendar", "connector");
    }),

    // ── T05: calendar.listTomorrow ────────────────────────────────────────
    run("T05 — calendar.listTomorrow → 3-step plan", () => {
      const { plan } = engine.plan(makeGoal("calendar.listTomorrow"));
      assertEqual(plan.steps[1].type, "calendar.listTomorrow", "type");
    }),

    // ── T06: calendar.createEvent ─────────────────────────────────────────
    run("T06 — calendar.createEvent → 3-step plan", () => {
      const { plan } = engine.plan(makeGoal("calendar.createEvent"));
      assertEqual(plan.steps[1].type, "calendar.createEvent", "type");
      assertEqual(plan.steps[1].connector, "calendar", "connector");
    }),

    // ── T07: drive.searchFiles ────────────────────────────────────────────
    run("T07 — drive.searchFiles → validate + searchFiles + summarize", () => {
      const { plan } = engine.plan(makeGoal("drive.searchFiles"));
      assertEqual(plan.steps[1].type, "drive.searchFiles", "type");
      assertEqual(plan.steps[1].connector, "drive", "connector");
    }),

    // ── T08: drive.openDocument ───────────────────────────────────────────
    run("T08 — drive.openDocument → 3-step plan", () => {
      const { plan } = engine.plan(makeGoal("drive.openDocument"));
      assertEqual(plan.steps[1].type, "drive.openDocument", "type");
    }),

    // ── T09: memory.query ─────────────────────────────────────────────────
    run("T09 — memory.query → 2-step plan (no session validation)", () => {
      const { plan } = engine.plan(makeGoal("memory.query"));
      assertEqual(plan.steps[0].type, "memory.query", "step[0].type");
      assertEqual(plan.steps[0].connector, "memory", "connector");
      assertEqual(plan.steps[1].type, "summarize", "step[1].type");
      assertEqual(plan.steps.length, 2, "step count");
    }),

    // ── T10: memory.summarize ─────────────────────────────────────────────
    run("T10 — memory.summarize → 2-step plan", () => {
      const { plan } = engine.plan(makeGoal("memory.summarize"));
      assertEqual(plan.steps[0].type, "memory.summarize", "type");
      assertEqual(plan.steps.length, 2, "steps");
    }),

    // ── T11: Goal unknown → empty plan ────────────────────────────────────
    run("T11 — unknown goal → empty plan (status=empty)", () => {
      const { plan, success } = engine.plan(makeGoal("unknown"));
      assertEqual(plan.status, "empty", "status");
      assertEqual(plan.steps.length, 0, "steps must be empty");
      assert(success, "should succeed (empty is a valid outcome)");
    }),

    // ── T12: Goal invalido → invalid_goal ────────────────────────────────
    run("T12 — invalid goal → status=invalid_goal", () => {
      const goal = makeGoal("gmail.readInbox", {
        valid:            false,
        validationErrors: Object.freeze(["userIntent is required"]),
      });
      const { plan, success, error } = engine.plan(goal);
      assertEqual(plan.status, "invalid_goal", "status");
      assert(!success, "should not succeed");
      assert(error !== null, "error must be present");
    }),

    // ── T13: Plano vazio — general.conversation ───────────────────────────
    run("T13 — general.conversation → 1 noop step (status=planned)", () => {
      const { plan } = engine.plan(makeGoal("general.conversation"));
      assertEqual(plan.steps[0].type, "noop", "type");
      assertEqual(plan.status, "planned", "status");
    }),

    // ── T14: Plano imutavel ───────────────────────────────────────────────
    run("T14 — ExecutionPlan e imutavel (Object.freeze)", () => {
      const { plan } = engine.plan(makeGoal("gmail.readInbox"));
      let threw = false;
      try {
        (plan as Record<string, unknown>)["hacked"] = true;
      } catch { threw = true; }
      assert(threw || (plan as Record<string, unknown>)["hacked"] === undefined,
        "plan must be immutable");
    }),

    // ── T15: IDs unicos ───────────────────────────────────────────────────
    run("T15 — IDs de planos sao unicos entre chamadas", () => {
      const { plan: p1 } = engine.plan(makeGoal("gmail.readInbox"));
      const { plan: p2 } = engine.plan(makeGoal("gmail.readInbox"));
      assert(p1.id !== p2.id, "plan IDs must be unique");
    }),

    // ── T16: Observabilidade — planning_started + planning_completed ───────
    run("T16 — Observabilidade: planning_started + planning_completed", () => {
      const events: PlanningEvent[] = [];
      const unsub = engine.onEvent((e) => events.push(e));
      engine.plan(makeGoal("gmail.readInbox"));
      unsub();
      assert(events.length >= 2, "must emit at least 2 events");
      assert(events.some((e) => e.type === "planning_started"),   "planning_started");
      assert(events.some((e) => e.type === "planning_completed"), "planning_completed");
    }),

    // ── T17: Observabilidade — planning_failed ────────────────────────────
    run("T17 — Observabilidade: planning_failed para goal invalido", () => {
      const events: PlanningEvent[] = [];
      const unsub = engine.onEvent((e) => events.push(e));
      engine.plan(makeGoal("gmail.readInbox", { valid: false, validationErrors: Object.freeze(["err"]) }));
      unsub();
      assert(events.some((e) => e.type === "planning_failed"), "planning_failed must fire");
    }),

    // ── T18: Parametros do Goal propagados para steps ─────────────────────
    run("T18 — Goal parameters propagados para todos os steps", () => {
      const goal = makeGoal("gmail.readInbox", {
        parameters: Object.freeze({ maxResults: 25 }),
      });
      const { plan } = engine.plan(goal);
      for (const step of plan.steps) {
        assertEqual(
          step.params["maxResults"] as number,
          25,
          `step ${step.id} params.maxResults`,
        );
      }
    }),

    // ── T19: goalId reflete o id do goal original ─────────────────────────
    run("T19 — plan.goalId referencia o goal original", () => {
      const goal = makeGoal("calendar.listToday");
      const { plan } = engine.plan(goal);
      assertEqual(plan.goalId, goal.id, "goalId must match goal.id");
      assertEqual(plan.goalType, goal.type, "goalType must match goal.type");
    }),

    // ── T20: Metricas do engine ───────────────────────────────────────────
    run("T20 — Metricas acumuladas corretamente", () => {
      const e2 = new ConversationPlanningEngine();
      e2.plan(makeGoal("gmail.readInbox"));
      e2.plan(makeGoal("unknown"));
      e2.plan(makeGoal("gmail.readInbox", { valid: false, validationErrors: Object.freeze(["err"]) }));
      const m = e2.getMetrics();
      assertEqual(m.totalPlanned, 2, "totalPlanned");
      assertEqual(m.totalFailed,  1, "totalFailed");
    }),

  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    passed,
    failed,
    total:   results.length,
    results,
    verdict: failed === 0 ? "PASS" : "FAIL",
  };
}