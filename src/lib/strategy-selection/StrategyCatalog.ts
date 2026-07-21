/**
 * StrategyCatalog.ts — Sprint EF-46 · Strategy Selection Engine
 *
 * SRP: gerar candidatos de estratégia a partir de um OperationalIntent + Goal.
 *
 * NÃO avalia nem seleciona — apenas produz a lista de candidatos.
 * NÃO conhece conectores reais — usa ConnectorProfiles com dados estimados.
 *
 * Imutável — sem side effects.
 */

import type { Goal }                             from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent }               from "@/lib/cognitive-orchestrator/COTypes";
import type { StrategyCandidate, ConnectorProfile } from "./StrategyEvaluation";
import { makeStrategyId }                       from "./StrategyEvaluation";

// ── Connector profile library ─────────────────────────────────────────────────

const CONNECTORS: Record<string, ConnectorProfile> = {
  github:      { name: "github",      type: "live_api", latencyMs: 350, reliabilityPct: 94, costScore: 2 },
  googledrive: { name: "googledrive", type: "live_api", latencyMs: 400, reliabilityPct: 96, costScore: 2 },
  gmail:       { name: "gmail",       type: "live_api", latencyMs: 300, reliabilityPct: 95, costScore: 2 },
  calendar:    { name: "calendar",    type: "live_api", latencyMs: 250, reliabilityPct: 97, costScore: 1 },
  cache:       { name: "cache",       type: "cache",    latencyMs:  10, reliabilityPct: 80, costScore: 0 },
  local:       { name: "local",       type: "local",    latencyMs:   5, reliabilityPct: 99, costScore: 0 },
  llm:         { name: "llm",         type: "live_api", latencyMs: 800, reliabilityPct: 90, costScore: 6 },
  web_search:  { name: "web_search",  type: "live_api", latencyMs: 500, reliabilityPct: 85, costScore: 3 },
};

function c(...keys: string[]): ConnectorProfile[] {
  return keys.map(k => CONNECTORS[k] ?? { name: k, type: "live_api", latencyMs: 300, reliabilityPct: 90, costScore: 3 });
}

// ── Candidate templates per intent ────────────────────────────────────────────

type TemplateEntry = Omit<StrategyCandidate, "strategyId" | "intent">;

const TEMPLATES: Record<OperationalIntent, TemplateEntry[]> = {
  compare: [
    {
      label: "Direct fetch + compare",
      description: "Fetch both sources live, compare in memory.",
      approach: "direct",
      connectors: c("github", "googledrive"),
    },
    {
      label: "Cache-first + compare",
      description: "Use cache for first source, live for second.",
      approach: "cache_first",
      connectors: c("cache", "googledrive"),
    },
    {
      label: "Parallel fetch + compare",
      description: "Fetch both sources simultaneously, then compare.",
      approach: "parallel",
      connectors: c("github", "googledrive"),
    },
  ],
  read_single_source: [
    {
      label: "Direct API read",
      description: "Fetch content directly from the live API.",
      approach: "direct",
      connectors: c("googledrive"),
    },
    {
      label: "Cache-first read",
      description: "Check cache first; fall back to live API.",
      approach: "cache_first",
      connectors: c("cache", "googledrive"),
    },
    {
      label: "Local + fallback",
      description: "Read local index; fall back to remote source.",
      approach: "fallback",
      connectors: c("local", "googledrive"),
    },
  ],
  read_multiple_sources: [
    {
      label: "Sequential multi-fetch",
      description: "Fetch each source in order, one at a time.",
      approach: "sequential",
      connectors: c("github", "googledrive", "gmail"),
    },
    {
      label: "Parallel multi-fetch",
      description: "Fetch all sources simultaneously.",
      approach: "parallel",
      connectors: c("github", "googledrive", "gmail"),
    },
    {
      label: "Aggregated with cache",
      description: "Merge cached and live results.",
      approach: "aggregated",
      connectors: c("cache", "github", "googledrive"),
    },
  ],
  search_and_retrieve: [
    {
      label: "Live search",
      description: "Query live API for results.",
      approach: "direct",
      connectors: c("gmail"),
    },
    {
      label: "Cache + live hybrid",
      description: "Search cache first, supplement with live results.",
      approach: "hybrid" as any,
      connectors: c("cache", "gmail"),
    },
    {
      label: "Web search + LLM synthesis",
      description: "Broad web search with LLM summarisation.",
      approach: "aggregated",
      connectors: c("web_search", "llm"),
    },
  ],
  analyze: [
    {
      label: "Fetch + LLM analysis",
      description: "Retrieve content then pass to LLM for deep analysis.",
      approach: "direct",
      connectors: c("googledrive", "llm"),
    },
    {
      label: "Cache + LLM analysis",
      description: "Use cached data for faster, cheaper analysis.",
      approach: "cache_first",
      connectors: c("cache", "llm"),
    },
    {
      label: "Multi-source + aggregate analysis",
      description: "Pull from multiple sources, merge, then analyse.",
      approach: "aggregated",
      connectors: c("github", "googledrive", "llm"),
    },
  ],
  transform: [
    {
      label: "Fetch + LLM transform",
      description: "Retrieve and transform via LLM.",
      approach: "direct",
      connectors: c("googledrive", "llm"),
    },
    {
      label: "Cache + LLM transform",
      description: "Use cached version for cheaper transformation.",
      approach: "cache_first",
      connectors: c("cache", "llm"),
    },
  ],
  write_or_create: [
    {
      label: "LLM create + write",
      description: "Generate content via LLM and write to target.",
      approach: "direct",
      connectors: c("llm", "googledrive"),
    },
    {
      label: "Context-gather + LLM create",
      description: "Gather existing context first, then generate.",
      approach: "sequential",
      connectors: c("googledrive", "llm"),
    },
  ],
  compound: [
    {
      label: "Parallel multi-connector",
      description: "Multiple connectors running in parallel stages.",
      approach: "parallel",
      connectors: c("github", "googledrive", "llm"),
    },
    {
      label: "Sequential orchestrated",
      description: "Strict ordered execution across all sources.",
      approach: "sequential",
      connectors: c("github", "googledrive", "gmail", "llm"),
    },
    {
      label: "Aggregated hybrid",
      description: "Cache + live sources merged with LLM synthesis.",
      approach: "aggregated",
      connectors: c("cache", "github", "googledrive", "llm"),
    },
  ],
  unknown: [
    {
      label: "Conservative direct",
      description: "Simple direct call with no assumptions.",
      approach: "direct",
      connectors: c("llm"),
    },
    {
      label: "Cache-first safe",
      description: "Try cache first to minimise risk.",
      approach: "cache_first",
      connectors: c("cache", "llm"),
    },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getCandidates(intent: OperationalIntent, _goal: Goal): readonly StrategyCandidate[] {
  const templates = TEMPLATES[intent] ?? TEMPLATES.unknown;
  return Object.freeze(
    templates.map(t => Object.freeze({
      ...t,
      strategyId: makeStrategyId(),
      intent,
      connectors: Object.freeze(t.connectors),
    }))
  );
}