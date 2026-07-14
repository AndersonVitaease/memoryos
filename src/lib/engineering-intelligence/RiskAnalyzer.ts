/**
 * RiskAnalyzer.ts — Sprint 6.2.1
 * Classifies every engineering plan as LOW / MEDIUM / HIGH / CRITICAL.
 * Every risk is explained with root cause category.
 */

import type { RiskReport, RiskFactor, RiskLevel, RootCauseCategory, ImpactGraph } from "./EITypes";

interface RiskRule {
  check:    (objective: string, impact: ImpactGraph, regressionCount: number) => boolean;
  factor:   Omit<RiskFactor, "description"> & { descriptionFn: (ctx: { objective: string; impact: ImpactGraph }) => string };
}

const RISK_RULES: RiskRule[] = [
  {
    check: (_, impact) => impact.singletonsTouched.length > 0,
    factor: { level: "HIGH", category: "ARCHITECTURE",
      descriptionFn: ({ impact }) => `Touches singleton(s): ${impact.singletonsTouched.join(", ")} — HMR sensitive, state loss risk` },
  },
  {
    check: (obj) => /connector|oauth|authentication/i.test(obj),
    factor: { level: "HIGH", category: "CONNECTOR",
      descriptionFn: () => "Involves connector / OAuth — authentication and token management risk" },
  },
  {
    check: (_, impact) => impact.affectedPipelines.length > 0,
    factor: { level: "MEDIUM", category: "REGRESSION",
      descriptionFn: ({ impact }) => `Pipeline stages affected: ${impact.affectedPipelines.join(", ")} — acceptance score may degrade` },
  },
  {
    check: (_, impact) => impact.affectedConnectors.length > 1,
    factor: { level: "MEDIUM", category: "CONNECTOR",
      descriptionFn: ({ impact }) => `Multiple connectors affected: ${impact.affectedConnectors.join(", ")}` },
  },
  {
    check: (_, _impact, regCount) => regCount > 2,
    factor: { level: "HIGH", category: "REGRESSION",
      descriptionFn: ({ }) => "Component has recurring regressions in Engineering Memory — high risk of further breakage" },
  },
  {
    check: (obj) => /rewrite|replace|remove|delete/i.test(obj),
    factor: { level: "CRITICAL", category: "ARCHITECTURE",
      descriptionFn: () => "Destructive operation (rewrite/replace/remove) — backward compatibility risk" },
  },
  {
    check: (_, impact) => impact.nodes.filter(n => n.impact === "DIRECT").length > 5,
    factor: { level: "MEDIUM", category: "ARCHITECTURE",
      descriptionFn: ({ impact }) => `${impact.nodes.filter(n => n.impact === "DIRECT").length} components directly impacted — high coordination cost` },
  },
];

function maxLevel(levels: RiskLevel[]): RiskLevel {
  if (levels.includes("CRITICAL")) return "CRITICAL";
  if (levels.includes("HIGH"))     return "HIGH";
  if (levels.includes("MEDIUM"))   return "MEDIUM";
  return "LOW";
}

export class RiskAnalyzer {
  analyze(objective: string, impact: ImpactGraph, regressionCount = 0): RiskReport {
    const t0 = Date.now();
    const factors: RiskFactor[] = [];

    for (const rule of RISK_RULES) {
      if (rule.check(objective, impact, regressionCount)) {
        factors.push({
          description: rule.factor.descriptionFn({ objective, impact }),
          level:       rule.factor.level,
          category:    rule.factor.category,
        });
      }
    }

    const overallRisk = factors.length > 0 ? maxLevel(factors.map(f => f.level)) : "LOW";
    const explanation = factors.length > 0
      ? `Risk=${overallRisk} — ${factors.map(f => f.description).join("; ")}`
      : "LOW risk — no risk factors triggered. Additive implementation with no stable components affected.";

    return { overallRisk, factors, explanation, durationMs: Date.now() - t0 };
  }
}