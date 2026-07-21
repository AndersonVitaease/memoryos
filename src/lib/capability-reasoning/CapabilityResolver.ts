/**
 * CapabilityResolver.ts — Sprint EF-48 · Capability Reasoning Engine
 *
 * SRP: resolver quais capabilities um OperationalIntent + Goal requerem,
 *      consultando o CapabilityRegistry.
 *
 * NÃO raciocina sobre conectores, estratégias ou planos.
 * NÃO executa nada.
 * Produz uma lista ordenada de CapabilityNode prontos para o CapabilityGraph.
 *
 * Imutável — sem side effects.
 */

import type { Goal }             from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";
import { CAPABILITY_REGISTRY }   from "./CapabilityRegistry";
import { makeCapabilityNode }    from "./CapabilityGraph";
import type { CapabilityNode }   from "./CapabilityGraph";

// ── Intent → required capability ids ─────────────────────────────────────────

const INTENT_CAPS: Record<OperationalIntent, string[]> = {
  compare: [
    "ReadRepository", "ReadDocument", "NormalizeContent", "CompareContent", "GenerateSummary",
  ],
  read_single_source: [
    "ReadDocument", "NormalizeContent", "GenerateSummary",
  ],
  read_multiple_sources: [
    "ReadRepository", "ReadDocument", "NormalizeContent", "MergeResults", "GenerateSummary",
  ],
  search_and_retrieve: [
    "ReadEmail", "AnalyzeEmail", "GenerateSummary",
  ],
  analyze: [
    "ReadSourceCode", "DetectArchitecture", "DetectDependencies", "EvaluateQuality", "GenerateReport",
  ],
  transform: [
    "ReadDocument", "NormalizeContent", "SummarizeContent", "ValidateOutput",
  ],
  write_or_create: [
    "GenerateContent", "ValidateOutput", "WriteDocument",
  ],
  compound: [
    "ReadRepository", "ReadDocument", "NormalizeContent", "CompareContent",
    "DetectArchitecture", "MergeResults", "GenerateReport",
  ],
  unknown: [
    "GenerateSummary",
  ],
};

// ── Goal text → extra capabilities ───────────────────────────────────────────

function detectExtraCaps(goal: Goal): string[] {
  const corpus = (goal.userIntent + " " + goal.primaryObjective).toLowerCase();
  const extras: string[] = [];
  if (/segurança|vulnerabilid|secret|credencial/i.test(corpus)) extras.push("SecurityAudit");
  if (/email|gmail|inbox|mensagem/i.test(corpus))               extras.push("ReadEmail", "AnalyzeEmail");
  if (/calendar|agenda|reunião|evento/i.test(corpus))           extras.push("ReadCalendar");
  if (/web|internet|pesquisa online/i.test(corpus))             extras.push("WebSearch");
  if (/traduz|translate/i.test(corpus))                         extras.push("TranslateContent");
  if (/relatório|report/i.test(corpus))                         extras.push("GenerateReport");
  return extras;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveCapabilities(
  intent: OperationalIntent,
  goal:   Goal,
): CapabilityNode[] {
  const base   = INTENT_CAPS[intent] ?? INTENT_CAPS.unknown;
  const extras = detectExtraCaps(goal);

  // Deduplicate, preserve order
  const allIds = [...new Set([...base, ...extras])];

  // Build CapabilityNode for each id found in registry
  const nodes: CapabilityNode[] = [];
  for (const id of allIds) {
    const entry = CAPABILITY_REGISTRY[id];
    if (!entry) continue;

    // Determine confidence from intent match
    const isExtra    = extras.includes(id) && !base.includes(id);
    const confidence = isExtra ? 0.70 : (base.indexOf(id) === 0 ? 0.95 : 0.88);

    nodes.push(makeCapabilityNode(entry.id, {
      description:          entry.description,
      category:             entry.category,
      status:               isExtra ? "optional" : "required",
      confidence,
      dependencies:         entry.prerequisites,
      compatibleConnectors: entry.compatibleConnectors,
      estimatedCostScore:   entry.estimatedCostScore,
      estimatedComplexity:  entry.estimatedComplexity,
      parallelizable:       entry.parallelizable,
      prerequisitesMet:     entry.prerequisites.every(p => allIds.includes(p)),
    }));
  }

  return nodes;
}