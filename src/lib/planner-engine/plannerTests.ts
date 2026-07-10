// ─── Planner Engine Tests ──────────────────────────────────────────────────────
// Foundation v1.0 · Decomposer · Validator · Repository · Events · Journey integration

import {
  createPlan, validateAndApprovePlan, buildJourneyFromPlan,
  validatePlan, planRepoGet, planRepoList, planRepoSearch, planRepoArchive,
} from "./PlannerEngine";
import { plannerEventBus }       from "./PlannerEvents";
import { processIntent, validateAndPromote } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { getJourney }            from "@/lib/journey/JourneyManager";
import type { IdentityContext }  from "@/lib/wme/types";

bootstrapCapabilities();

export interface PlannerTestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion: ${msg}`);
}

function makeCtx(s = `${Date.now()}`): IdentityContext {
  return { userId: `u_${s}`, projectId: `p_${s}`, sessionId: `sess_${s}` };
}

async function makeValidatedGoal(intent: string, ctx: IdentityContext) {
  const g = await processIntent({ userIntent: intent, identityContext: ctx });
  await validateAndPromote(g.id);
  return g;
}

export async function runPlannerTests(): Promise<PlannerTestResult[]> {
  const results: PlannerTestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try { await fn(); results.push({ name, passed: true, durationMs: performance.now() - t0 }); }
    catch (e) { results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 }); }
  }

  // ── Plan Creation (Decomposer) ────────────────────────────────────────────

  await run("decomposer: creates plan from 'abrir empresa' goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.id.startsWith("plan_"), `id prefix wrong: ${p.id}`);
    assert(p.goalId === g.id, "goalId mismatch");
    assert(p.steps.length >= 5, `expected ≥5 steps, got ${p.steps.length}`);
    assert(p.status === "Draft", `expected Draft, got ${p.status}`);
    assert(p.risks.length > 0, "should have risks");
  });

  await run("decomposer: creates plan from 'nota fiscal' goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("emitir nota fiscal", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.steps.length >= 4, `expected ≥4 steps, got ${p.steps.length}`);
    assert(p.executionStrategy === "Sequential", `strategy: ${p.executionStrategy}`);
  });

  await run("decomposer: creates plan from 'consultar cpf' goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("consultar cpf", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.steps.length >= 2, `expected ≥2 steps, got ${p.steps.length}`);
    assert(p.executionStrategy === "Automatic", `strategy: ${p.executionStrategy}`);
  });

  await run("decomposer: creates plan from 'registrar marca' goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("registrar marca no INPI", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.steps.length >= 5, `expected ≥5 steps, got ${p.steps.length}`);
    assert(p.risks.some(r => r.level === "Critical"), "should have Critical risk");
  });

  await run("decomposer: creates plan from 'importar suplemento' goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("importar suplemento", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.estimatedCost === "Alto", `expected Alto, got ${p.estimatedCost}`);
    assert(p.steps.length >= 6, `expected ≥6 steps, got ${p.steps.length}`);
  });

  await run("decomposer: generic fallback for unknown goal", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("resolver algo completamente desconhecido xyzabc", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.steps.length >= 3, `fallback should have ≥3 steps, got ${p.steps.length}`);
  });

  await run("decomposer: sequential steps have wired dependencies", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    // step[1] should depend on step[0]
    assert(p.steps[1].dependencies.includes(p.steps[0].id), "step[1] should depend on step[0]");
  });

  await run("decomposer: requires Validated goal", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx }); // Draft, not Validated
    let threw = false;
    try { await createPlan(g.id, ctx); } catch { threw = true; }
    assert(threw, "should throw for non-Validated goal");
  });

  // ── Plan Validator ────────────────────────────────────────────────────────

  await run("validator: valid plan passes", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const { valid, errors } = validatePlan(p);
    assert(valid, `should be valid: ${errors.join(", ")}`);
  });

  await run("validator: plan without steps fails", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const empty = { ...p, steps: [] };
    const { valid, errors } = validatePlan(empty);
    assert(!valid, "should be invalid");
    assert(errors.some(e => e.includes("step")), "should mention steps");
  });

  await run("validator: step with invalid dependency is caught", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    p.steps[0].dependencies = ["nonexistent-step-id"];
    const { valid, errors } = validatePlan(p);
    assert(!valid, "should be invalid");
    assert(errors.some(e => e.includes("unknown dependency")), "should mention unknown dep");
  });

  await run("validator: self-referencing step is caught as cycle", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    p.steps[0].dependencies = [p.steps[0].id];
    const { valid, errors } = validatePlan(p);
    assert(!valid, "should detect cycle");
    assert(errors.some(e => e.includes("cycle")), "should mention cycle");
  });

  // ── validateAndApprovePlan ────────────────────────────────────────────────

  await run("validate: approved plan transitions to Validated", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const { plan, validation } = validateAndApprovePlan(p.id);
    assert(plan.status === "Validated", `expected Validated, got ${plan.status}`);
    assert(validation.valid, "validation should pass");
  });

  await run("validate: fires PlanValidated event", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("emitir nota fiscal", ctx);
    const p   = await createPlan(g.id, ctx);
    const events: string[] = [];
    const unsub = plannerEventBus.subscribe(e => events.push(e.type));
    validateAndApprovePlan(p.id);
    unsub();
    assert(events.includes("PlanValidated"), "should fire PlanValidated");
  });

  // ── Repository ────────────────────────────────────────────────────────────

  await run("repository: planRepoList grows after createPlan", async () => {
    const before = planRepoList().length;
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    await createPlan(g.id, ctx);
    assert(planRepoList().length > before, "list should grow");
  });

  await run("repository: planRepoGet retrieves by id", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const found = planRepoGet(p.id);
    assert(!!found, "should find plan");
    assert(found!.id === p.id, "id should match");
  });

  await run("repository: planRepoSearch finds by title", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const r   = planRepoSearch("Abertura");
    assert(r.some(x => x.id === p.id), "should find by title keyword");
  });

  await run("repository: planRepoArchive sets Archived status", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("consultar cpf", ctx);
    const p   = await createPlan(g.id, ctx);
    planRepoArchive(p.id);
    assert(p.status === "Archived", "should be Archived");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("events: PlanCreated fires on createPlan", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = plannerEventBus.subscribe(e => events.push(e.type));
    await createPlan(g.id, ctx);
    unsub();
    assert(events.includes("PlanCreated"), "should fire PlanCreated");
  });

  await run("events: PlanArchived fires on planRepoArchive", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    const unsub = plannerEventBus.subscribe(e => events.push(e.type));
    planRepoArchive(p.id);
    unsub();
    assert(events.includes("PlanArchived"), "should fire PlanArchived");
  });

  await run("events: getHistory filters by planId", async () => {
    const ctx = makeCtx();
    const g1  = await makeValidatedGoal("abrir empresa", ctx);
    const g2  = await makeValidatedGoal("emitir nota fiscal", makeCtx());
    const p1  = await createPlan(g1.id, ctx);
    await createPlan(g2.id, makeCtx());
    const h = plannerEventBus.getHistory(p1.id);
    assert(h.every(e => e.planId === p1.id), "history should only have p1 events");
  });

  // ── JourneyBuilder integration ────────────────────────────────────────────

  await run("journey: buildJourneyFromPlan creates Journey from Validated Plan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    validateAndApprovePlan(p.id);
    const journeyId = await buildJourneyFromPlan(p.id, ctx);
    assert(journeyId.startsWith("jrn_"), `expected jrn_ prefix, got: ${journeyId}`);
    const j = getJourney(journeyId);
    assert(!!j, "journey should exist");
    assert(j!.tasks.length === p.steps.length, `tasks should match steps: ${j!.tasks.length} vs ${p.steps.length}`);
    assert(p.journeyId === journeyId, "plan.journeyId should be set");
    assert(p.status === "ConvertedToJourney", `plan status: ${p.status}`);
  });

  await run("journey: buildJourneyFromPlan fires PlanConvertedToJourney event", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("emitir nota fiscal", ctx);
    const p   = await createPlan(g.id, ctx);
    validateAndApprovePlan(p.id);
    const events: string[] = [];
    const unsub = plannerEventBus.subscribe(e => events.push(e.type));
    await buildJourneyFromPlan(p.id, ctx);
    unsub();
    assert(events.includes("PlanConvertedToJourney"), "should fire PlanConvertedToJourney");
  });

  await run("journey: buildJourneyFromPlan requires Validated status", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    // NOT calling validateAndApprovePlan — status is Draft
    let threw = false;
    try { await buildJourneyFromPlan(p.id, ctx); } catch { threw = true; }
    assert(threw, "should throw if plan is not Validated");
  });

  await run("journey: each task references source planId and stepId", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    validateAndApprovePlan(p.id);
    const journeyId = await buildJourneyFromPlan(p.id, ctx);
    const j = getJourney(journeyId)!;
    assert(j.tasks.every(t => t.metadata.sourcePlanId === p.id), "every task should trace to plan");
    assert(j.tasks.every(t => !!t.metadata.stepId), "every task should have stepId");
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  await run("audit: created audit entry on createPlan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    assert(p.auditLog.some(a => a.operation === "created"), "should have created audit entry");
  });

  await run("audit: validated audit entry on validateAndApprovePlan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    validateAndApprovePlan(p.id);
    assert(p.auditLog.some(a => a.operation === "validated"), "should have validated audit entry");
  });

  await run("audit: converted_to_journey audit entry on buildJourneyFromPlan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const p   = await createPlan(g.id, ctx);
    validateAndApprovePlan(p.id);
    await buildJourneyFromPlan(p.id, ctx);
    assert(p.auditLog.some(a => a.operation === "converted_to_journey"), "should record conversion");
  });

  return results;
}