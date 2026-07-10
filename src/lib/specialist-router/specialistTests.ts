// ─── Specialist Router Tests ────────────────────────────────────────────────────
// Foundation v1.0 · Discovery · Matching · Ranking · Selection · Collaboration · Events · Audit

import { routeSpecialists, routingSessionGet, routingSessionList } from "./SpecialistRouter";
import { bootstrapSpecialists, getSpecialistCatalog } from "./SpecialistCatalog";
import { routingEventBus }  from "./SpecialistEvents";
import { globalCapabilityRegistry } from "@/lib/capabilities/registry/CapabilityRegistry";
import { processIntent, validateAndPromote } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities }   from "@/lib/capabilities/registry/bootstrapCapabilities";
import type { IdentityContext }    from "@/lib/wme/types";

bootstrapCapabilities();
bootstrapSpecialists();

export interface SRTestResult {
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

export async function runSpecialistTests(): Promise<SRTestResult[]> {
  const results: SRTestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try { await fn(); results.push({ name, passed: true, durationMs: performance.now() - t0 }); }
    catch (e) { results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 }); }
  }

  // ── Catalog & Registry ────────────────────────────────────────────────────

  await run("catalog: all specialists registered in Capability Registry", () => {
    const catalog = getSpecialistCatalog();
    for (const s of catalog) {
      assert(globalCapabilityRegistry.has(s.id), `${s.id} not in registry`);
    }
  });

  await run("catalog: specialists discoverable as type=Specialist", () => {
    const found = globalCapabilityRegistry.discover({ type: "Specialist" });
    assert(found.length >= 8, `expected ≥8 specialists, got ${found.length}`);
  });

  await run("catalog: each specialist has required contract fields", () => {
    for (const s of getSpecialistCatalog()) {
      assert(!!s.id,          `${s.name}: missing id`);
      assert(!!s.domain,      `${s.name}: missing domain`);
      assert(s.confidenceLevel >= 0 && s.confidenceLevel <= 1, `${s.name}: confidenceLevel out of range`);
      assert(Array.isArray(s.capabilities),     `${s.name}: capabilities not array`);
      assert(Array.isArray(s.supportedGoals),   `${s.name}: supportedGoals not array`);
      assert(Array.isArray(s.tags),             `${s.name}: tags not array`);
    }
  });

  // ── Discovery ─────────────────────────────────────────────────────────────

  await run("discovery: routeSpecialists finds matches for 'abrir empresa'", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(s.matches.length > 0, "should find at least one match");
  });

  await run("discovery: specialist_juridico matched for 'abrir empresa'", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    const juridico = s.matches.find(m => m.specialist.id === "specialist_juridico");
    assert(!!juridico, "specialist_juridico should be in matches");
  });

  await run("discovery: specialist_anvisa matched for 'importar suplemento'", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("importar suplemento", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    const anvisa = s.matches.find(m => m.specialist.id === "specialist_anvisa");
    assert(!!anvisa, "specialist_anvisa should be in matches");
  });

  await run("discovery: specialist_tributario matched for 'irpf'", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("declaração IRPF", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    const trib = s.matches.find(m => m.specialist.id === "specialist_tributario");
    assert(!!trib, "specialist_tributario should be in matches for IRPF");
  });

  // ── Scoring ────────────────────────────────────────────────────────────────

  await run("scoring: all 8 score dimensions present per match", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    for (const m of s.matches) {
      const dims = Object.keys(m.scores);
      assert(dims.length === 8, `expected 8 dimensions, got ${dims.length}`);
    }
  });

  await run("scoring: all score values are 0–100", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    for (const m of s.matches) {
      for (const [k, v] of Object.entries(m.scores)) {
        assert(v >= 0 && v <= 100, `Score ${k}=${v} out of range for ${m.specialist.name}`);
      }
    }
  });

  await run("scoring: each match has 8 score explanations", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    for (const m of s.matches) {
      assert(m.explanations.length === 8, `${m.specialist.name}: expected 8 explanations, got ${m.explanations.length}`);
    }
  });

  // ── Ranking ────────────────────────────────────────────────────────────────

  await run("ranking: matches sorted by overallScore descending", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    for (let i = 1; i < s.matches.length; i++) {
      assert(
        s.matches[i - 1].scores.overallScore >= s.matches[i].scores.overallScore,
        `ranking broken at ${i}: ${s.matches[i-1].scores.overallScore} < ${s.matches[i].scores.overallScore}`
      );
    }
  });

  await run("ranking: rankPosition is sequential starting from 1", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    s.matches.forEach((m, i) => assert(m.rankPosition === i + 1, `rankPosition ${m.rankPosition} != ${i + 1}`));
  });

  // ── Selection ─────────────────────────────────────────────────────────────

  await run("selection: at least one specialist selected", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(s.selected.length > 0, "should select at least one");
  });

  await run("selection: selected specialists have rationale", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    for (const m of s.selected) {
      assert(m.rationale.length > 10, `${m.specialist.name}: rationale too short`);
    }
  });

  await run("selection: Single mode returns exactly 1", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Single" });
    assert(s.selected.length === 1, `Single mode should select 1, got ${s.selected.length}`);
    assert(s.selectionMode === "Single", `mode: ${s.selectionMode}`);
  });

  await run("selection: Multi mode returns >1 when specialists available", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Multi" });
    assert(s.selected.length > 1, `Multi mode should select >1, got ${s.selected.length}`);
  });

  // ── Collaboration ──────────────────────────────────────────────────────────

  await run("collaboration: 'importar suplemento' selects multiple specialists", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("importar suplemento", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Collaborative" });
    assert(s.selected.length >= 2, `expected ≥2 selected for complex goal, got ${s.selected.length}`);
  });

  await run("collaboration: orchestration steps cover all selected specialists", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("importar suplemento", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Collaborative" });
    const orchIds = new Set(s.orchestration.map(o => o.specialistId));
    for (const sel of s.selected) {
      assert(orchIds.has(sel.specialist.id), `${sel.specialist.id} missing from orchestration`);
    }
  });

  await run("collaboration: Parallel mode — all steps have order 1", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Parallel" });
    assert(s.orchestration.every(o => o.order === 1), "parallel steps should all be order 1");
    assert(s.orchestration.every(o => o.mode === "parallel"), "all should be parallel mode");
  });

  await run("collaboration: Sequential mode — deps chain is correct", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Sequential" });
    const steps = s.orchestration;
    if (steps.length > 1) {
      assert(steps[0].dependsOn.length === 0, "first step should have no deps");
      assert(steps[1].dependsOn.length === 1, "second step should depend on first");
    }
  });

  // ── Events ─────────────────────────────────────────────────────────────────

  await run("events: SpecialistDiscoveryStarted fires", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = routingEventBus.subscribe(e => events.push(e.type));
    await routeSpecialists({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("SpecialistDiscoveryStarted"), "SpecialistDiscoveryStarted not fired");
  });

  await run("events: SpecialistMatched fires for each specialist", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = routingEventBus.subscribe(e => events.push(e.type));
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    unsub();
    const matchEvents = events.filter(e => e === "SpecialistMatched");
    assert(matchEvents.length === s.matches.length, `expected ${s.matches.length} SpecialistMatched events, got ${matchEvents.length}`);
  });

  await run("events: SpecialistRanked fires", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = routingEventBus.subscribe(e => events.push(e.type));
    await routeSpecialists({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("SpecialistRanked"), "SpecialistRanked not fired");
  });

  await run("events: SpecialistSelected fires for each selected", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = routingEventBus.subscribe(e => events.push(e.type));
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    unsub();
    const selEvents = events.filter(e => e === "SpecialistSelected");
    assert(selEvents.length === s.selected.length, `expected ${s.selected.length} SpecialistSelected, got ${selEvents.length}`);
  });

  await run("events: RoutingCompleted fires", async () => {
    const events: string[] = [];
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const unsub = routingEventBus.subscribe(e => events.push(e.type));
    await routeSpecialists({ goalId: g.id, identityContext: ctx });
    unsub();
    assert(events.includes("RoutingCompleted"), "RoutingCompleted not fired");
  });

  // ── Audit ──────────────────────────────────────────────────────────────────

  await run("audit: routing_started entry present", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(s.auditLog.some(a => a.operation === "routing_started"), "should have routing_started");
  });

  await run("audit: routing_completed entry present", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(s.auditLog.some(a => a.operation === "routing_completed"), "should have routing_completed");
  });

  await run("audit: specialist_selected entries match selection count", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    const auditSel = s.auditLog.filter(a => a.operation === "specialist_selected");
    assert(auditSel.length === s.selected.length, `audit entries ${auditSel.length} != selected ${s.selected.length}`);
  });

  // ── Session repository ─────────────────────────────────────────────────────

  await run("repository: session retrievable after routing", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(!!routingSessionGet(s.id), "session should be retrievable");
  });

  await run("repository: session status is Completed", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx });
    assert(s.status === "Completed", `status: ${s.status}`);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  await run("validation: throws for non-Validated goal", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    let threw = false;
    try { await routeSpecialists({ goalId: g.id, identityContext: ctx }); } catch { threw = true; }
    assert(threw, "should throw for non-Validated goal");
  });

  // ── topN limit ────────────────────────────────────────────────────────────

  await run("topN: respects topN=2 limit", async () => {
    const ctx = makeCtx();
    const g   = await makeValidatedGoal("abrir empresa", ctx);
    const s   = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Multi", topN: 2 });
    assert(s.selected.length <= 2, `should respect topN=2, got ${s.selected.length}`);
  });

  return results;
}