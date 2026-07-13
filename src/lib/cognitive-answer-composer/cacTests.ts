/**
 * cacTests.ts — Phase 5.6.3
 * Cognitive Answer Composer Validation Suite · 2026-07-13
 *
 * Validates: narrative generation · snapshot fidelity ·
 *            evidence preservation · template selection ·
 *            graceful degradation · architecture invariants
 */

import { CognitiveAnswerComposer } from "./CognitiveAnswerComposer";
import type { ComposerInput, CACTestResult, CACTestSuite, ComposerDiagnostic } from "./CACTypes";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    applicationState: {
      projectCount: 5,
      totalRecords: 412,
      entityCounts: { Project: 5, Message: 120, Task: 45, Document: 30, ChatSession: 12, KnowledgeEntity: 200 },
      platform: "base44",
    },
    repositoryState: {
      repoCount: 2,
      branchCount: 4,
      commitCount: 18,
      targetOwner: "memoryos",
      targetRepo: "core",
    },
    goalState: {
      subGoals: 6,
      topRec: "Implement Phase 5.6.3 — Cognitive Answer Composer",
    },
    learningState: {
      learningScore: 88,
      lessonCount: 12,
      lastLesson: "CognitiveAnswerComposer is a presentation-only layer",
    },
    projectState: {
      totalEntities: 94,
      totalRelationships: 38,
      confidence: 0.82,
      coverage: "82%",
      risks: ["GitHub token not in production env"],
      missingKnowledge: 3,
      providersUsed: ["base44"],
    },
    knowledgeState: {
      graphNodes: 94,
      knowledgeExtracted: 94,
      status: "SUCCESS",
    },
    identityState: {
      canonicalEntitiesCreated: 72,
      aliasesDetected: 14,
      versionsDetected: 3,
    },
    confidence: 0.85,
    evidence: [
      "base44: 412 records fetched",
      "github: 2 repos · 18 commits",
      "KRE: 94 nodes extracted",
      "KFE: 72 unique entities",
      "IRE: 14 aliases detected",
      "PRE: coverage=82%",
      "GIE: 6 sub-goals",
      "CLE: score=88",
    ],
    ...overrides,
  };
}

function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "OPERATIONAL",
    durationMs: 1240,
    stagesPassed: 9,
    stagesTotal: 11,
    stages: [
      { stageName: "ConnectorInvocationService", status: "SUCCESS", output: { base44Status: "SUCCESS", githubStatus: "SUCCESS", base44Records: 412, githubRepos: 2, githubCommits: 18 } },
      { stageName: "KnowledgeReconstructionEngine", status: "SUCCESS", output: {} },
      { stageName: "KnowledgeFusionEngine", status: "SUCCESS", output: {} },
      { stageName: "IdentityResolutionEngine", status: "SUCCESS", output: {} },
      { stageName: "ProjectReconstructionEngine", status: "SUCCESS", output: {} },
      { stageName: "GoalIntelligenceEngine", status: "SUCCESS", output: {} },
      { stageName: "CognitiveLearningEngine", status: "SUCCESS", output: {} },
      { stageName: "KnowledgeGraphUpdate", status: "SUCCESS", output: {} },
      { stageName: "ProjectSnapshot", status: "SUCCESS", output: {} },
    ],
    recoveryEvents: [],
    context: { executionId: "exec_test_001" },
    ...overrides,
  };
}

function makeInput(intent: string, overrides: Partial<ComposerInput> = {}): ComposerInput {
  return {
    userMessage: `Test: ${intent}`,
    intent,
    snapshot: makeSnapshot(),
    pipelineReport: makeReport(),
    evidence: makeSnapshot().evidence as string[],
    confidence: 0.85,
    executionId: "exec_test_001",
    durationMs: 1240,
    ...overrides,
  };
}

function chk(id: number, name: string, fn: () => string | boolean, ms = 0): CACTestResult {
  const t0 = Date.now();
  try {
    const r      = fn();
    const passed = r === true || (typeof r === "string" && !r.startsWith("FAIL"));
    return { id, name, passed, durationMs: ms || Date.now() - t0, detail: typeof r === "string" ? r : passed ? "OK" : "FAIL", error: null };
  } catch (e) {
    return { id, name, passed: false, durationMs: Date.now() - t0, detail: "Exception", error: String(e) };
  }
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runCACTests(): Promise<CACTestSuite> {
  const t0         = Date.now();
  const results: CACTestResult[]  = [];
  const diagList: ComposerDiagnostic[] = [];
  const composer   = new CognitiveAnswerComposer();

  // ── T1-T5: Template Selection ──────────────────────────────────────────────
  results.push(chk(1, "PROJECT_STATUS template selected for project_status", () => {
    const a = composer.compose(makeInput("project_status"));
    return a.template === "PROJECT_STATUS" ? `template=${a.template}` : `FAIL: ${a.template}`;
  }));
  results.push(chk(2, "NEXT_SPRINT template selected for next_sprint", () => {
    const a = composer.compose(makeInput("next_sprint"));
    return a.template === "NEXT_SPRINT" ? `template=${a.template}` : `FAIL: ${a.template}`;
  }));
  results.push(chk(3, "ARCHITECTURE template selected for architecture_question", () => {
    const a = composer.compose(makeInput("architecture_question"));
    return a.template === "ARCHITECTURE" ? `template=${a.template}` : `FAIL: ${a.template}`;
  }));
  results.push(chk(4, "CONNECTOR_STATUS template selected for connector_diagnostics", () => {
    const a = composer.compose(makeInput("connector_diagnostics"));
    return a.template === "CONNECTOR_STATUS" ? `template=${a.template}` : `FAIL: ${a.template}`;
  }));
  results.push(chk(5, "TECHNICAL_DEBT template selected for technical_debt", () => {
    const a = composer.compose(makeInput("technical_debt"));
    return a.template === "TECHNICAL_DEBT" ? `template=${a.template}` : `FAIL: ${a.template}`;
  }));

  // ── T6-T10: Narrative Generation ──────────────────────────────────────────
  const QUERIES = [
    ["Where did we stop?", "project_status"],
    ["What phase is the project in?", "project_status"],
    ["What is the next sprint?", "next_sprint"],
    ["What changed since yesterday?", "project_history"],
    ["Reconstruct the project.", "knowledge_reconstruction"],
  ];

  for (let i = 0; i < QUERIES.length; i++) {
    const [q, intent] = QUERIES[i];
    results.push(chk(6 + i, `Narrative generated for: "${q}"`, () => {
      const a = composer.compose({ ...makeInput(intent), userMessage: q });
      const hasNarrative = a.narrative.length > 50;
      const hasSections  = a.sections.some(s => s.body.length > 0);
      return hasNarrative && hasSections
        ? `narrative=${a.narrative.length}chars, sections=${a.sections.filter(s => s.body).length}`
        : `FAIL: narrative too short or no sections`;
    }));
    const d = composer.getLastDiagnostic();
    if (d) diagList.push(d);
  }

  // ── T11-T13: Snapshot Fidelity ─────────────────────────────────────────────
  results.push(chk(11, "Snapshot data preserved in PROJECT_STATUS", () => {
    const a = composer.compose(makeInput("project_status"));
    const hasProjects = a.narrative.includes("5") || a.narrative.includes("project");
    const hasRecords  = a.narrative.includes("412") || a.narrative.includes("record");
    return hasProjects && hasRecords ? "snapshot data present" : `FAIL: projects=${hasProjects}, records=${hasRecords}`;
  }));
  results.push(chk(12, "Repository data preserved when GitHub available", () => {
    const a = composer.compose(makeInput("project_status"));
    const hasRepo = a.narrative.includes("repo") || a.narrative.includes("commit") || a.narrative.includes("branch");
    return hasRepo ? "repo data present" : `FAIL: no repo data in narrative`;
  }));
  results.push(chk(13, "Goal recommendation preserved", () => {
    const a = composer.compose(makeInput("next_sprint"));
    const hasRec = a.narrative.includes("Phase 5.6.3") || a.narrative.includes("Composer");
    return hasRec ? "recommendation preserved" : `FAIL: recommendation not found in narrative`;
  }));

  // ── T14-T16: Evidence Preservation ────────────────────────────────────────
  results.push(chk(14, "Evidence sources preserved in answer", () => {
    const a = composer.compose(makeInput("project_status"));
    return a.evidence.sources.length > 0 ? `${a.evidence.sources.length} sources` : `FAIL: no evidence`;
  }));
  results.push(chk(15, "ExecutionId preserved in evidence block", () => {
    const a = composer.compose(makeInput("project_status"));
    return a.evidence.executionId === "exec_test_001" ? "executionId preserved" : `FAIL: ${a.evidence.executionId}`;
  }));
  results.push(chk(16, "Confidence preserved in evidence block", () => {
    const a = composer.compose(makeInput("project_status"));
    return a.evidence.confidence === 0.85 ? `confidence=0.85` : `FAIL: ${a.evidence.confidence}`;
  }));

  // ── T17-T19: Graceful Degradation ─────────────────────────────────────────
  results.push(chk(17, "Degradation detected when GitHub unavailable", () => {
    const degradedReport = makeReport({
      status: "DEGRADED",
      stages: [
        { stageName: "ConnectorInvocationService", status: "SUCCESS", output: { base44Status: "SUCCESS", githubStatus: "NOT_CONFIGURED" } },
      ],
    });
    const a = composer.compose(makeInput("project_status", { pipelineReport: degradedReport }));
    return a.degraded && a.degradationNote !== null
      ? `degraded=true, note="${a.degradationNote?.slice(0, 40)}..."`
      : `FAIL: degraded=${a.degraded}, note=${a.degradationNote}`;
  }));
  results.push(chk(18, "Degradation note appears in narrative", () => {
    const degradedReport = makeReport({
      status: "DEGRADED",
      stages: [{ stageName: "ConnectorInvocationService", status: "SUCCESS", output: { base44Status: "SUCCESS", githubStatus: "NOT_CONFIGURED" } }],
    });
    const a = composer.compose(makeInput("connector_diagnostics", { pipelineReport: degradedReport }));
    return a.narrative.toLowerCase().includes("partial") || a.narrative.toLowerCase().includes("not configured")
      ? "degradation note in narrative"
      : `FAIL: degradation not surfaced`;
  }));
  results.push(chk(19, "Both connectors unavailable — confidence note surfaced", () => {
    const degradedReport = makeReport({
      status: "FAILED",
      stages: [{ stageName: "ConnectorInvocationService", status: "SUCCESS", output: { base44Status: "NOT_CONFIGURED", githubStatus: "NOT_CONFIGURED" } }],
    });
    const a = composer.compose(makeInput("project_status", { pipelineReport: degradedReport, confidence: 0.3 }));
    return a.degraded ? `degraded=true, confidence=${a.confidence}` : `FAIL: degraded not set`;
  }));

  // ── T20-T22: Architecture Invariants ──────────────────────────────────────
  results.push(chk(20, "Composer does not modify snapshot", () => {
    const snap = makeSnapshot();
    const snapStr = JSON.stringify(snap);
    composer.compose(makeInput("project_status", { snapshot: snap }));
    return JSON.stringify(snap) === snapStr ? "snapshot immutable" : `FAIL: snapshot was mutated`;
  }));
  results.push(chk(21, "Composer produces ComposedAnswer with all required fields", () => {
    const a = composer.compose(makeInput("project_status"));
    const fields = ["id", "template", "narrative", "sections", "evidence", "confidence", "composedAt", "compositionMs"];
    const missing = fields.filter(f => (a as any)[f] === undefined);
    return missing.length === 0 ? "all fields present" : `FAIL: missing ${missing.join(", ")}`;
  }));
  results.push(chk(22, "Diagnostics stored for every compose call", () => {
    const before = composer.getDiagnostics().length;
    composer.compose(makeInput("next_sprint"));
    const after  = composer.getDiagnostics().length;
    return after === before + 1 ? `diagnostics: ${before} → ${after}` : `FAIL: ${before} → ${after}`;
  }));

  // ── Collect diagnostics ────────────────────────────────────────────────────
  const allDiags = composer.getDiagnostics().slice(0, 10);

  const passed = results.filter(r => r.passed).length;
  const status: CACTestSuite["status"] =
    passed === results.length ? "PASS" : passed >= Math.ceil(results.length * 0.75) ? "PARTIAL" : "FAIL";

  return {
    passed, total: results.length, durationMs: Date.now() - t0,
    status, results, diagnostics: allDiags,
  };
}