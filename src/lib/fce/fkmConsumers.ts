// FKM Consumers Mock — Sprint FKM-2
// Foundation v1.0 · Engineering First
//
// Valida que multiplos componentes reutilizam o FoundationKnowledgeAPI
// sem duplicacao de logica e sem interpretar Markdown diretamente.
// Nenhuma logica de negocio e implementada — apenas consultas.

import { FoundationKnowledgeAPI } from "./FoundationKnowledgeAPI";
import type { KnowledgeAtom } from "./FoundationKnowledgeModel";

// ── Consumer Result ────────────────────────────────────────────────────────────

export interface ConsumerResult {
  readonly consumer: string;
  readonly queriesExecuted: number;
  readonly atomsRead: number;
  readonly executionTimeMs: number;
  readonly queryIds: readonly string[];
  readonly summary: string;
  readonly success: boolean;
  readonly error?: string;
}

// ── 1. Foundation Compliance Engine Consumer ──────────────────────────────────
// FCE already uses KnowledgeModel via RuleLoader; here we validate direct API use.

export async function fceConsumer(): Promise<ConsumerResult> {
  const start = Date.now();
  const queryIds: string[] = [];
  let atomsRead = 0;

  try {
    // FCE needs: all invariants, all contracts, all principles
    const [invariants, contracts, principles] = await Promise.all([
      FoundationKnowledgeAPI.getByType("invariant"),
      FoundationKnowledgeAPI.getByType("contract"),
      FoundationKnowledgeAPI.getByType("principle"),
    ]);
    queryIds.push(invariants.queryId, contracts.queryId, principles.queryId);
    atomsRead += invariants.resultsFound + contracts.resultsFound + principles.resultsFound;

    const stats = await FoundationKnowledgeAPI.statistics();
    queryIds.push(stats.queryId);

    return {
      consumer: "FoundationComplianceEngine",
      queriesExecuted: queryIds.length,
      atomsRead,
      executionTimeMs: Date.now() - start,
      queryIds: Object.freeze(queryIds),
      summary: `FCE: ${invariants.resultsFound} invariants, ${contracts.resultsFound} contracts, ${principles.resultsFound} principles`,
      success: true,
    };
  } catch (err) {
    return {
      consumer: "FoundationComplianceEngine", queriesExecuted: queryIds.length,
      atomsRead, executionTimeMs: Date.now() - start, queryIds: Object.freeze(queryIds),
      summary: "FCE consumer falhou", success: false, error: String(err),
    };
  }
}

// ── 2. Architecture Auditor Consumer ─────────────────────────────────────────

export async function architectureAuditorConsumer(): Promise<ConsumerResult> {
  const start = Date.now();
  const queryIds: string[] = [];
  let atomsRead = 0;

  try {
    // Auditor reads: boundary atoms from MAS, all restrictions
    const [masAtoms, restrictions, boundary] = await Promise.all([
      FoundationKnowledgeAPI.getByDocument("MAS"),
      FoundationKnowledgeAPI.getByType("restriction"),
      FoundationKnowledgeAPI.getByCategory("boundary"),
    ]);
    queryIds.push(masAtoms.queryId, restrictions.queryId, boundary.queryId);
    atomsRead += masAtoms.resultsFound + restrictions.resultsFound + boundary.resultsFound;

    // Auditor searches for specific architectural concepts
    const connectorSearch = await FoundationKnowledgeAPI.search("connector");
    queryIds.push(connectorSearch.queryId);
    atomsRead += connectorSearch.resultsFound;

    return {
      consumer: "ArchitectureAuditor",
      queriesExecuted: queryIds.length,
      atomsRead,
      executionTimeMs: Date.now() - start,
      queryIds: Object.freeze(queryIds),
      summary: `Auditor: MAS=${masAtoms.resultsFound} atoms, restrictions=${restrictions.resultsFound}, boundary=${boundary.resultsFound}, connector search=${connectorSearch.resultsFound}`,
      success: true,
    };
  } catch (err) {
    return {
      consumer: "ArchitectureAuditor", queriesExecuted: queryIds.length,
      atomsRead, executionTimeMs: Date.now() - start, queryIds: Object.freeze(queryIds),
      summary: "Auditor consumer falhou", success: false, error: String(err),
    };
  }
}

// ── 3. Goal Runtime (mock) ────────────────────────────────────────────────────

export async function goalRuntimeConsumer(): Promise<ConsumerResult> {
  const start = Date.now();
  const queryIds: string[] = [];
  let atomsRead = 0;

  try {
    // Goal Runtime reads: autonomy_policy atoms, all definitions
    const [policy, definitions, mvAtoms] = await Promise.all([
      FoundationKnowledgeAPI.getByCategory("autonomy_policy"),
      FoundationKnowledgeAPI.getByType("definition"),
      FoundationKnowledgeAPI.getByDocument("MV"),
    ]);
    queryIds.push(policy.queryId, definitions.queryId, mvAtoms.queryId);
    atomsRead += policy.resultsFound + definitions.resultsFound + mvAtoms.resultsFound;

    const engineFirst = await FoundationKnowledgeAPI.search("engineering first");
    queryIds.push(engineFirst.queryId);
    atomsRead += engineFirst.resultsFound;

    return {
      consumer: "GoalRuntime",
      queriesExecuted: queryIds.length,
      atomsRead,
      executionTimeMs: Date.now() - start,
      queryIds: Object.freeze(queryIds),
      summary: `GoalRuntime: policy=${policy.resultsFound}, definitions=${definitions.resultsFound}, MV=${mvAtoms.resultsFound}, eng-first=${engineFirst.resultsFound}`,
      success: true,
    };
  } catch (err) {
    return {
      consumer: "GoalRuntime", queriesExecuted: queryIds.length,
      atomsRead, executionTimeMs: Date.now() - start, queryIds: Object.freeze(queryIds),
      summary: "GoalRuntime consumer falhou", success: false, error: String(err),
    };
  }
}

// ── 4. Planner (mock) ─────────────────────────────────────────────────────────

export async function plannerConsumer(): Promise<ConsumerResult> {
  const start = Date.now();
  const queryIds: string[] = [];
  let atomsRead = 0;

  try {
    // Planner reads: all principles, frozen_baseline, count
    const [principles, frozen, countResult] = await Promise.all([
      FoundationKnowledgeAPI.getByType("principle"),
      FoundationKnowledgeAPI.getByCategory("frozen_baseline"),
      FoundationKnowledgeAPI.count(),
    ]);
    queryIds.push(principles.queryId, frozen.queryId, countResult.queryId);
    atomsRead += principles.resultsFound + frozen.resultsFound;

    const policySearch = await FoundationKnowledgeAPI.search("policy engine");
    queryIds.push(policySearch.queryId);
    atomsRead += policySearch.resultsFound;

    return {
      consumer: "Planner",
      queriesExecuted: queryIds.length,
      atomsRead,
      executionTimeMs: Date.now() - start,
      queryIds: Object.freeze(queryIds),
      summary: `Planner: principles=${principles.resultsFound}, frozen=${frozen.resultsFound}, total=${countResult.data.total}, policy=${policySearch.resultsFound}`,
      success: true,
    };
  } catch (err) {
    return {
      consumer: "Planner", queriesExecuted: queryIds.length,
      atomsRead, executionTimeMs: Date.now() - start, queryIds: Object.freeze(queryIds),
      summary: "Planner consumer falhou", success: false, error: String(err),
    };
  }
}

// ── 5. Planning Intelligence Engine (mock) ────────────────────────────────────

export async function pieConsumer(): Promise<ConsumerResult> {
  const start = Date.now();
  const queryIds: string[] = [];
  let atomsRead = 0;

  try {
    // PIE reads: all atoms, recommendations, stats
    const [allAtoms, recommendations, stats] = await Promise.all([
      FoundationKnowledgeAPI.getAllAtoms(),
      FoundationKnowledgeAPI.getByType("recommendation"),
      FoundationKnowledgeAPI.statistics(),
    ]);
    queryIds.push(allAtoms.queryId, recommendations.queryId, stats.queryId);
    atomsRead += allAtoms.resultsFound + recommendations.resultsFound;

    // PIE searches for MSC context
    const mscSearch = await FoundationKnowledgeAPI.search("minimo suficiente");
    queryIds.push(mscSearch.queryId);
    atomsRead += mscSearch.resultsFound;

    // Verify immutability: atoms must be frozen
    const sampleAtom: KnowledgeAtom | undefined = allAtoms.data[0];
    let immutable = true;
    if (sampleAtom) {
      try {
        (sampleAtom as { text: string }).text = "MUTATION_ATTEMPT";
        immutable = false;
      } catch {
        immutable = true;
      }
    }

    return {
      consumer: "PlanningIntelligenceEngine",
      queriesExecuted: queryIds.length,
      atomsRead,
      executionTimeMs: Date.now() - start,
      queryIds: Object.freeze(queryIds),
      summary: `PIE: all=${allAtoms.resultsFound}, recommendations=${recommendations.resultsFound}, msc=${mscSearch.resultsFound}, immutable=${immutable}, cacheHits=${stats.data.queryStats.cacheHits}`,
      success: true,
    };
  } catch (err) {
    return {
      consumer: "PlanningIntelligenceEngine", queriesExecuted: queryIds.length,
      atomsRead, executionTimeMs: Date.now() - start, queryIds: Object.freeze(queryIds),
      summary: "PIE consumer falhou", success: false, error: String(err),
    };
  }
}

// ── Run all consumers ─────────────────────────────────────────────────────────

export async function runAllConsumers(): Promise<ConsumerResult[]> {
  return Promise.all([
    fceConsumer(),
    architectureAuditorConsumer(),
    goalRuntimeConsumer(),
    plannerConsumer(),
    pieConsumer(),
  ]);
}