// ══════════════════════════════════════════════════════════════════════════════
// AVP-06 — Explainability Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";

const REQUIRED_EXPLAIN_FIELDS = ["traceId","decisionLog","confidenceScore","humanReadableSummary","stagesExecuted"] as const;

const REQUIRED_AUDIT_FIELDS = ["auditId","complianceStatus","violations","auditedAt","signature"] as const;

const SCENARIOS = [
  "What did we decide about the MVP features last month?",
  "Send the weekly report to the team",
  "Book a meeting with Alice tomorrow at noon",
  "Find the contract document for Project Alpha",
  "What are my highest priority tasks?",
];

export async function runAVP06(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-06", "Explainability Audit");

  for (const text of SCENARIOS) {
    const chain = makeChain(`avp06-${text.slice(0,10).replace(/\s+/g,"_")}`);
    try {
      const r = await chain.execute(inp(text, "avp06-sess"));

      // ── ExplainabilityResult presence ──────────────────────────────────────
      const ex = r.explainabilityResult as Record<string, unknown> | null | undefined;
      if (!ex) {
        finding(a, "CRITICAL", "Explainability", `Missing explainabilityResult for: "${text.slice(0,40)}"`);
        a.score -= 15;
        continue;
      }

      for (const field of REQUIRED_EXPLAIN_FIELDS) {
        if (!(field in ex) || ex[field] === null || ex[field] === undefined) {
          finding(a, "HIGH", "ExplainabilityField", `Field '${field}' missing in explainabilityResult`);
          a.score -= 5;
        }
      }

      // WHY = confidenceScore > 0
      const conf = typeof ex["confidenceScore"] === "number" ? ex["confidenceScore"] as number : -1;
      if (conf < 0) {
        finding(a, "HIGH", "ExplainabilityWHY", "Confidence not present — WHY is not reconstructable");
        a.score -= 5;
      }

      // WHAT = decisionLog non-empty
      const log = ex["decisionLog"];
      if (!Array.isArray(log) || (log as unknown[]).length === 0) {
        finding(a, "HIGH", "ExplainabilityWHAT", "decisionLog empty — WHAT is not reconstructable");
        a.score -= 5;
      }

      // WHEN = timestamp via stages
      const stages = r.stages;
      if (!stages || stages.length === 0) {
        finding(a, "HIGH", "ExplainabilityWHEN", "No stage records — WHEN is not reconstructable");
        a.score -= 5;
      }

      // WHO = userId present in report
      if (!r.userId) {
        finding(a, "HIGH", "ExplainabilityWHO", "userId missing from report — WHO is not reconstructable");
        a.score -= 5;
      }

      // INPUT/OUTPUT = userInput + finalOutput
      if (!r.userInput) {
        finding(a, "HIGH", "ExplainabilityINPUT", "userInput missing from report");
        a.score -= 5;
      }
      // finalOutput may be null on partial pipelines — only warn
      if (r.finalOutput === undefined) {
        finding(a, "MEDIUM", "ExplainabilityOUTPUT", "finalOutput field not present");
        a.score -= 3;
      }

      // POLICIES = check stagesExecuted non-empty
      const stagesExec = ex["stagesExecuted"];
      if (!Array.isArray(stagesExec) || (stagesExec as unknown[]).length === 0) {
        finding(a, "MEDIUM", "ExplainabilityPOLICIES", "stagesExecuted empty — policy trail missing");
        a.score -= 3;
      }

      // ── AuditResult presence ───────────────────────────────────────────────
      const au = r.auditResult as Record<string, unknown> | null | undefined;
      if (!au) {
        finding(a, "CRITICAL", "AuditResult", `Missing auditResult for: "${text.slice(0,40)}"`);
        a.score -= 10;
      } else {
        for (const field of REQUIRED_AUDIT_FIELDS) {
          if (!(field in au)) {
            finding(a, "HIGH", "AuditField", `Audit field '${field}' missing`);
            a.score -= 3;
          }
        }
      }

    } catch (e: unknown) {
      finding(a, "CRITICAL", "ExplainabilityException", `"${text.slice(0,40)}": ${String((e as Error).message ?? e)}`);
      a.score -= 15;
    }
  }

  a.metrics["scenariosTested"] = SCENARIOS.length;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}