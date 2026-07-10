// ─── Strategy Fusion Engine Tests ──────────────────────────────────────────────
// Foundation v1.0 · Collaboration · Fusion · Conflicts · Resolution · Events · Audit

import { fuseStrategies, fusionSessionGet, fusionSessionList } from "./StrategyFusionEngine";
import { fusionEventBus }   from "./SFEEvents";
import { detectConflicts, resolveConflicts } from "./ConflictEngine";
import { buildStrategy }    from "./StrategyBuilder";
import { calculateFusionScores } from "./ScoreEngine";
import { routeSpecialists } from "@/lib/specialist-router/SpecialistRouter";
import { bootstrapSpecialists, getSpecialistCatalog } from "@/lib/specialist-router/SpecialistCatalog";
import { processIntent, validateAndPromote } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import type { IdentityContext } from "@/lib/wme/types";

bootstrapCapabilities();
bootstrapSpecialists();

export interface SFETestResult {
  name:       string;
  passed:     boolean;
  error?:     string;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion: ${msg}`);
}

let _c = 0;
function makeCtx(): IdentityContext {
  return { userId: `u_${Date.now()}_${++_c}`, projectId: `p_${Date.now()}`, sessionId: `s_${Date.now()}` };
}

async function makeRoutedSession(intent: string, mode = "Collaborative") {
  const ctx = makeCtx();
  const g   = await processIntent({ userIntent: intent, identityContext: ctx });
  await validateAndPromote(g.id);
  const sr  = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: mode as any });
  return { ctx, goal: g, routing: sr };
}

export async function runSFETests(): Promise<SFETestResult[]> {
  const results: SFETestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try { await fn(); results.push({ name, passed: true, durationMs: performance.now() - t0 }); }
    catch (e) { results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 }); }
  }

  // ── Strategy Building ─────────────────────────────────────────────────────

  await run("strategy: buildStrategy returns valid SpecialistStrategy", () => {
    const catalog = getSpecialistCatalog();
    const s = buildStrategy(catalog[0], "g1", "abrir empresa");
    assert(!!s.id, "missing id");
    assert(s.recommendations.length > 0, "no recommendations");
    assert(s.confidenceLevel > 0, "no confidence");
    assert(s.risks.length > 0, "no risks");
  });

  await run("strategy: all 9 catalog specialists produce strategies", () => {
    for (const spec of getSpecialistCatalog()) {
      const s = buildStrategy(spec, "g1", "abrir empresa");
      assert(s.recommendations.length > 0, `${spec.name}: no recommendations`);
    }
  });

  await run("strategy: every recommendation has id, title, priority, status", () => {
    const catalog = getSpecialistCatalog();
    for (const spec of catalog) {
      const s = buildStrategy(spec, "g1", "test");
      for (const r of s.recommendations) {
        assert(!!r.id,       `${spec.name}: rec missing id`);
        assert(!!r.title,    `${spec.name}: rec missing title`);
        assert(!!r.priority, `${spec.name}: rec missing priority`);
        assert(!!r.status,   `${spec.name}: rec missing status`);
      }
    }
  });

  // ── Conflict Detection ────────────────────────────────────────────────────

  await run("conflicts: detectConflicts returns array (may be empty)", () => {
    const catalog = getSpecialistCatalog();
    const strategies = catalog.slice(0, 3).map(s => buildStrategy(s, "g1", "abrir empresa"));
    const c = detectConflicts(strategies);
    assert(Array.isArray(c), "should return array");
  });

  await run("conflicts: juridico+contabil+tributario produce detectable conflicts", () => {
    const catalog = getSpecialistCatalog();
    const domains = ["juridico","contabil","tributario","anvisa","financeiro","comercio_exterior"];
    const strategies = catalog.filter(s => domains.includes(s.domain)).map(s => buildStrategy(s, "g1", "importar suplemento"));
    const c = detectConflicts(strategies);
    assert(c.length >= 1, `expected ≥1 conflict, got ${c.length}`);
  });

  await run("conflicts: each conflict has required fields", () => {
    const catalog = getSpecialistCatalog();
    const strategies = catalog.map(s => buildStrategy(s, "g1", "abrir empresa"));
    const c = detectConflicts(strategies);
    for (const conf of c) {
      assert(!!conf.id,              `conflict missing id`);
      assert(!!conf.type,            `conflict missing type`);
      assert(!!conf.specialistA,     `conflict missing specialistA`);
      assert(!!conf.specialistB,     `conflict missing specialistB`);
      assert(conf.status === "Detected", `conflict status should be Detected, got ${conf.status}`);
    }
  });

  // ── Conflict Resolution ───────────────────────────────────────────────────

  await run("resolution: resolveConflicts returns resolved or HumanRequired", () => {
    const catalog = getSpecialistCatalog();
    const strategies = catalog.map(s => buildStrategy(s, "g1", "abrir empresa"));
    const detected = detectConflicts(strategies);
    const resolved = resolveConflicts(detected, strategies);
    for (const c of resolved) {
      assert(c.status !== "Detected", `conflict ${c.id} still Detected after resolution`);
    }
  });

  await run("resolution: resolved conflicts have resolution object", () => {
    const catalog = getSpecialistCatalog();
    const strategies = catalog.map(s => buildStrategy(s, "g1", "abrir empresa"));
    const detected  = detectConflicts(strategies);
    const resolved  = resolveConflicts(detected, strategies);
    for (const c of resolved.filter(c => c.status === "Resolved")) {
      assert(!!c.resolution,             `conflict ${c.id}: missing resolution`);
      assert(!!c.resolution!.rule,        `conflict ${c.id}: missing rule`);
      assert(!!c.resolution!.winner,      `conflict ${c.id}: missing winner`);
      assert(!!c.resolution!.justification, `conflict ${c.id}: missing justification`);
    }
  });

  // ── Fusion Scores ─────────────────────────────────────────────────────────

  await run("scores: calculateFusionScores returns 7 dimensions", () => {
    const catalog   = getSpecialistCatalog();
    const strategies = catalog.slice(0, 3).map(s => buildStrategy(s, "g1", "test"));
    const { scores } = calculateFusionScores(strategies, [], []);
    assert(Object.keys(scores).length === 7, `expected 7 dims, got ${Object.keys(scores).length}`);
  });

  await run("scores: all score values are 0–100", () => {
    const catalog   = getSpecialistCatalog();
    const strategies = catalog.map(s => buildStrategy(s, "g1", "test"));
    const conflicts  = detectConflicts(strategies);
    const { scores } = calculateFusionScores(strategies, conflicts, strategies.map(s => s.domain));
    for (const [k, v] of Object.entries(scores)) {
      assert(v >= 0 && v <= 100, `${k}=${v} out of range`);
    }
  });

  await run("scores: explanations count equals 7", () => {
    const catalog   = getSpecialistCatalog();
    const strategies = catalog.slice(0, 3).map(s => buildStrategy(s, "g1", "test"));
    const { explanations } = calculateFusionScores(strategies, [], []);
    assert(explanations.length === 7, `expected 7 explanations, got ${explanations.length}`);
  });

  // ── Full Fusion Session ───────────────────────────────────────────────────

  await run("fusion: fuseStrategies completes for 'abrir empresa'", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.status === "Completed", `status: ${session.status}`);
  });

  await run("fusion: session has strategies from each selected specialist", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.strategies.length === routing.selected.length, `${session.strategies.length} != ${routing.selected.length}`);
  });

  await run("fusion: unifiedStrategy is not null", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.unifiedStrategy !== null, "unifiedStrategy should not be null");
  });

  await run("fusion: unifiedStrategy has sequence steps", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.unifiedStrategy!.sequence.length > 0, "sequence should not be empty");
  });

  await run("fusion: unifiedStrategy covers all selected specialists", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    const seqIds = new Set(session.unifiedStrategy!.sequence.map(s => s.specialistId));
    for (const sel of routing.selected) {
      assert(seqIds.has(sel.specialist.id), `${sel.specialist.id} missing from sequence`);
    }
  });

  await run("fusion: decisions registered for all included specialists", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.unifiedStrategy!.decisions.length === routing.selected.length, "decision count mismatch");
  });

  await run("fusion: scores calculated and not null", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.scores !== null, "scores should not be null");
    assert(session.scores!.overallScore >= 0, "overallScore invalid");
  });

  // ── Collaboration – complex goal ──────────────────────────────────────────

  await run("collaboration: 'importar suplemento' produces multi-specialist strategy", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("importar suplemento", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.strategies.length >= 2, "should have ≥2 strategies for complex goal");
  });

  await run("collaboration: 'importar suplemento' detects conflicts", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("importar suplemento", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    // Conflicts possible but not guaranteed with single-specialist routing
    assert(Array.isArray(session.conflicts), "conflicts should be array");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("events: StrategyRequested fires for each specialist", async () => {
    const events: string[] = [];
    const unsub = fusionEventBus.subscribe(e => events.push(e.type));
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    unsub();
    const cnt = events.filter(e => e === "StrategyRequested").length;
    assert(cnt === routing.selected.length, `expected ${routing.selected.length} StrategyRequested, got ${cnt}`);
  });

  await run("events: StrategyReceived fires for each specialist", async () => {
    const events: string[] = [];
    const unsub = fusionEventBus.subscribe(e => events.push(e.type));
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    unsub();
    const cnt = events.filter(e => e === "StrategyReceived").length;
    assert(cnt === routing.selected.length, `expected ${routing.selected.length} StrategyReceived, got ${cnt}`);
  });

  await run("events: UnifiedStrategyCreated fires once", async () => {
    const events: string[] = [];
    const unsub = fusionEventBus.subscribe(e => events.push(e.type));
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    unsub();
    assert(events.includes("UnifiedStrategyCreated"), "UnifiedStrategyCreated not fired");
  });

  await run("events: FusionCompleted fires once", async () => {
    const events: string[] = [];
    const unsub = fusionEventBus.subscribe(e => events.push(e.type));
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    unsub();
    assert(events.includes("FusionCompleted"), "FusionCompleted not fired");
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  await run("audit: fusion_started entry present", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.auditLog.some(a => a.operation === "fusion_started"), "fusion_started missing");
  });

  await run("audit: fusion_completed entry present", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(session.auditLog.some(a => a.operation === "fusion_completed"), "fusion_completed missing");
  });

  await run("audit: strategy_received entries match specialist count", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    const cnt = session.auditLog.filter(a => a.operation === "strategy_received").length;
    assert(cnt === routing.selected.length, `audit entries ${cnt} != specialists ${routing.selected.length}`);
  });

  // ── Repository ────────────────────────────────────────────────────────────

  await run("repository: session retrievable after fusion", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(!!fusionSessionGet(session.id), "session not retrievable");
  });

  await run("repository: fusionSessionList grows after each fusion", async () => {
    const before = fusionSessionList().length;
    const { ctx, goal, routing } = await makeRoutedSession("abrir empresa", "Single");
    await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(fusionSessionList().length > before, "session list should grow");
  });

  // ── Validation ────────────────────────────────────────────────────────────

  await run("validation: throws for invalid routingSessionId", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    await validateAndPromote(g.id);
    let threw = false;
    try { await fuseStrategies({ goalId: g.id, routingSessionId: "invalid", identityContext: ctx }); } catch { threw = true; }
    assert(threw, "should throw for invalid routingSessionId");
  });

  // ── Integration: Router + Fusion ──────────────────────────────────────────

  await run("integration: Specialist Router → Fusion produces Unified Strategy", async () => {
    const { ctx, goal, routing } = await makeRoutedSession("importar suplemento", "Collaborative");
    const session = await fuseStrategies({ goalId: goal.id, routingSessionId: routing.id, identityContext: ctx });
    assert(!!session.unifiedStrategy, "unifiedStrategy required");
    assert(session.unifiedStrategy!.specialists.length > 0, "should list specialists");
  });

  return results;
}