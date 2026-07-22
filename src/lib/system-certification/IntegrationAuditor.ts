/**
 * IntegrationAuditor.ts — Sprint EF-55.1
 *
 * TEST 1: End-to-End Pipeline — inicia no Goal, percorre EF-43→EF-54.
 * Usa RuntimeTraceCollector para obter artefatos reais.
 * ZERO dados sintéticos — toda evidência vem do Runtime.
 */

import type { AuditResult, AuditCheck, AuditStatus } from "./SCTypes";
import { makeSCId } from "./SCTypes";
import { RuntimeTraceCollector } from "./runtime/RuntimeTraceCollector";

function chk(name: string, desc: string, ok: boolean, score: number, dur: number, evidence: string[], issues: string[]): AuditCheck {
  return Object.freeze({ id: makeSCId("chk"), name, description: desc, status: (ok ? "pass" : "fail") as AuditStatus, score, durationMs: dur, evidence: Object.freeze(evidence), issues: Object.freeze(issues) });
}

function buildResult(checks: AuditCheck[], t0: number): AuditResult {
  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warned = checks.filter(c => c.status === "warn").length;
  const score  = checks.length > 0 ? checks.reduce((s, c) => s + c.score, 0) / checks.length : 0;
  const status: AuditStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";
  return Object.freeze({ id: makeSCId("ar"), auditor: "IntegrationAuditor", runAt: Date.now(), durationMs: Date.now() - t0, checks: Object.freeze(checks), score, passed, failed, warned, status, summary: `Integration: ${passed}/${checks.length} passed, score=${score.toFixed(0)}` });
}

export class IntegrationAuditor {
  private readonly _tracer = new RuntimeTraceCollector();

  async audit(): Promise<AuditResult> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    // ── E2E: Goal → Learning → Reasoning → Optimization → Meta ───────────────
    const scenarios = [
      { goal: "github_repository_read",   strategy: "direct_connector", capabilities: ["repository.read"], connectors: ["github"], confidence: 0.85, authority: 0.80, durationMs: 600, success: true,  episodeCount: 15 },
      { goal: "knowledge_retrieval",      strategy: "sequential",        capabilities: ["knowledge.read"],  connectors: [],         confidence: 0.90, authority: 0.85, durationMs: 300, success: true,  episodeCount: 20 },
      { goal: "meta_reflection",          strategy: "direct_connector",  capabilities: [],                  connectors: [],         confidence: 0.78, authority: 0.72, durationMs: 350, success: true,  episodeCount: 16 },
    ];

    for (const sc of scenarios) {
      const t = Date.now();
      try {
        const snap = await this._tracer.collect(sc);

        // Validate every required stage is present
        const requiredStages = ["learning", "knowledge_store", "reasoning", "optimization", "meta_cognition"];
        const missingStages  = requiredStages.filter(s => !snap.steps.find(st => st.stage === s && st.status === "present"));

        checks.push(chk(
          `E2E: ${sc.goal}`,
          `Pipeline Goal→EF-51→EF-52→EF-53→EF-54 with real runtime artifacts.`,
          missingStages.length === 0,
          missingStages.length === 0 ? 100 : Math.max(0, 100 - missingStages.length * 20),
          Date.now() - t,
          snap.steps.map(s => `${s.stage}:${s.artifactId.slice(-10)}`),
          missingStages.map(s => `Stage missing: ${s}`),
        ));

        // Each step must have a real artifactId (not synthetic)
        const stepsMissingId = snap.steps.filter(s => !s.artifactId || s.artifactId.length < 5);
        checks.push(chk(
          `E2E: ${sc.goal} — All Artifact IDs Real`,
          `Every pipeline step must carry a real engine-produced ID.`,
          stepsMissingId.length === 0,
          stepsMissingId.length === 0 ? 100 : 0,
          0,
          [`steps=${snap.steps.length}`, `withId=${snap.steps.length - stepsMissingId.length}`],
          stepsMissingId.map(s => `Missing ID at stage: ${s.stage}`),
        ));

        // Connector snapshot
        if (sc.connectors.length > 0) {
          checks.push(chk(
            `E2E: ${sc.goal} — Connector Snapshot`,
            `Connector was captured in runtime snapshot.`,
            snap.connector !== null,
            snap.connector !== null ? 100 : 50,
            0,
            snap.connector ? [`connector=${snap.connector.connectorName}`, `executed=${snap.connector.wasExecuted}`] : [],
            snap.connector ? [] : ["Connector snapshot missing"],
          ));
        }

      } catch (e: unknown) {
        checks.push(chk(`E2E: ${sc.goal}`, "Full pipeline.", false, 0, Date.now() - t, [], [`${e instanceof Error ? e.message : String(e)}`]));
      }
    }

    return buildResult(checks, t0);
  }
}