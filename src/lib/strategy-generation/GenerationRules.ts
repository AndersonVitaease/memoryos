/**
 * GenerationRules.ts — Sprint EF-47 · Strategy Generation Engine
 *
 * SRP: regras de geração que mapeiam (intent × profile) → ExecutionStages + metadata.
 *
 * Cada regra é uma função pura:
 *   (intent, goal, connectorNames) → Partial<GeneratedStrategy>
 *
 * NÃO avalia nem seleciona estratégias.
 * NÃO conhece StrategySelectionEngine.
 * Apenas define como cada perfil de geração deve se comportar.
 *
 * Imutável — sem side effects.
 */

import type { Goal }              from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";
import type { ConnectorProfile }  from "@/lib/strategy-selection/StrategyEvaluation";
import type {
  ExecutionStage, GeneratedStrategy, GenerationProfile, StrategyRisk, StageType,
} from "./GeneratedStrategy";
import { makeStage, makeGeneratedStrategyId } from "./GeneratedStrategy";

// ── Connector library (shared with catalog, defined locally for independence) ─

export const CONNECTOR_PROFILES: Record<string, ConnectorProfile> = {
  github:      { name: "github",      type: "live_api", latencyMs: 350, reliabilityPct: 94, costScore: 2 },
  googledrive: { name: "googledrive", type: "live_api", latencyMs: 400, reliabilityPct: 96, costScore: 2 },
  gmail:       { name: "gmail",       type: "live_api", latencyMs: 300, reliabilityPct: 95, costScore: 2 },
  calendar:    { name: "calendar",    type: "live_api", latencyMs: 250, reliabilityPct: 97, costScore: 1 },
  cache:       { name: "cache",       type: "cache",    latencyMs:  10, reliabilityPct: 80, costScore: 0 },
  local:       { name: "local",       type: "local",    latencyMs:   5, reliabilityPct: 99, costScore: 0 },
  llm:         { name: "llm",         type: "live_api", latencyMs: 800, reliabilityPct: 90, costScore: 6 },
  web_search:  { name: "web_search",  type: "live_api", latencyMs: 500, reliabilityPct: 85, costScore: 3 },
  memory:      { name: "memory",      type: "local",    latencyMs:  15, reliabilityPct: 98, costScore: 0 },
};

function cp(...keys: string[]): ConnectorProfile[] {
  return keys.map(k => CONNECTOR_PROFILES[k] ?? { name: k, type: "live_api", latencyMs: 300, reliabilityPct: 90, costScore: 3 });
}

// ── Intent → primary connectors heuristic ────────────────────────────────────

function primaryConnectorsForIntent(intent: OperationalIntent, goal: Goal): string[] {
  const corpus = (goal.userIntent + " " + goal.primaryObjective).toLowerCase();
  const detected: string[] = [];
  if (/github|reposit|readme|código|commit/i.test(corpus)) detected.push("github");
  if (/drive|documento|arquivo|spreadsheet|planilha/i.test(corpus)) detected.push("googledrive");
  if (/gmail|email|e-mail|inbox|mensagem/i.test(corpus)) detected.push("gmail");
  if (/calendar|agenda|evento|reunião/i.test(corpus)) detected.push("calendar");
  if (/web|internet|busca|pesquisa online/i.test(corpus)) detected.push("web_search");

  // Fallback: intent-based defaults
  if (detected.length === 0) {
    const defaults: Record<OperationalIntent, string[]> = {
      compare:              ["github", "googledrive"],
      read_single_source:   ["googledrive"],
      read_multiple_sources:["github", "googledrive"],
      search_and_retrieve:  ["gmail"],
      analyze:              ["googledrive", "llm"],
      transform:            ["googledrive", "llm"],
      write_or_create:      ["llm", "googledrive"],
      compound:             ["github", "googledrive", "llm"],
      unknown:              ["llm"],
    };
    return defaults[intent] ?? ["llm"];
  }
  return detected;
}

// ── Profile builders ──────────────────────────────────────────────────────────

type RuleOutput = Omit<GeneratedStrategy,
  "strategyId" | "generatedAt" | "connectorSequence" | "requiredCapabilities">;

function buildFast(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  const sources = primary.slice(0, 2);
  const stages: ExecutionStage[] = sources.map((s, i) =>
    makeStage(i, "fetch", `Fetch ${s}`, { connectors: [s], capabilities: ["mri"], parallel: i > 0 })
  );
  stages.push(makeStage(stages.length, "synthesize", "Synthesize", { connectors: [], capabilities: ["mri"] }));

  return {
    generationProfile: "fast",
    label:             "Fast path",
    description:       `Minimal latency: fetch ${sources.join(" + ")} in parallel, synthesize immediately.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "parallel",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp(...sources)),
    estimatedComplexity:  2,
    estimatedLatencyMs:   Math.max(...sources.map(s => CONNECTOR_PROFILES[s]?.latencyMs ?? 300)),
    estimatedReliability: Math.min(...sources.map(s => CONNECTOR_PROFILES[s]?.reliabilityPct ?? 90)),
    estimatedCostScore:   sources.reduce((a, s) => a + (CONNECTOR_PROFILES[s]?.costScore ?? 3), 0),
    assumptions:       Object.freeze(["Data freshness acceptable", "No cache required"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "Stale data if cache bypassed", severity: "low", mitigation: "Accept minor staleness for speed" },
    ]),
  };
}

function buildDeep(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  const sources = [...new Set([...primary, "llm"])].slice(0, 4);
  const stages: ExecutionStage[] = [
    makeStage(0, "cache_check", "Cache check",    { connectors: ["cache"],   capabilities: ["mri"] }),
    ...sources.filter(s => s !== "llm").map((s, i) =>
      makeStage(i + 1, "fetch", `Fetch ${s}`,     { connectors: [s],         capabilities: ["mri"] })
    ),
    makeStage(sources.length, "merge", "Merge",   { connectors: [],          capabilities: ["mri"] }),
    makeStage(sources.length + 1, "analyze", "Deep analysis via LLM", { connectors: ["llm"], capabilities: ["mri", "llm"] }),
    makeStage(sources.length + 2, "validate", "Validate", { connectors: [], capabilities: ["mri"] }),
    makeStage(sources.length + 3, "synthesize", "Synthesize response", { connectors: [], capabilities: ["mri"] }),
  ];

  const allConns = [...new Set([...sources, "cache"])];
  return {
    generationProfile: "deep",
    label:             "Deep analysis",
    description:       `Thorough: cache check → fetch all sources → merge → LLM analysis → validate → synthesize.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "aggregated",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp(...allConns)),
    estimatedComplexity:  8,
    estimatedLatencyMs:   allConns.reduce((a, s) => a + (CONNECTOR_PROFILES[s]?.latencyMs ?? 300), 0),
    estimatedReliability: 97,
    estimatedCostScore:   allConns.reduce((a, s) => a + (CONNECTOR_PROFILES[s]?.costScore ?? 3), 0),
    assumptions:       Object.freeze(["LLM available", "Sufficient time budget"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "High latency due to sequential LLM call", severity: "medium", mitigation: "Paginate or stream LLM output" },
      { description: "High cost if LLM called frequently", severity: "medium", mitigation: "Cache LLM results" },
    ]),
  };
}

function buildConservative(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  const source = primary[0] ?? "googledrive";
  const stages: ExecutionStage[] = [
    makeStage(0, "cache_check",  "Cache check",    { connectors: ["cache"],    capabilities: ["mri"] }),
    makeStage(1, "fetch",        `Fetch ${source}`,{ connectors: [source],     capabilities: ["mri"], optional: true }),
    makeStage(2, "fallback",     "Local fallback", { connectors: ["local"],    capabilities: ["mri"], optional: true }),
    makeStage(3, "synthesize",   "Synthesize",     { connectors: [],           capabilities: ["mri"] }),
  ];

  return {
    generationProfile: "conservative",
    label:             "Conservative cache-first",
    description:       `Cache-first: serve from cache if available, fetch live only if needed, local fallback.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "cache_first",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp("cache", source, "local")),
    estimatedComplexity:  3,
    estimatedLatencyMs:   CONNECTOR_PROFILES["cache"]?.latencyMs ?? 10,  // optimistic: cache hits
    estimatedReliability: 99,
    estimatedCostScore:   0,
    assumptions:       Object.freeze(["Cache populated from previous run", "Eventual consistency acceptable"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "Stale cache may return outdated data", severity: "medium", mitigation: "Set cache TTL per use case" },
    ]),
  };
}

function buildResilient(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  const [src1 = "googledrive", src2 = "cache"] = primary;
  const stages: ExecutionStage[] = [
    makeStage(0, "fetch",     `Primary: ${src1}`,  { connectors: [src1],   capabilities: ["mri"] }),
    makeStage(1, "fallback",  `Fallback: ${src2}`, { connectors: [src2],   capabilities: ["mri"], optional: true }),
    makeStage(2, "fallback",  "Local emergency",   { connectors: ["local"],capabilities: ["mri"], optional: true }),
    makeStage(3, "validate",  "Validate output",   { connectors: [],       capabilities: ["mri"] }),
    makeStage(4, "synthesize","Synthesize",         { connectors: [],       capabilities: ["mri"] }),
  ];

  return {
    generationProfile: "resilient",
    label:             "Resilient with fallbacks",
    description:       `Multi-fallback: primary → secondary → local emergency. Validates output before delivery.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "fallback",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp(src1, src2, "local")),
    estimatedComplexity:  5,
    estimatedLatencyMs:   (CONNECTOR_PROFILES[src1]?.latencyMs ?? 300) + 50,
    estimatedReliability: 99,
    estimatedCostScore:   (CONNECTOR_PROFILES[src1]?.costScore ?? 2),
    assumptions:       Object.freeze(["At least one fallback always available"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "Fallback data may be incomplete", severity: "low", mitigation: "Mark response with data-source provenance" },
    ]),
  };
}

function buildEconomic(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  // Use only zero-cost connectors when possible, else cheapest live
  const cheap = primary.filter(s => (CONNECTOR_PROFILES[s]?.costScore ?? 99) <= 2);
  const sources = cheap.length > 0 ? cheap : primary.slice(0, 1);
  const stages: ExecutionStage[] = [
    makeStage(0, "cache_check", "Cache check",    { connectors: ["cache"],  capabilities: ["mri"] }),
    ...sources.map((s, i) =>
      makeStage(i + 1, "fetch", `Fetch ${s}`,     { connectors: [s],        capabilities: ["mri"] })
    ),
    makeStage(sources.length + 1, "synthesize", "Synthesize", { connectors: [], capabilities: ["mri"] }),
  ];

  const allConns = ["cache", ...sources];
  return {
    generationProfile: "economic",
    label:             "Economic (low cost)",
    description:       `Minimise cost: cache-first, avoid LLM, use cheapest connectors only.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "cache_first",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp(...allConns)),
    estimatedComplexity:  2,
    estimatedLatencyMs:   allConns.reduce((a, s) => a + (CONNECTOR_PROFILES[s]?.latencyMs ?? 300), 0),
    estimatedReliability: Math.min(...allConns.map(s => CONNECTOR_PROFILES[s]?.reliabilityPct ?? 90)),
    estimatedCostScore:   0,
    assumptions:       Object.freeze(["Cache hit rate > 60%", "LLM not required for this objective"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "Low quality if cache stale and LLM unavailable", severity: "medium", mitigation: "Fallback to cheap live connector" },
    ]),
  };
}

function buildParallel(intent: OperationalIntent, goal: Goal, primary: string[]): RuleOutput {
  const sources = primary.slice(0, 3);
  const stages: ExecutionStage[] = [
    ...sources.map((s, i) =>
      makeStage(i, "fetch", `Fetch ${s} (parallel)`, { connectors: [s], capabilities: ["mri"], parallel: i > 0 })
    ),
    makeStage(sources.length, "merge",     "Merge all",   { connectors: [],    capabilities: ["mri"] }),
    makeStage(sources.length + 1, "synthesize", "Synthesize", { connectors: [], capabilities: ["mri"] }),
  ];

  return {
    generationProfile: "parallel",
    label:             "Maximum parallelism",
    description:       `Fetch all sources concurrently, merge results, synthesize.`,
    objective:         goal.primaryObjective,
    intent,
    approach:          "parallel",
    executionStages:   Object.freeze(stages),
    connectors:        Object.freeze(cp(...sources)),
    estimatedComplexity:  6,
    estimatedLatencyMs:   Math.max(...sources.map(s => CONNECTOR_PROFILES[s]?.latencyMs ?? 300)),
    estimatedReliability: Math.min(...sources.map(s => CONNECTOR_PROFILES[s]?.reliabilityPct ?? 90)),
    estimatedCostScore:   sources.reduce((a, s) => a + (CONNECTOR_PROFILES[s]?.costScore ?? 2), 0),
    assumptions:       Object.freeze(["All connectors available simultaneously", "Merge logic handles partial results"]),
    risks:             Object.freeze<StrategyRisk[]>([
      { description: "One slow connector blocks merge", severity: "medium", mitigation: "Apply timeout per fetch with partial result policy" },
    ]),
  };
}

// ── Rule registry ─────────────────────────────────────────────────────────────

type RuleFn = (intent: OperationalIntent, goal: Goal, primary: string[]) => RuleOutput;

export const GENERATION_RULES: Record<GenerationProfile, RuleFn> = {
  fast:         buildFast,
  deep:         buildDeep,
  conservative: buildConservative,
  resilient:    buildResilient,
  economic:     buildEconomic,
  parallel:     buildParallel,
};

export { primaryConnectorsForIntent };