/**
 * ExplanationBuilder.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Builds a human-readable explanation for every reasoning result.
 * Answers: why this conclusion? what was used? what was discarded?
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type {
  ReasoningEvidence,
  ReasoningConflict,
  ReasoningHypothesis,
  ReasoningExplanation,
  ConsolidatedKnowledge,
  KnowledgeFact,
} from "./MRETypes";

export const ExplanationBuilder = {

  buildExplanation(
    session: { query: string },
    reasoning: ReasoningEvidence[],
    conflicts:  ReasoningConflict[],
    hypotheses: ReasoningHypothesis[],
    rulesApplied: string[],
  ): ReasoningExplanation {
    const used      = reasoning.filter(r => r.role !== "discarded").map(r => r.original.memoryId);
    const discarded = reasoning.filter(r => r.role === "discarded").map(r => r.original.memoryId);

    const steps: string[] = [
      `Query: "${session.query}"`,
      `${reasoning.length} evidence items analyzed from ${new Set(reasoning.map(r => r.original.providerId)).size} providers`,
    ];

    if (conflicts.length > 0) {
      steps.push(`${conflicts.length} conflict(s) detected and resolved`);
      for (const c of conflicts) steps.push(`  → Conflict: ${c.description} — ${c.explanation}`);
    }

    if (discarded.length > 0) {
      const discardedItems = reasoning.filter(r => r.role === "discarded");
      for (const r of discardedItems) {
        steps.push(`  → Discarded "${r.original.providerName}": ${r.discardReason}`);
      }
    }

    if (hypotheses.length > 0) {
      steps.push(`${hypotheses.length} hypothesis(es) generated due to insufficient evidence`);
    }

    const primary = reasoning.filter(r => r.role === "primary");
    if (primary.length > 0) {
      steps.push(`Primary sources: ${primary.map(r => r.original.providerName).join(", ")}`);
    }

    return {
      conclusion:         `Consolidated knowledge for "${session.query}"`,
      evidenceUsed:       used,
      evidenceDiscarded:  discarded,
      conflictsFound:     conflicts.length > 0,
      hypothesisUsed:     hypotheses.length > 0,
      rulesApplied,
      steps,
    };
  },

  buildConsolidated(
    query: string,
    reasoning: ReasoningEvidence[],
    conflicts:  ReasoningConflict[],
    hypotheses: ReasoningHypothesis[],
    overallConf: number,
  ): ConsolidatedKnowledge {
    const active = reasoning.filter(r => r.role !== "discarded");
    const sources = [...new Set(active.map(r => r.original.providerName))];

    // Build facts from primary + supporting evidence
    const facts: KnowledgeFact[] = active.map(r => ({
      statement:    r.original.summary,
      confidence:   r.adjustedConf,
      sources:      [r.original.providerId],
      isHypothesis: r.role === "hypothetical",
    }));

    // Add hypotheses as low-confidence facts
    for (const h of hypotheses) {
      facts.push({
        statement:    `[HIPÓTESE] ${h.statement}`,
        confidence:   h.probability,
        sources:      [],
        isHypothesis: true,
      });
    }

    // Gaps: what questions can't be answered
    const gaps: string[] = [];
    if (active.length === 0) gaps.push("No relevant memory found for this query.");
    if (conflicts.some(c => c.resolution === "unresolved")) gaps.push("Unresolved conflicts — result may be incomplete.");

    // Summary: one-line answer
    const topFact = facts.filter(f => !f.isHypothesis).sort((a, b) => b.confidence - a.confidence)[0];
    const summary = topFact ? topFact.statement : (hypotheses[0]?.statement ?? `No definitive answer found for: "${query}"`);

    return { summary, facts, gaps, sources, confidence: overallConf };
  },

  buildContextBlock(
    query: string,
    consolidated: ConsolidatedKnowledge,
    conflicts:    ReasoningConflict[],
    hypotheses:   ReasoningHypothesis[],
    explanation:  ReasoningExplanation,
  ): string {
    const lines: string[] = [
      `[CONHECIMENTO CONSOLIDADO — "${query}"]`,
      `Confiança geral: ${(consolidated.confidence * 100).toFixed(0)}%`,
      `Fontes: ${consolidated.sources.join(", ")}`,
      "",
      `## Resumo`,
      consolidated.summary,
      "",
    ];

    if (consolidated.facts.filter(f => !f.isHypothesis).length > 0) {
      lines.push("## Fatos conhecidos");
      for (const f of consolidated.facts.filter(f => !f.isHypothesis)) {
        lines.push(`• ${f.statement} (confiança: ${(f.confidence * 100).toFixed(0)}%)`);
      }
      lines.push("");
    }

    if (conflicts.length > 0) {
      lines.push("## Conflitos detectados");
      for (const c of conflicts) {
        lines.push(`⚠ ${c.description}`);
        lines.push(`  Resolução: ${c.explanation}`);
      }
      lines.push("");
    }

    if (hypotheses.length > 0) {
      lines.push("## Hipóteses (não são fatos)");
      for (const h of hypotheses) {
        lines.push(`? ${h.statement} (probabilidade: ${(h.probability * 100).toFixed(0)}%)`);
        lines.push(`  Limitações: ${h.limitations}`);
      }
      lines.push("");
    }

    if (consolidated.gaps.length > 0) {
      lines.push("## Lacunas");
      for (const g of consolidated.gaps) lines.push(`- ${g}`);
    }

    return lines.join("\n");
  },
};