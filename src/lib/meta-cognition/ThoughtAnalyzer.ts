/**
 * ThoughtAnalyzer.ts — Sprint EF-54
 *
 * SRP: reconstruir o fluxo cognitivo completo a partir de snapshots de execução.
 * Nunca modifica nenhum módulo externo.
 */

import type { CognitiveFlow, CognitiveFlowStep, CognitiveStage } from "./MCTypes";
import { makeMCId } from "./MCTypes";

export interface ThoughtSnapshot {
  goal:              string;
  strategy:          string;
  capabilities:      string[];
  connectors:        string[];
  knowledgeRules:    number;
  inferenceDepth:    number;
  inferenceConf:     number;
  decisionConf:      number;
  decisionAuth:      number;
  optimizationRecs:  number;
  success:           boolean;
  durationMs:        number;
  conflictCount:     number;
  confidence:        number;
  authority:         number;
}

function step(
  stage: CognitiveStage,
  label: string,
  description: string,
  confidence: number,
  authority: number,
  durationMs: number,
  evidenceCount: number,
  issues: string[],
): CognitiveFlowStep {
  return Object.freeze({ stage, label, description, confidence, authority, durationMs, evidenceCount, issues });
}

export class ThoughtAnalyzer {
  analyze(snap: ThoughtSnapshot): CognitiveFlow {
    const steps: CognitiveFlowStep[] = [];

    // Goal
    steps.push(step(
      "goal",
      `Goal: ${snap.goal}`,
      "Objective received and parsed.",
      1, 1, 0, 1,
      snap.goal.trim() === "" ? ["Empty goal — no objective defined"] : [],
    ));

    // Planner
    const planIssues: string[] = [];
    if (snap.durationMs > 5000) planIssues.push("High execution time suggests complex plan");
    steps.push(step(
      "planner",
      "Planner",
      `Plan generated for goal "${snap.goal}".`,
      snap.confidence, snap.authority,
      snap.durationMs * 0.1, 1, planIssues,
    ));

    // Strategy
    const stratIssues: string[] = [];
    if (!snap.strategy || snap.strategy === "unknown") stratIssues.push("Strategy not identified");
    steps.push(step(
      "strategy",
      `Strategy: ${snap.strategy}`,
      "Strategy selected by StrategySelectionEngine.",
      snap.confidence * 0.95, snap.authority * 0.95,
      snap.durationMs * 0.05, 1, stratIssues,
    ));

    // Capability
    const capIssues: string[] = [];
    if (snap.capabilities.length === 0) capIssues.push("No capabilities registered for this execution");
    steps.push(step(
      "capability",
      `Capabilities (${snap.capabilities.length})`,
      snap.capabilities.length > 0
        ? `Used: ${snap.capabilities.slice(0, 3).join(", ")}`
        : "No capabilities used.",
      snap.confidence * 0.90, snap.authority * 0.90,
      snap.durationMs * 0.05, snap.capabilities.length, capIssues,
    ));

    // Knowledge
    const knIssues: string[] = [];
    if (snap.knowledgeRules === 0) knIssues.push("No knowledge retrieved — sparse knowledge base");
    if (snap.knowledgeRules < 3)  knIssues.push("Very few knowledge rules — reasoning may be shallow");
    steps.push(step(
      "knowledge",
      `Knowledge (${snap.knowledgeRules} rules)`,
      `${snap.knowledgeRules} rule(s) retrieved from KnowledgeStore.`,
      snap.confidence * 0.85, snap.authority * 0.90,
      snap.durationMs * 0.10, snap.knowledgeRules, knIssues,
    ));

    // Inference
    const infIssues: string[] = [];
    if (snap.inferenceDepth === 0) infIssues.push("No inference produced");
    if (snap.inferenceDepth > 5)   infIssues.push("Excessive inference depth — possible over-reasoning");
    if (snap.conflictCount > 2)    infIssues.push(`${snap.conflictCount} conflicts detected during inference`);
    steps.push(step(
      "inference",
      `Inference (depth=${snap.inferenceDepth})`,
      `${snap.inferenceDepth} inference steps, ${snap.conflictCount} conflicts.`,
      snap.inferenceConf, snap.authority * 0.85,
      snap.durationMs * 0.20, snap.inferenceDepth, infIssues,
    ));

    // Decision
    const decIssues: string[] = [];
    if (snap.decisionConf < 0.5)  decIssues.push("Low decision confidence");
    if (snap.decisionAuth < 0.5)  decIssues.push("Low decision authority");
    steps.push(step(
      "decision",
      "Decision Builder",
      `Confidence=${(snap.decisionConf * 100).toFixed(1)}% Authority=${(snap.decisionAuth * 100).toFixed(1)}%`,
      snap.decisionConf, snap.decisionAuth,
      snap.durationMs * 0.05, snap.knowledgeRules, decIssues,
    ));

    // Execution
    const execIssues: string[] = [];
    if (!snap.success) execIssues.push("Execution failed");
    if (snap.durationMs > 8000) execIssues.push("Very slow execution");
    steps.push(step(
      "execution",
      `Execution (${snap.success ? "SUCCESS" : "FAILURE"})`,
      `Duration: ${snap.durationMs}ms. Connectors: ${snap.connectors.join(", ") || "none"}.`,
      snap.success ? snap.confidence : snap.confidence * 0.3,
      snap.authority,
      snap.durationMs, snap.connectors.length, execIssues,
    ));

    // Optimization
    steps.push(step(
      "optimization",
      `Optimization (${snap.optimizationRecs} recs)`,
      `${snap.optimizationRecs} optimization recommendation(s) generated by EF-53.`,
      snap.confidence * 0.80, snap.authority * 0.80,
      0, snap.optimizationRecs,
      snap.optimizationRecs === 0 ? ["No optimization recommendations — system performing well or data insufficient"] : [],
    ));

    const issueTotal = steps.reduce((s, st) => s + st.issues.length, 0);
    const overallQuality = Math.max(0, 1 - issueTotal * 0.07);

    return Object.freeze({
      id:             makeMCId("flow"),
      builtAt:        Date.now(),
      goal:           snap.goal,
      steps:          Object.freeze(steps),
      overallQuality,
    });
  }
}