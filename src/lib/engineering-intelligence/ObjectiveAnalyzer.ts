/**
 * ObjectiveAnalyzer.ts — Sprint 6.2.1
 * Understands the engineering objective WITHOUT generating code.
 */

import type { ObjectiveAnalysis, RiskLevel, ImplementationStrategy } from "./EITypes";

const COMPLEXITY_KEYWORDS: Array<{ words: string[]; level: RiskLevel }> = [
  { words: ["connector", "oauth", "authentication", "security", "singleton", "pipeline"], level: "HIGH" },
  { words: ["extend", "refactor", "migrate", "replace", "rewrite"], level: "MEDIUM" },
  { words: ["add", "create", "implement", "build", "new"], level: "LOW" },
];

const STRATEGY_HINTS: Array<{ words: string[]; strategy: ImplementationStrategy }> = [
  { words: ["refactor", "rewrite", "migrate", "replace"],   strategy: "REFACTOR" },
  { words: ["extend", "enhance", "improve", "expand"],      strategy: "EXTEND" },
  { words: ["reuse", "use existing", "plug in"],            strategy: "REUSE" },
  { words: ["create", "new", "add", "build", "implement"],  strategy: "CREATE" },
];

let _seq = 0;

export class ObjectiveAnalyzer {
  analyze(objective: string): ObjectiveAnalysis {
    const t0 = Date.now();
    const lower = objective.toLowerCase();
    const words = lower.split(/\s+/);

    // Keywords extraction
    const keywords = words.filter(w => w.length > 3);

    // Required components from noun phrases
    const requiredComponents = this._extractComponents(objective);

    // Dependencies from common engineering patterns
    const dependencies = this._inferDependencies(lower);

    // Complexity estimation
    let complexity: RiskLevel = "LOW";
    for (const rule of COMPLEXITY_KEYWORDS) {
      if (rule.words.some(w => lower.includes(w))) { complexity = rule.level; break; }
    }

    // Strategy suggestion
    let suggestedStrategy: ImplementationStrategy = "CREATE";
    for (const hint of STRATEGY_HINTS) {
      if (hint.words.some(w => lower.includes(w))) { suggestedStrategy = hint.strategy; break; }
    }

    const goal = this._extractGoal(objective);
    const scope = this._inferScope(lower);
    const estimatedImpact = this._inferImpact(lower, complexity);

    return {
      goal,
      scope,
      requiredComponents,
      dependencies,
      estimatedImpact,
      estimatedComplexity: complexity,
      suggestedStrategy,
      keywords: keywords.slice(0, 10),
      durationMs: Date.now() - t0,
    };
  }

  private _extractGoal(objective: string): string {
    const s = objective.trim();
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  }

  private _extractComponents(objective: string): string[] {
    const comps: string[] = [];
    const patterns = [
      /([A-Z][a-zA-Z0-9]*(Engine|Manager|Service|Router|Gateway|Connector|Pipeline|Store|Builder|Analyzer|Inspector))/g,
    ];
    for (const pat of patterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(objective)) !== null) comps.push(m[1]);
    }
    // Extract capitalized noun groups
    const nouns = objective.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
    return [...new Set([...comps, ...nouns])].slice(0, 8);
  }

  private _inferDependencies(lower: string): string[] {
    const deps: string[] = [];
    if (lower.includes("connector"))      deps.push("ConnectorInvocationService", "ConnectorRuntime");
    if (lower.includes("knowledge"))      deps.push("KnowledgeGraphStore");
    if (lower.includes("pipeline"))       deps.push("LiveCognitivePipeline");
    if (lower.includes("memory"))         deps.push("EngineeringMemory");
    if (lower.includes("github"))         deps.push("GitHubConnector");
    if (lower.includes("regression"))     deps.push("EngineeringRegressionSuite");
    if (lower.includes("workflow"))       deps.push("EngineeringWorkflow");
    if (lower.includes("authentication")) deps.push("AuthManager", "OAuthFlow");
    return deps;
  }

  private _inferScope(lower: string): string {
    if (lower.includes("connector"))  return "Integration layer — new connector implementation";
    if (lower.includes("pipeline"))   return "Cognitive pipeline modification";
    if (lower.includes("memory"))     return "Memory layer — persistence or retrieval";
    if (lower.includes("ui") || lower.includes("dashboard")) return "Presentation layer — UI component";
    if (lower.includes("engine"))     return "Core engine implementation";
    return "Additive feature — no stable components expected to change";
  }

  private _inferImpact(lower: string, complexity: RiskLevel): string {
    if (complexity === "CRITICAL") return "Broad — touches multiple stable subsystems";
    if (complexity === "HIGH")     return "Moderate — affects one or more stable components";
    if (complexity === "MEDIUM")   return "Contained — extends existing functionality";
    return "Minimal — additive only, no existing code expected to change";
  }
}