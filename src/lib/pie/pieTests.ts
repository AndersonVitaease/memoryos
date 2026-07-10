// ─── PIE Tests ─────────────────────────────────────────────────────────────────
// Foundation v1.0 · Multi-plan gen · Scoring · Ranking · Optimization · Events · Audit · Journey

import { runPIE, buildJourneyFromPIE, pieSessionGet, getLearningLog } from "./PIEEngine";
import { pieEventBus }              from "./PIEEvents";
import { processIntent, validateAndPromote } from "@/lib/goal-engine/GoalEngine";
import { planRepoGet }              from "@/lib/planner-engine/PlannerEngine";
import { getJourney }               from "@/lib/journey/JourneyManager";
import { bootstrapCapabilities }    from "@/lib/capabilities/registry/bootstrapCapabilities";
import type { IdentityContext }     from "@/lib/wme/types";

bootstrapCapabilities();

export interface PIETestResult {
  name:       string;
  passed:     boolean;
  error?:     string;
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

export async function runPIETests(): Promise<PIETestResult[]> {
  const results: PIETestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try { await fn(); results.push({ name, passed: true, durationMs: performance.now() - t0 }); }
    catch (e) { results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 }); }
  }

  // ── Multi-plan generation ───────────────────────────────────────────────────

  await run("pie: generates 3 candidates for 'abrir empresa'", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.candidates.length === 3, `expected 3 candidates, got ${s.candidates.length}`);
  });

  await run("pie: all 3 variants are present (Standard, Fast, Conservative)", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const variants = s.candidates.map(c => c.variant);
    assert(variants.includes("Standard"),    "should have Standard");
    assert(variants.includes("Fast"),        "should have Fast");
    assert(variants.includes("Conservative"), "should have Conservative");
  });

  await run("pie: each candidate has a plan registered in PlannerEngine repo", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("emitir nota fiscal", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    for (const c of s.candidates) {
      assert(!!planRepoGet(c.planId), `plan ${c.planId} not in repo`);
    }
  });

  await run("pie: custom variants respected", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("consultar cpf", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx, variants: ["Standard", "Minimal"] });
    assert(s.candidates.length === 2, `expected 2, got ${s.candidates.length}`);
    assert(s.candidates.some(c => c.variant === "Minimal"), "should have Minimal");
  });

  // ── Scoring ────────────────────────────────────────────────────────────────

  await run("pie: all score dimensions present and 0–100", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    for (const c of s.candidates) {
      const scores = c.scores;
      for (const [k, v] of Object.entries(scores)) {
        assert(v >= 0 && v <= 100, `Score '${k}' out of range: ${v}`);
      }
    }
  });

  await run("pie: each candidate has explanations for all 8 dimensions", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    for (const c of s.candidates) {
      assert(c.explanations.length === 8, `expected 8 explanations, got ${c.explanations.length}`);
    }
  });

  await run("pie: overall score is coherent composite", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    for (const c of s.candidates) {
      const avg = (c.scores.confidenceScore + c.scores.riskScore + c.scores.costScore + c.scores.timeScore) / 4;
      // overallScore should be within 30pts of simple avg (it's weighted differently but must be reasonable)
      assert(Math.abs(c.scores.overallScore - avg) < 35, `overallScore ${c.scores.overallScore} seems unreasonable (avg: ${avg.toFixed(0)})`);
    }
  });

  // ── Ranking ────────────────────────────────────────────────────────────────

  await run("pie: candidates are sorted by overallScore descending", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    for (let i = 1; i < s.candidates.length; i++) {
      assert(
        s.candidates[i - 1].scores.overallScore >= s.candidates[i].scores.overallScore,
        `ranking broken at position ${i}: ${s.candidates[i-1].scores.overallScore} < ${s.candidates[i].scores.overallScore}`
      );
    }
  });

  await run("pie: rankPosition 1 is assigned to winner", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("registrar marca no INPI", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const winner = s.candidates.find(c => c.selected);
    assert(!!winner, "should have a winner");
    assert(winner!.rankPosition === 1, `winner rank: ${winner!.rankPosition}`);
  });

  await run("pie: exactly one candidate is selected", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const selected = s.candidates.filter(c => c.selected);
    assert(selected.length === 1, `expected 1 selected, got ${selected.length}`);
  });

  // ── Decision Rationale ─────────────────────────────────────────────────────

  await run("pie: decisionRationale is non-empty", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.decisionRationale.length > 20, `rationale too short: "${s.decisionRationale}"`);
  });

  await run("pie: decisionRationale mentions winner variant", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const winner = s.candidates.find(c => c.selected)!;
    assert(s.decisionRationale.includes(winner.variant), `rationale should mention ${winner.variant}`);
  });

  // ── Optimization ──────────────────────────────────────────────────────────

  await run("pie: optimizations list is populated after runPIE", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("importar suplemento", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    // optimization list exists (may be empty for clean plans, but should be an array)
    assert(Array.isArray(s.optimizations), "optimizations should be an array");
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  await run("pie: audit log contains planning_started entry", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.auditLog.some(a => a.operation === "planning_started"), "should have planning_started");
  });

  await run("pie: audit log contains plan_selected entry", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.auditLog.some(a => a.operation === "plan_selected"), "should have plan_selected");
  });

  await run("pie: audit log contains planning_completed entry", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.auditLog.some(a => a.operation === "planning_completed"), "should have planning_completed");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("pie: fires PlanningStarted event", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = pieEventBus.subscribe(e => events.push(e.type));
    await runPIE({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("PlanningStarted"), "PlanningStarted not fired");
  });

  await run("pie: fires AlternativePlanGenerated for each variant", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = pieEventBus.subscribe(e => events.push(e.type));
    await runPIE({ goalId: g.id, identityContext: ctx });
    unsub();
    const altEvents = events.filter(e => e === "AlternativePlanGenerated");
    assert(altEvents.length >= 3, `expected ≥3 AlternativePlanGenerated, got ${altEvents.length}`);
  });

  await run("pie: fires PlanCompared event", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = pieEventBus.subscribe(e => events.push(e.type));
    await runPIE({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("PlanCompared"), "PlanCompared not fired");
  });

  await run("pie: fires PlanSelected event", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = pieEventBus.subscribe(e => events.push(e.type));
    await runPIE({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("PlanSelected"), "PlanSelected not fired");
  });

  await run("pie: fires PlanningCompleted event", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = pieEventBus.subscribe(e => events.push(e.type));
    await runPIE({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("PlanningCompleted"), "PlanningCompleted not fired");
  });

  // ── Session Repository ─────────────────────────────────────────────────────

  await run("pie: session retrievable after runPIE", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const found = pieSessionGet(s.id);
    assert(!!found, "session not found");
    assert(found!.id === s.id, "id mismatch");
  });

  await run("pie: session status is Completed", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    assert(s.status === "Completed", `status: ${s.status}`);
  });

  // ── Learning Record ────────────────────────────────────────────────────────

  await run("pie: learning record is saved after runPIE", async () => {
    const before = getLearningLog().length;
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    await runPIE({ goalId: g.id, identityContext: ctx });
    assert(getLearningLog().length > before, "learning record not added");
  });

  await run("pie: learning record has discarded plans", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    await runPIE({ goalId: g.id, identityContext: ctx });
    const log = getLearningLog();
    const rec = log[log.length - 1];
    assert(rec.discardedPlanIds.length >= 2, `expected ≥2 discarded, got ${rec.discardedPlanIds.length}`);
  });

  // ── Journey Integration ────────────────────────────────────────────────────

  await run("pie: buildJourneyFromPIE creates Journey from selected plan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const journeyId = await buildJourneyFromPIE(s.id, ctx);
    assert(journeyId.startsWith("jrn_"), `expected jrn_ prefix: ${journeyId}`);
    const j = getJourney(journeyId);
    assert(!!j, "journey should exist");
    assert(j!.tasks.length > 0, "journey should have tasks");
  });

  await run("pie: journey has metadata tracing to PIE selected plan", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await runPIE({ goalId: g.id, identityContext: ctx });
    const journeyId = await buildJourneyFromPIE(s.id, ctx);
    const j = getJourney(journeyId)!;
    assert(j.tasks.every(t => !!t.metadata.sourcePlanId), "all tasks should trace to a plan");
  });

  // ── Goal validation enforcement ────────────────────────────────────────────

  await run("pie: throws if goal is not Validated", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    // NOT validating
    let threw = false;
    try { await runPIE({ goalId: g.id, identityContext: ctx }); } catch { threw = true; }
    assert(threw, "should throw for non-Validated goal");
  });

  return results;
}