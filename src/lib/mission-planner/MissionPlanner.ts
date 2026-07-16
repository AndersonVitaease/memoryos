/**
 * MissionPlanner.ts — Engineering Sprint 8.1
 * Orchestrates Mission → CapabilityResolver → MCOE → Response.
 *
 * Replaces scenario-based planning with mission-based planning.
 * Fully decoupled from Core, Runtime, and Connectors.
 */

import type { MissionContext, MissionEntity, MissionResolutionResult } from "./MissionDefinition";
import { MissionRegistry }           from "./MissionRegistry";
import { MissionCapabilityResolver } from "./MissionCapabilityResolver";
import { createMissionContext, saveContext, computeSuccessScore } from "./MissionContext";

// ── Intent → Mission detector ─────────────────────────────────────────────────

const PATTERNS: Array<{ missionId: string; terms: string[]; weight: number }> = [
  { missionId: "PrepareMeeting",          terms: ["reuniao","meeting","preparar","agenda","pauta","amanha"], weight: 2 },
  { missionId: "FindCustomerInformation", terms: ["cliente","customer","xpto","empresa","companhia","contato"], weight: 2 },
  { missionId: "SummarizeProject",        terms: ["projeto","project","resumo","resumir","summary","sintetizar"], weight: 2 },
  { missionId: "ReviewPendingTasks",      terms: ["pendente","pending","tarefa","task","revisar","revisao","fila"], weight: 2 },
  { missionId: "PrepareTrip",             terms: ["viagem","trip","voo","hotel","passagem","destino"], weight: 2 },
  { missionId: "ReviewInvoices",          terms: ["fatura","invoice","nota fiscal","pagamento","cobranca","financeiro"], weight: 2 },
];

export function detectMission(rawQuery: string): MissionResolutionResult {
  const q = rawQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const scores = new Map<string, { score: number; matched: string[] }>();

  PATTERNS.forEach(({ missionId, terms, weight }) => {
    const matched = terms.filter((t) => q.includes(t));
    if (matched.length > 0) {
      const existing = scores.get(missionId) ?? { score: 0, matched: [] };
      scores.set(missionId, {
        score:   existing.score + matched.length * weight,
        matched: [...existing.matched, ...matched],
      });
    }
  });

  if (scores.size === 0) {
    return { missionId: "ReviewPendingTasks", confidence: 0.3, matchedTerms: [] };
  }

  let best = { missionId: "", score: 0, matched: [] as string[] };
  scores.forEach(({ score, matched }, id) => {
    if (score > best.score) best = { missionId: id, score, matched };
  });

  const maxScore = Math.max(...Array.from(scores.values()).map((v) => v.score));
  return {
    missionId:    best.missionId,
    confidence:   Math.min(1, best.score / (maxScore + 2)),
    matchedTerms: best.matched,
  };
}

// ── Entity extractor (lightweight, no LLM) ────────────────────────────────────

function _extractEntities(rawQuery: string): MissionEntity[] {
  const entities: MissionEntity[] = [];
  const q = rawQuery;

  // Customer / name patterns
  const nameMatch = q.match(/(?:cliente|customer|empresa)\s+([A-Za-z0-9\s]{2,30})/i);
  if (nameMatch) entities.push({ type: "name", value: nameMatch[1].trim() });

  // Project patterns
  const projMatch = q.match(/(?:projeto|project)\s+([A-Za-z0-9\s]{2,30})/i);
  if (projMatch) entities.push({ type: "project", value: projMatch[1].trim() });

  // Trip/destination
  const tripMatch = q.match(/(?:viagem|trip|voo|para)\s+([A-Za-z\s]{2,20})/i);
  if (tripMatch) entities.push({ type: "destination", value: tripMatch[1].trim() });

  // Dates
  if (/amanhã|amanha|tomorrow/i.test(q)) entities.push({ type: "date", value: "tomorrow" });
  if (/hoje|today/i.test(q))             entities.push({ type: "date", value: "today" });
  if (/semana|week/i.test(q))            entities.push({ type: "date_range", value: "this_week" });

  // Fallback: use whole query as search value
  if (entities.length === 0) entities.push({ type: "query", value: rawQuery });

  return entities;
}

// ── Main planner ──────────────────────────────────────────────────────────────

export class MissionPlanner {
  private resolver = new MissionCapabilityResolver();

  /** Step 1: Detect mission from raw query */
  detectMission(rawQuery: string): MissionResolutionResult {
    return detectMission(rawQuery);
  }

  /** Step 2: Build MissionContext (no execution yet) */
  buildContext(rawQuery: string, missionId?: string): MissionContext {
    const resolution  = missionId
      ? { missionId, confidence: 1, matchedTerms: [] }
      : detectMission(rawQuery);

    const mission = MissionRegistry.get(resolution.missionId);
    if (!mission) throw new Error(`Mission not found: ${resolution.missionId}`);

    const entities  = _extractEntities(rawQuery);
    const plan      = this.resolver.resolve(mission, entities);

    const ctx = createMissionContext(mission.id, rawQuery);
    ctx.entities             = entities;
    ctx.resolvedCapabilities = plan.capabilities;
    ctx.connectorsUsed       = plan.connectors;
    saveContext(ctx);
    return ctx;
  }

  /** Step 3: Execute — delegates to MCOE */
  async execute(ctx: MissionContext): Promise<MissionContext> {
    const mission = MissionRegistry.get(ctx.missionId);
    if (!mission) throw new Error(`Mission not found: ${ctx.missionId}`);

    ctx.status = "running";
    saveContext(ctx);

    const entities = ctx.entities;
    const plan = this.resolver.resolve(mission, entities);
    const nodes = this.resolver.toExecutionNodes(plan);

    const { mcoe }            = await import("@/lib/multi-connector/MultiConnectorPlanner");
    const { aggregateResults } = await import("@/lib/multi-connector/ConnectorResultAggregator");

    // Build MCOE plan from mission nodes
    const execPlan = {
      id:         `mission-${ctx.id}`,
      intentId:   ctx.id,
      rawQuery:   ctx.rawQuery,
      scenarioId: "custom" as const,
      nodes,
      createdAt:  Date.now(),
    };

    ctx.executionPlanId = execPlan.id;

    const execResult = await mcoe.execute(execPlan);
    ctx.unifiedContext = execResult.unifiedContext;
    ctx.connectorsUsed = execResult.unifiedContext.sources;

    const useLLM = mission.aggregationStrategy === "llm";
    const agg = await aggregateResults(execResult, ctx.rawQuery, useLLM);
    ctx.finalResponse = agg.answer;

    ctx.finishedAt  = Date.now();
    ctx.durationMs  = ctx.finishedAt - ctx.startedAt;
    ctx.status      = execResult.success ? "success" : execResult.partialFailures.length > 0 ? "partial" : "failed";
    ctx.successScore = computeSuccessScore(ctx);
    saveContext(ctx);
    return ctx;
  }

  /** Convenience: detect + build + execute in one call */
  async run(rawQuery: string, missionId?: string): Promise<MissionContext> {
    const ctx = this.buildContext(rawQuery, missionId);
    return this.execute(ctx);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const _KEY = "__MISSION_PLANNER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new MissionPlanner();
}
export const missionPlanner: MissionPlanner =
  (globalThis as unknown as Record<string, MissionPlanner>)[_KEY];