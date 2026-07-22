/**
 * ReflectionEngine.ts — Sprint EF-54
 *
 * SRP: gerar reflexão completa sobre o processo cognitivo.
 * Responde: o que foi bem, o que foi ruim, o que deve mudar, o que deve permanecer.
 */

import type { Reflection, ReflectionItem } from "./MCTypes";
import { makeMCId } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";
import type { DetectedBias } from "./MCTypes";
import type { ConsistencyIssue } from "./MCTypes";
import type { EvidenceEvaluation } from "./MCTypes";

function item(
  category: ReflectionItem["category"],
  description: string,
  evidence: string[],
  priority: ReflectionItem["priority"],
): ReflectionItem {
  return Object.freeze({ category, description, evidence: Object.freeze(evidence), priority });
}

export class ReflectionEngine {
  reflect(
    snap:        ThoughtSnapshot,
    biases:      readonly DetectedBias[],
    issues:      readonly ConsistencyIssue[],
    evidence:    EvidenceEvaluation,
  ): Reflection {
    const strengths:    ReflectionItem[] = [];
    const weaknesses:   ReflectionItem[] = [];
    const improvements: ReflectionItem[] = [];
    const retentions:   ReflectionItem[] = [];

    // ── Strengths ─────────────────────────────────────────────────────────────

    if (snap.success) {
      strengths.push(item("strength", "Goal execution succeeded.", [`success=true`, `duration=${snap.durationMs}ms`], "high"));
    }
    if (snap.confidence > 0.75 && snap.success) {
      strengths.push(item("strength", "High confidence was justified by successful execution.", [`confidence=${(snap.confidence * 100).toFixed(1)}%`], "medium"));
    }
    if (snap.knowledgeRules >= 4) {
      strengths.push(item("strength", "Rich knowledge base contributed to well-grounded reasoning.", [`knowledge_rules=${snap.knowledgeRules}`], "medium"));
    }
    if (snap.inferenceDepth >= 3 && snap.inferenceConf > 0.65) {
      strengths.push(item("strength", "Inference chain produced confident multi-step reasoning.", [`depth=${snap.inferenceDepth}`, `conf=${(snap.inferenceConf * 100).toFixed(1)}%`], "medium"));
    }
    if (biases.length === 0) {
      strengths.push(item("strength", "No cognitive biases detected — clean reasoning process.", [], "high"));
    }
    if (issues.length === 0) {
      strengths.push(item("strength", "Perfect internal consistency — no contradictions found.", [], "high"));
    }
    if (snap.conflictCount === 0) {
      strengths.push(item("strength", "Knowledge retrieval produced no conflicting rules.", [], "low"));
    }

    // ── Weaknesses ────────────────────────────────────────────────────────────

    if (!snap.success) {
      weaknesses.push(item("weakness", "Execution failed — the cognitive process did not produce a successful outcome.", [`success=false`], "critical"));
    }
    if (snap.knowledgeRules < 3) {
      weaknesses.push(item("weakness", "Sparse knowledge base — reasoning lacked sufficient grounding.", [`knowledge_rules=${snap.knowledgeRules}`], "high"));
    }
    if (biases.length > 0) {
      const critical = biases.filter(b => b.severity === "critical" || b.severity === "high");
      if (critical.length > 0) {
        weaknesses.push(item("weakness", `${critical.length} high-severity bias(es) detected: ${critical.map(b => b.type).join(", ")}.`, critical.map(b => b.title), "high"));
      }
    }
    if (issues.some(i => i.severity === "critical")) {
      weaknesses.push(item("weakness", "Critical consistency issues — decisions contradicted reasoning.", issues.filter(i => i.severity === "critical").map(i => i.description), "critical"));
    }
    if (evidence.overallScore < 0.45) {
      weaknesses.push(item("weakness", `Low evidence quality (${(evidence.overallScore * 100).toFixed(0)}%) — conclusions may be weakly supported.`, evidence.weaknesses as string[], "high"));
    }
    if (snap.durationMs > 6000) {
      weaknesses.push(item("weakness", `Slow execution (${snap.durationMs}ms) — user experience degraded.`, [`duration=${snap.durationMs}ms`], "medium"));
    }

    // ── Improvements ─────────────────────────────────────────────────────────

    if (snap.knowledgeRules < 5) {
      improvements.push(item("improvement", "Run more diverse episodes to expand the knowledge base.", [`current_rules=${snap.knowledgeRules}`, `target=5+`], "high"));
    }
    if (biases.some(b => b.type === "overconfidence")) {
      improvements.push(item("improvement", "Apply confidence calibration to reduce overconfidence bias.", [`calibration_error detected`], "high"));
    }
    if (snap.conflictCount > 2) {
      improvements.push(item("improvement", "Deprecate contradictory knowledge rules to reduce conflict rate.", [`conflicts=${snap.conflictCount}`], "medium"));
    }
    if (!snap.success && snap.confidence > 0.70) {
      improvements.push(item("improvement", "Improve fallback strategies for high-confidence but failed executions.", [`confidence=${(snap.confidence * 100).toFixed(1)}%`, `success=false`], "critical"));
    }

    // ── Retentions ────────────────────────────────────────────────────────────

    if (snap.strategy && snap.strategy !== "unknown") {
      retentions.push(item("retain", `Keep strategy "${snap.strategy}" — it was explicitly selected.`, [`strategy=${snap.strategy}`], "low"));
    }
    if (snap.connectors.length > 0) {
      retentions.push(item("retain", `Retain connector(s): ${snap.connectors.join(", ")} — they contributed to execution.`, snap.connectors, "low"));
    }
    if (snap.inferenceDepth >= 2 && snap.inferenceConf > 0.60) {
      retentions.push(item("retain", "Maintain multi-step inference — it produced confident conclusions.", [`depth=${snap.inferenceDepth}`], "medium"));
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    const outcomeStr = snap.success ? "succeeded" : "FAILED";
    const summary = [
      `Execution ${outcomeStr} with ${(snap.confidence * 100).toFixed(1)}% confidence.`,
      `${biases.length} bias(es) detected, ${issues.length} consistency issue(s).`,
      `${strengths.length} strength(s), ${weaknesses.length} weakness(es), ${improvements.length} improvement(s).`,
    ].join(" ");

    return Object.freeze({
      id:           makeMCId("refl"),
      generatedAt:  Date.now(),
      goal:         snap.goal,
      strengths:    Object.freeze(strengths),
      weaknesses:   Object.freeze(weaknesses),
      improvements: Object.freeze(improvements),
      retentions:   Object.freeze(retentions),
      summary,
    });
  }
}