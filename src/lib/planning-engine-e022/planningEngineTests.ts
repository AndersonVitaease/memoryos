/**
 * planningEngineTests.ts — Engineering Sprint E-02.2A
 * Deterministic test suite for ConversationPlanningEngine (normalized).
 *
 * Cobertura:
 * ✓ Planner gera apenas Capabilities (connector + capability)
 * ✓ Nao existe validate_session, summarize, noop nos steps
 * ✓ gmail.readInbox / searchMessages / readMessage
 * ✓ calendar.listToday / listTomorrow / createEvent
 * ✓ drive.searchFiles / openDocument
 * ✓ memory.query / memory.summarize
 * ✓ Goal desconhecido (unknown)  → empty plan
 * ✓ Goal invalido                → invalid_goal
 * ✓ ExecutionPlan imutavel
 * ✓ IDs unicos
 * ✓ Observabilidade: planning_started / planning_completed / planning_failed
 * ✓ Parametros do Goal propagados para os steps
 * ✓ GoalCapabilityRegistry funcionando
 * ✓ Sem regressoes
 */

import { ConversationPlanningEngine }  from "./ConversationPlanningEngine";
import { GoalCapabilityRegistry }      from "./GoalCapabilityRegistry";
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
  if (actual !== expected)
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
}

async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, error: null, durationMs: Date.now() - t0 }; }
  catch (e) { return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 }; }
}

let _gseq = 0;
function makeGoal(type: GoalType, overrides: Partial<ConversationGoal> = {}): ConversationGoal {
  return Object.freeze({
    id:               `test-goal-${++_gseq}`,
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

const INFRA_STEPS = ["validate_session", "summarize", "noop"];

function assertNoPlannerInfraSteps(steps: readonly { capability: string }[], label: string): void {
  for (const step of steps) {
    assert(
      !INFRA_STEPS.includes(step.capability),
      `${label}: step capability "${step.capability}" is an infra step — must not exist in Planner output`,
    );
  }
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

    // ── T01: GoalCapabilityRegistry tem builtins ──────────────────────────
    run("T01 — GoalCapabilityRegistry tem mappings registrados", () => {
      assert(GoalCapabilityRegistry.size > 0, "registry must have built-in mappings");
      const all = GoalCapabilityRegistry.listAll();
      const types = all.map((m) => m.goalType);
      assert(types.includes("gmail.readInbox"),    "gmail.readInbox registered");
      assert(types.includes("calendar.listToday"), "calendar.listToday registered");
      assert(types.includes("drive.searchFiles"),  "drive.searchFiles registered");
      assert(types.includes("memory.query"),       "memory.query registered");
    }),

    // ── T02: gmail.readInbox → 1 capability step (gmail/readInbox) ────────
    run("T02 — gmail.readInbox → connector=gmail, capability=readInbox", () => {
      const { plan } = engine.plan(makeGoal("gmail.readInbox"));
      assertEqual(plan.status, "planned", "status");
      assertEqual(plan.steps.length, 1, "exactly 1 step");
      assertEqual(plan.steps[0].connector,  "gmail",     "connector");
      assertEqual(plan.steps[0].capability, "readInbox", "capability");
      assertNoPlannerInfraSteps(plan.steps, "gmail.readInbox");
    }),

    // ── T03: gmail.searchMessages ─────────────────────────────────────────
    run("T03 — gmail.searchMessages → connector=gmail, capability=searchMessages", () => {
      const { plan } = engine.plan(makeGoal("gmail.searchMessages"));
      assertEqual(plan.steps[0].connector,  "gmail",          "connector");
      assertEqual(plan.steps[0].capability, "searchMessages", "capability");
      assertNoPlannerInfraSteps(plan.steps, "gmail.searchMessages");
    }),

    // ── T04: gmail.readMessage ────────────────────────────────────────────
    run("T04 — gmail.readMessage → connector=gmail, capability=readMessage", () => {
      const { plan } = engine.plan(makeGoal("gmail.readMessage"));
      assertEqual(plan.steps[0].capability, "readMessage", "capability");
      assertNoPlannerInfraSteps(plan.steps, "gmail.readMessage");
    }),

    // ── T05: calendar.listToday ───────────────────────────────────────────
    run("T05 — calendar.listToday → connector=calendar, capability=listToday", () => {
      const { plan } = engine.plan(makeGoal("calendar.listToday"));
      assertEqual(plan.steps[0].connector,  "calendar",  "connector");
      assertEqual(plan.steps[0].capability, "listToday", "capability");
      assertNoPlannerInfraSteps(plan.steps, "calendar.listToday");
    }),

    // ── T06: calendar.listTomorrow ────────────────────────────────────────
    run("T06 — calendar.listTomorrow → capability=listTomorrow", () => {
      const { plan } = engine.plan(makeGoal("calendar.listTomorrow"));
      assertEqual(plan.steps[0].capability, "listTomorrow", "capability");
      assertNoPlannerInfraSteps(plan.steps, "calendar.listTomorrow");
    }),

    // ── T07: calendar.createEvent ─────────────────────────────────────────
    run("T07 — calendar.createEvent → connector=calendar, capability=createEvent", () => {
      const { plan } = engine.plan(makeGoal("calendar.createEvent"));
      assertEqual(plan.steps[0].connector,  "calendar",    "connector");
      assertEqual(plan.steps[0].capability, "createEvent", "capability");
      assertNoPlannerInfraSteps(plan.steps, "calendar.createEvent");
    }),

    // ── T08: drive.searchFiles ────────────────────────────────────────────
    run("T08 — drive.searchFiles → connector=drive, capability=searchFiles", () => {
      const { plan } = engine.plan(makeGoal("drive.searchFiles"));
      assertEqual(plan.steps[0].connector,  "drive",       "connector");
      assertEqual(plan.steps[0].capability, "searchFiles", "capability");
      assertNoPlannerInfraSteps(plan.steps, "drive.searchFiles");
    }),

    // ── T09: drive.openDocument ───────────────────────────────────────────
    run("T09 — drive.openDocument → connector=drive, capability=openDocument", () => {
      const { plan } = engine.plan(makeGoal("drive.openDocument"));
      assertEqual(plan.steps[0].capability, "openDocument", "capability");
      assertNoPlannerInfraSteps(plan.steps, "drive.openDocument");
    }),

    // ── T10: memory.query ─────────────────────────────────────────────────
    run("T10 — memory.query → connector=memory, capability=query", () => {
      const { plan } = engine.plan(makeGoal("memory.query"));
      assertEqual(plan.steps[0].connector,  "memory", "connector");
      assertEqual(plan.steps[0].capability, "query",  "capability");
      assertNoPlannerInfraSteps(plan.steps, "memory.query");
    }),

    // ── T11: memory.summarize ─────────────────────────────────────────────
    run("T11 — memory.summarize → connector=memory, capability=summarize", () => {
      const { plan } = engine.plan(makeGoal("memory.summarize"));
      assertEqual(plan.steps[0].connector,  "memory",    "connector");
      // "summarize" here is the memory capability, not an infra step
      assertEqual(plan.steps[0].capability, "summarize", "capability");
    }),

    // ── T12: Goal unknown → empty plan ────────────────────────────────────
    run("T12 — unknown goal → empty plan, status=empty, success=true", () => {
      const { plan, success } = engine.plan(makeGoal("unknown"));
      assertEqual(plan.status, "empty", "status");
      assertEqual(plan.steps.length, 0, "no steps");
      assert(success, "unknown is a valid (empty) outcome");
    }),

    // ── T13: Goal invalido → invalid_goal ────────────────────────────────
    run("T13 — invalid goal → status=invalid_goal, success=false", () => {
      const goal = makeGoal("gmail.readInbox", {
        valid: false, validationErrors: Object.freeze(["userIntent is required"]),
      });
      const { plan, success, error } = engine.plan(goal);
      assertEqual(plan.status, "invalid_goal", "status");
      assert(!success, "must not succeed");
      assert(error !== null, "error required");
    }),

    // ── T14: general.conversation → empty plan (no infra steps) ──────────
    run("T14 — general.conversation → empty plan (no steps)", () => {
      const { plan } = engine.plan(makeGoal("general.conversation"));
      assertEqual(plan.steps.length, 0, "no steps — Runtime handles gracefully");
      assert(["planned", "empty"].includes(plan.status), "status must be planned or empty");
    }),

    // ── T15: ExecutionPlan imutavel ───────────────────────────────────────
    run("T15 — ExecutionPlan e imutavel", () => {
      const { plan } = engine.plan(makeGoal("gmail.readInbox"));
      let threw = false;
      try { (plan as Record<string, unknown>)["hacked"] = true; } catch { threw = true; }
      assert(threw || (plan as Record<string, unknown>)["hacked"] === undefined, "must be immutable");
    }),

    // ── T16: IDs unicos entre chamadas ────────────────────────────────────
    run("T16 — IDs de planos sao unicos", () => {
      const { plan: p1 } = engine.plan(makeGoal("gmail.readInbox"));
      const { plan: p2 } = engine.plan(makeGoal("gmail.readInbox"));
      assert(p1.id !== p2.id, "plan IDs must be unique");
    }),

    // ── T17: Observabilidade — planning_started + planning_completed ───────
    run("T17 — Observabilidade: planning_started + planning_completed", () => {
      const events: PlanningEvent[] = [];
      const unsub = engine.onEvent((e) => events.push(e));
      engine.plan(makeGoal("gmail.readInbox"));
      unsub();
      assert(events.some((e) => e.type === "planning_started"),   "planning_started");
      assert(events.some((e) => e.type === "planning_completed"), "planning_completed");
    }),

    // ── T18: Observabilidade — planning_failed ────────────────────────────
    run("T18 — Observabilidade: planning_failed para goal invalido", () => {
      const events: PlanningEvent[] = [];
      const unsub = engine.onEvent((e) => events.push(e));
      engine.plan(makeGoal("gmail.readInbox", {
        valid: false, validationErrors: Object.freeze(["err"]),
      }));
      unsub();
      assert(events.some((e) => e.type === "planning_failed"), "planning_failed must fire");
    }),

    // ── T19: Parametros do Goal propagados para steps ─────────────────────
    run("T19 — Goal parameters propagados para todos os steps", () => {
      const goal = makeGoal("gmail.readInbox", {
        parameters: Object.freeze({ maxResults: 25 }),
      });
      const { plan } = engine.plan(goal);
      for (const step of plan.steps) {
        assertEqual(step.parameters["maxResults"] as number, 25, `step ${step.id}`);
      }
    }),

    // ── T20: plan.goalId e goalType referenciam o goal original ──────────
    run("T20 — plan.goalId e goalType referenciam o goal", () => {
      const goal = makeGoal("calendar.listToday");
      const { plan } = engine.plan(goal);
      assertEqual(plan.goalId,   goal.id,   "goalId");
      assertEqual(plan.goalType, goal.type, "goalType");
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