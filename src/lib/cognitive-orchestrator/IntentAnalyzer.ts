/**
 * IntentAnalyzer.ts — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * SRP: extrair a intenção operacional de um Goal já analisado pelo GoalEngine.
 *
 * NÃO duplica o GoalAnalyzer do goal-engine.
 * O GoalAnalyzer já extrai primaryObjective, secondaryObjectives, etc.
 * O IntentAnalyzer só mapeia esse conteúdo para uma OperationalIntent
 * que o TaskDecomposer usará para decidir como decompor.
 *
 * Imutável — sem side effects.
 */

import type { Goal }             from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent } from "./COTypes";

// ── Intent signal patterns ────────────────────────────────────────────────────

interface IntentSignal {
  readonly pattern: RegExp;
  readonly intent:  OperationalIntent;
  readonly weight:  number;   // higher = stronger signal
}

const INTENT_SIGNALS: readonly IntentSignal[] = Object.freeze([
  // Compare signals (highest priority — implies multiple reads)
  { pattern: /compar[ae]|versus|vs\.|diferença|contraste|confront/i, intent: "compare",             weight: 10 },
  // Multi-source read signals
  { pattern: /e (o|a|os|as) |tanto .+ quanto|dois|ambos|múltipl/i,   intent: "read_multiple_sources",weight: 7  },
  // Write/create signals
  { pattern: /cri[ae]r?|escrever?|gerar?|produzir?|redigir?|elabor/i, intent: "write_or_create",    weight: 6  },
  // Transform signals
  { pattern: /resumi[rdo]|sintetiz|traduz|simplific|convert/i,         intent: "transform",          weight: 6  },
  // Analyze signals
  { pattern: /analisa[rdo]|avali[ae]|audit|investig|diagnos/i,         intent: "analyze",            weight: 5  },
  // Search signals
  { pattern: /busc[ao]|encontr|pesquisa|procur|localiz/i,              intent: "search_and_retrieve", weight: 4 },
  // Single read signals (lowest — fallback for read ops)
  { pattern: /l[eê]r?|ler|leia|mostrar?|exibir?|ver\b/i,              intent: "read_single_source",  weight: 2 },
]);

// ── Source multiplicity detector ──────────────────────────────────────────────

function detectSourceCount(text: string): number {
  // Count known multi-source connectors in text
  const connectorMentions = [
    /github/i, /drive/i, /gmail/i, /calendar/i, /notion/i, /slack/i,
    /readme/i, /document[oã]/i, /reposit[oó]r/i,
  ].filter(r => r.test(text)).length;
  return connectorMentions;
}

// ── Main analyzer ─────────────────────────────────────────────────────────────

export function analyzeOperationalIntent(goal: Goal): OperationalIntent {
  const corpus = [
    goal.userIntent,
    goal.primaryObjective,
    ...goal.secondaryObjectives,
  ].join(" ").toLowerCase();

  // Score each intent signal
  let topIntent: OperationalIntent = "unknown";
  let topWeight = 0;

  for (const signal of INTENT_SIGNALS) {
    if (signal.pattern.test(corpus) && signal.weight > topWeight) {
      topIntent  = signal.intent;
      topWeight  = signal.weight;
    }
  }

  // Upgrade single-read to multi if multiple sources detected
  if (topIntent === "read_single_source" && detectSourceCount(corpus) >= 2) {
    return "read_multiple_sources";
  }

  // Detect compound: multiple strong signals
  const matchCount = INTENT_SIGNALS.filter(s => s.pattern.test(corpus) && s.weight >= 5).length;
  if (matchCount >= 3) return "compound";

  return topIntent;
}