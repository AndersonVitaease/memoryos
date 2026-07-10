// ─── Specialist Router ─────────────────────────────────────────────────────────
// Foundation v1.0 · Discovery · Matching · Ranking · Selection · Orchestration

import type {
  SpecialistContract, SpecialistMatch, SpecialistScores, ScoreExplanation,
  OrchestrationStep, RoutingSession, SelectionMode,
} from "./SpecialistTypes";
import { makeSRId, makeRoutingAudit } from "./SpecialistTypes";
import { routingEventBus }            from "./SpecialistEvents";
import { bootstrapSpecialists }       from "./SpecialistCatalog";
import { globalCapabilityRegistry }   from "@/lib/capabilities/registry/CapabilityRegistry";
import { repoGet as getGoal }         from "@/lib/goal-engine/GoalEngine";
import { createWorkingMemoryEngine }  from "@/lib/wme";
import type { IdentityContext }       from "@/lib/wme/types";

const { engine: wme } = createWorkingMemoryEngine();
const _sessions = new Map<string, RoutingSession>();

// ── Score weights ─────────────────────────────────────────────────────────────

const W = { domain: 0.30, capability: 0.20, knowledge: 0.15, connector: 0.10, context: 0.10, availability: 0.10, experience: 0.05 };
const MIN_SCORE = 30; // threshold to be included as a match

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(val: number): number { return Math.min(100, Math.max(0, Math.round(val))); }

function keywordOverlap(keywords: string[], text: string): number {
  if (!keywords.length) return 0;
  const t = text.toLowerCase();
  const hits = keywords.filter(k => t.includes(k.toLowerCase())).length;
  return hits / keywords.length;
}

// ── Discovery ─────────────────────────────────────────────────────────────────

function discoverSpecialists(): SpecialistContract[] {
  return globalCapabilityRegistry
    .discover({ type: "Specialist", activeOnly: true })
    .map(c => (c.manifest.metadata as any).specialist as SpecialistContract)
    .filter(Boolean);
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreSpecialist(s: SpecialistContract, query: string, goalKeywords: string[]): { scores: SpecialistScores; explanations: ScoreExplanation[] } {
  const expl: ScoreExplanation[] = [];
  const fullText = query + " " + goalKeywords.join(" ");

  // Domain Score — keyword overlap between supportedGoals and the query
  const domainRaw = s.supportedGoals.length === 0
    ? 40  // fallback specialist gets neutral score
    : keywordOverlap(s.supportedGoals, fullText) * 100;
  const domainScore = normalize(domainRaw + (s.supportedGoals.length === 0 ? 0 : 5));
  expl.push({ dimension: "domainScore", value: domainScore, rationale: `${s.supportedGoals.filter(k => fullText.toLowerCase().includes(k)).length}/${s.supportedGoals.length} goal keywords matched` });

  // Capability Score — capabilities vs required keywords
  const capHits = s.capabilities.filter(c => fullText.toLowerCase().includes(c)).length;
  const capabilityScore = normalize(50 + (capHits / Math.max(s.capabilities.length, 1)) * 50);
  expl.push({ dimension: "capabilityScore", value: capabilityScore, rationale: `${capHits}/${s.capabilities.length} required capabilities matched` });

  // Knowledge Score — supportedKnowledge overlap
  const kHits = s.supportedKnowledge.filter(k => fullText.toLowerCase().includes(k.replace(/_/g, " "))).length;
  const knowledgeScore = normalize(40 + (kHits / Math.max(s.supportedKnowledge.length, 1)) * 60);
  expl.push({ dimension: "knowledgeScore", value: knowledgeScore, rationale: `${kHits}/${s.supportedKnowledge.length} knowledge domains matched` });

  // Connector Score — fewer required connectors = higher availability score
  const connectorScore = normalize(100 - s.supportedConnectors.length * 10);
  expl.push({ dimension: "connectorScore", value: connectorScore, rationale: `${s.supportedConnectors.length} external connectors required` });

  // Context Score — tag overlap
  const tagHits = s.tags.filter(t => fullText.toLowerCase().includes(t)).length;
  const contextScore = normalize(30 + (tagHits / Math.max(s.tags.length, 1)) * 70);
  expl.push({ dimension: "contextScore", value: contextScore, rationale: `${tagHits}/${s.tags.length} context tags matched` });

  // Availability Score
  const availabilityScore = normalize(s.available ? 100 : 0);
  expl.push({ dimension: "availabilityScore", value: availabilityScore, rationale: s.available ? "Specialist disponível" : "Specialist indisponível" });

  // Experience Score — from metadata
  const years = Number((s.metadata?.experienceYears) ?? 5);
  const successRate = Number((s.metadata?.successRate) ?? 0.7);
  const experienceScore = normalize(years * 3 + successRate * 40);
  expl.push({ dimension: "experienceScore", value: experienceScore, rationale: `${years} anos de experiência · taxa de sucesso ${(successRate * 100).toFixed(0)}%` });

  // Overall (weighted)
  const overallScore = normalize(
    domainScore       * W.domain +
    capabilityScore   * W.capability +
    knowledgeScore    * W.knowledge +
    connectorScore    * W.connector +
    contextScore      * W.context +
    availabilityScore * W.availability +
    experienceScore   * W.experience
  );
  expl.push({ dimension: "overallScore", value: overallScore, rationale: "Score composto ponderado" });

  return {
    scores: { domainScore, capabilityScore, knowledgeScore, connectorScore, contextScore, availabilityScore, experienceScore, overallScore },
    explanations: expl,
  };
}

// ── Rationale builder ─────────────────────────────────────────────────────────

function buildRationale(m: SpecialistMatch, ranked: SpecialistMatch[]): string {
  const parts: string[] = [];
  parts.push(`${m.specialist.name} foi selecionado(a) com score ${m.scores.overallScore}/100.`);
  if (m.scores.domainScore >= 70) parts.push(`Cobertura de domínio elevada (${m.scores.domainScore}).`);
  if (m.scores.availabilityScore === 100) parts.push("Specialist disponível.");
  if (m.scores.experienceScore >= 70) parts.push(`Alta experiência (${m.scores.experienceScore}).`);
  const runner = ranked.find(r => r.specialist.id !== m.specialist.id);
  if (runner) {
    const diff = m.scores.overallScore - runner.scores.overallScore;
    if (diff > 0) parts.push(`Supera ${runner.specialist.name} em ${diff} pontos.`);
  }
  return parts.join(" ");
}

// ── Orchestration planner ─────────────────────────────────────────────────────

function buildOrchestration(selected: SpecialistMatch[], mode: SelectionMode): OrchestrationStep[] {
  if (selected.length === 0) return [];

  if (mode === "Parallel") {
    return selected.map((m, i) => ({
      order: 1, specialistId: m.specialist.id, mode: "parallel" as const, dependsOn: [],
    }));
  }

  if (mode === "Sequential" || mode === "Single") {
    return selected.map((m, i) => ({
      order: i + 1, specialistId: m.specialist.id, mode: "sequential" as const,
      dependsOn: i > 0 ? [selected[i - 1].specialist.id] : [],
    }));
  }

  // Collaborative — domain-based grouping: first group in parallel, then merge
  // Group 1: legal/compliance/regulatory (must come first)
  const legalDomains = new Set(["juridico", "compliance", "anvisa"]);
  const group1 = selected.filter(m => legalDomains.has(m.specialist.domain));
  const group2 = selected.filter(m => !legalDomains.has(m.specialist.domain));

  const steps: OrchestrationStep[] = [];
  let order = 1;

  for (const m of group1) {
    steps.push({ order, specialistId: m.specialist.id, mode: "parallel", dependsOn: [] });
  }
  if (group1.length > 0) order++;

  const g1Ids = group1.map(m => m.specialist.id);
  for (const m of group2) {
    steps.push({ order, specialistId: m.specialist.id, mode: "parallel", dependsOn: g1Ids });
  }

  return steps;
}

// ── Selection mode resolver ───────────────────────────────────────────────────

function resolveSelectionMode(ranked: SpecialistMatch[], goalText: string): SelectionMode {
  const highScore = ranked.filter(m => m.scores.overallScore >= 65);
  if (highScore.length === 1) return "Single";
  if (highScore.length >= 3) return "Collaborative";
  if (highScore.length === 2) return "Sequential";
  return "Single";
}

// ── Session repository ────────────────────────────────────────────────────────

export function routingSessionGet(id: string): RoutingSession | undefined { return _sessions.get(id); }
export function routingSessionList(): RoutingSession[] { return [..._sessions.values()]; }

// ── SpecialistRouter — Main API ────────────────────────────────────────────────

export interface RouteInput {
  goalId:          string;
  identityContext: IdentityContext;
  forceMode?:      SelectionMode;
  topN?:           number; // max specialists to select (default 5)
}

export async function routeSpecialists(input: RouteInput): Promise<RoutingSession> {
  bootstrapSpecialists();

  const goal = getGoal(input.goalId);
  if (!goal) throw new Error(`Goal '${input.goalId}' not found`);
  if (goal.status !== "Validated") throw new Error(`Goal must be Validated. Current: ${goal.status}`);

  const sessionId = makeSRId("sr_sess");
  const query     = goal.title + " " + goal.primaryObjective + " " + goal.userIntent;
  const now       = Date.now();
  const topN      = input.topN ?? 5;

  const session: RoutingSession = {
    id: sessionId, goalId: goal.id, goalTitle: goal.title,
    query, selectionMode: "Single",
    matches: [], selected: [], rejected: [],
    orchestration: [], rationale: "",
    auditLog: [makeRoutingAudit("routing_started", { detail: `Goal: ${goal.title}` })],
    status: "Running", createdAt: now, updatedAt: now,
    metadata: { goalKeywords: goal.acceptanceCriteria },
  };
  _sessions.set(sessionId, session);

  routingEventBus.publish("SpecialistDiscoveryStarted", sessionId, { goalId: goal.id });

  // ── 1. Discover all registered specialists
  const all = discoverSpecialists();
  session.auditLog.push(makeRoutingAudit("discovery_done", { detail: `${all.length} specialists found` }));

  // ── 2. Score + match
  const goalKeywords = [...goal.acceptanceCriteria, ...goal.assumptions, goal.primaryObjective];
  const scored: SpecialistMatch[] = all.map(s => {
    const { scores, explanations } = scoreSpecialist(s, query, goalKeywords);
    return {
      specialist: s, scores, explanations,
      rationale: "", selected: false, rankPosition: 0,
    };
  });

  scored.sort((a, b) => b.scores.overallScore - a.scores.overallScore);
  scored.forEach((m, i) => { m.rankPosition = i + 1; });

  scored.forEach(m => {
    routingEventBus.publish("SpecialistMatched", sessionId, { goalId: goal.id, specialistId: m.specialist.id, meta: { score: m.scores.overallScore } });
  });

  session.matches = scored;
  session.auditLog.push(makeRoutingAudit("scoring_done", { detail: `Top score: ${scored[0]?.scores.overallScore ?? 0}` }));
  routingEventBus.publish("SpecialistRanked", sessionId, { goalId: goal.id, meta: { count: scored.length } });

  // ── 3. Filter by MIN_SCORE and take topN
  const qualified = scored.filter(m => m.scores.overallScore >= MIN_SCORE).slice(0, topN);
  const rejected  = scored.filter(m => m.scores.overallScore < MIN_SCORE);

  rejected.forEach(m => {
    session.auditLog.push(makeRoutingAudit("specialist_rejected", { detail: `${m.specialist.name} score ${m.scores.overallScore} < ${MIN_SCORE}` }));
    routingEventBus.publish("SpecialistRejected", sessionId, { goalId: goal.id, specialistId: m.specialist.id });
  });
  session.rejected = rejected;

  // ── 4. Resolve selection mode
  const mode = input.forceMode ?? resolveSelectionMode(qualified, query);
  session.selectionMode = mode;

  // ── 5. Select specialists
  const toSelect = mode === "Single" ? qualified.slice(0, 1) : qualified;
  toSelect.forEach(m => {
    m.selected = true;
    m.rationale = buildRationale(m, scored);
    routingEventBus.publish("SpecialistSelected", sessionId, { goalId: goal.id, specialistId: m.specialist.id, meta: { mode } });
    session.auditLog.push(makeRoutingAudit("specialist_selected", { detail: `${m.specialist.name}: ${m.rationale}` }));
  });
  session.selected = toSelect;

  // ── 6. Build orchestration
  session.orchestration = buildOrchestration(toSelect, mode);

  // ── 7. Session rationale
  if (toSelect.length === 1) {
    session.rationale = toSelect[0].rationale;
  } else {
    const names = toSelect.map(m => m.specialist.name).join(", ");
    session.rationale = `${toSelect.length} specialists selecionados (${mode}): ${names}. Orchestração: ${session.orchestration.map(o => `[${o.order}] ${o.specialistId.replace("specialist_", "")}(${o.mode})`).join(" → ")}.`;
  }

  // ── 8. Complete
  session.status    = "Completed";
  session.updatedAt = Date.now();
  session.auditLog.push(makeRoutingAudit("routing_completed", { detail: `${toSelect.length} selected, mode: ${mode}` }));
  routingEventBus.publish("RoutingCompleted", sessionId, { goalId: goal.id, meta: { count: toSelect.length, mode } });

  await wme.store(input.identityContext, `routing_session:${sessionId}`, { session }, { priority: "normal" });

  return session;
}