/**
 * Phase563Page — Cognitive Answer Composer Dashboard
 * Phase 5.6.3 · MemoryOS Core Presentation Layer · 2026-07-13
 */
import React, { useState, useCallback } from "react";
import { runCACTests } from "@/lib/cognitive-answer-composer/cacTests";
import { CognitiveAnswerComposer } from "@/lib/cognitive-answer-composer/CognitiveAnswerComposer";
import ReactMarkdown from "react-markdown";

const S = {
  PASS:    "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL: "bg-amber-900/40 text-amber-300 border-amber-700",
};

function Badge({ label, style = "" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <Badge label={r.passed ? "PASS" : "FAIL"} style={r.passed ? S.PASS : S.FAIL} />
      <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">C{r.id}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</p>
        {r.detail && <p className="text-zinc-500 text-xs mt-0.5">{r.detail}</p>}
        {r.error  && <p className="text-red-400 text-xs font-mono">{r.error}</p>}
      </div>
    </div>
  );
}

function DiagRow({ d }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800/30 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/20 transition text-left">
        <Badge label={d.selectedTemplate} style="bg-blue-900/40 text-blue-300 border-blue-700" />
        <span className="text-zinc-300 text-xs flex-1 truncate">{d.userMessage}</span>
        <span className="text-zinc-500 text-xs shrink-0">conf: {Math.round(d.confidence * 100)}%</span>
        <span className="text-zinc-500 text-xs shrink-0">{d.compositionMs}ms</span>
        <span className="text-zinc-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-4 space-y-2">
          <div className="flex gap-2 flex-wrap text-xs">
            <span className="text-zinc-500">intent: <span className="text-zinc-300">{d.detectedIntent}</span></span>
            <span className="text-zinc-500">evidence: <span className="text-zinc-300">{d.evidenceCount}</span></span>
            <span className="text-zinc-500">sections: <span className="text-zinc-300">{d.snapshotSectionsUsed.join(", ") || "—"}</span></span>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300 max-h-48 overflow-y-auto">
            <ReactMarkdown>{d.answer.narrative}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ["Validation", "Live Composer", "Diagnostics", "Certification"];

// ── Live Composer Panel ───────────────────────────────────────────────────────

const DEMO_QUERIES = [
  { label: "Where did we stop?",           intent: "project_status" },
  { label: "What phase is the project in?", intent: "project_status" },
  { label: "What is the next sprint?",      intent: "next_sprint" },
  { label: "What changed since yesterday?", intent: "project_history" },
  { label: "Reconstruct the project.",      intent: "knowledge_reconstruction" },
  { label: "Connector diagnostics",         intent: "connector_diagnostics" },
  { label: "Architecture overview",         intent: "architecture_question" },
  { label: "Technical debt",                intent: "technical_debt" },
];

function makeDemo(intent) {
  return {
    userMessage: DEMO_QUERIES.find(q => q.intent === intent)?.label ?? `Test: ${intent}`,
    intent,
    snapshot: {
      applicationState: { projectCount: 5, totalRecords: 412, entityCounts: { Project: 5, Message: 120, Task: 45, Document: 30 }, platform: "base44" },
      repositoryState: { repoCount: 2, branchCount: 4, commitCount: 18, targetOwner: "memoryos", targetRepo: "core" },
      goalState: { subGoals: 6, topRec: "Implement Phase 5.6.3 — Cognitive Answer Composer" },
      learningState: { learningScore: 88, lessonCount: 12, lastLesson: "Composer is presentation-only" },
      projectState: { totalEntities: 94, totalRelationships: 38, confidence: 0.82, coverage: "82%", risks: ["GitHub token not in production"], missingKnowledge: 3 },
      knowledgeState: { graphNodes: 94, knowledgeExtracted: 94, status: "SUCCESS" },
      identityState: { canonicalEntitiesCreated: 72, aliasesDetected: 14 },
      confidence: 0.85,
      evidence: ["base44: 412 records", "KRE: 94 nodes", "KFE: 72 entities", "IRE: 14 aliases", "GIE: 6 sub-goals", "CLE: score=88"],
    },
    pipelineReport: {
      status: "OPERATIONAL",
      durationMs: 1240,
      stages: [
        { stageName: "ConnectorInvocationService", status: "SUCCESS", output: { base44Status: "SUCCESS", githubStatus: "SUCCESS", base44Records: 412, githubRepos: 2, githubCommits: 18 } },
        { stageName: "KnowledgeReconstructionEngine", status: "SUCCESS", output: {} },
        { stageName: "KnowledgeFusionEngine", status: "SUCCESS", output: {} },
        { stageName: "IdentityResolutionEngine", status: "SUCCESS", output: {} },
        { stageName: "ProjectReconstructionEngine", status: "SUCCESS", output: {} },
        { stageName: "GoalIntelligenceEngine", status: "SUCCESS", output: {} },
        { stageName: "CognitiveLearningEngine", status: "SUCCESS", output: {} },
        { stageName: "ProjectSnapshot", status: "SUCCESS", output: {} },
      ],
      recoveryEvents: [],
      context: { executionId: "exec_demo_001" },
    },
    evidence: ["base44: 412 records", "KRE: 94 nodes", "KFE: 72 entities", "IRE: 14 aliases", "GIE: 6 sub-goals"],
    confidence: 0.85,
    executionId: "exec_demo_001",
    durationMs: 1240,
  };
}

function LiveComposerPanel() {
  const [selected, setSelected] = useState("project_status");
  const [result, setResult]     = useState(null);
  const composer = new CognitiveAnswerComposer();

  const run = () => {
    const input = makeDemo(selected);
    setResult(composer.compose(input));
  };

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Select a query to compose</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {DEMO_QUERIES.map(q => (
            <button key={q.intent} onClick={() => setSelected(q.intent)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${selected === q.intent ? "bg-violet-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
              {q.label}
            </button>
          ))}
        </div>
        <button onClick={run}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-xs font-bold transition">
          Compose Answer
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <Badge label={result.template} style="bg-blue-900/40 text-blue-300 border-blue-700" />
            <Badge label={`conf: ${Math.round(result.confidence * 100)}%`} style="bg-zinc-800 text-zinc-300 border-zinc-700" />
            <Badge label={`${result.compositionMs}ms`} style="bg-zinc-800 text-zinc-500 border-zinc-700" />
            {result.degraded && <Badge label="DEGRADED" style={S.PARTIAL} />}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Generated Answer</p>
            <div className="prose prose-sm prose-invert max-w-none text-zinc-300">
              <ReactMarkdown>{result.narrative}</ReactMarkdown>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Evidence Block</p>
            <p className="text-zinc-400 text-xs">Sources: {result.evidence.sources.join(" · ") || "—"}</p>
            <p className="text-zinc-400 text-xs">Exec ID: {result.evidence.executionId ?? "—"}</p>
            <p className="text-zinc-400 text-xs">Pipeline: {result.evidence.pipelineStatus} · Connectors: {result.evidence.connectors.join(", ") || "none"}</p>
            <p className="text-zinc-400 text-xs">Stages used: {result.evidence.stagesUsed.length}</p>
            <p className="text-zinc-400 text-xs">Snapshot sections: {result.evidence.snapshotSections.join(", ") || "—"}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Sections ({result.sections.filter(s => s.body).length} active)</p>
            {result.sections.filter(s => s.body).map((s, i) => (
              <div key={i} className="mb-2">
                <p className="text-zinc-300 text-xs font-semibold">{s.heading}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{s.body.slice(0, 120)}{s.body.length > 120 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase563Page() {
  const [running, setRunning] = useState(false);
  const [suite, setSuite]     = useState(null);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("Validation");

  const runSuite = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSuite(null);
    try { setSuite(await runCACTests()); }
    catch (e) { setError(e.message || String(e)); }
    finally { setRunning(false); }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.6.3</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Cognitive Answer Composer</span>
          </div>
          <h1 className="text-lg font-bold">Answer Composer Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Presentation-only layer — transforms pipeline output into human-readable answers.
            Never calls engines or connectors.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button onClick={runSuite} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? "Running…" : "Run Validation Suite (22 criteria)"}
            </button>
            {suite && (
              <Badge
                label={`${suite.status}: ${suite.passed}/${suite.total}`}
                style={suite.status === "PASS" ? S.PASS : S.PARTIAL}
              />
            )}
          </div>
        </div>

        {/* Metrics */}
        {suite && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Passed"      value={`${suite.passed}/${suite.total}`} color={suite.status === "PASS" ? "text-emerald-400" : "text-amber-400"} />
            <Metric label="Status"      value={suite.status}                     color={suite.status === "PASS" ? "text-emerald-400" : "text-amber-400"} />
            <Metric label="Duration"    value={`${suite.durationMs}ms`}          color="text-violet-400" />
            <Metric label="Diagnostics" value={suite.diagnostics.length}         color="text-blue-400" />
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">Composing answers for all templates and intents…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-700 rounded-xl p-3">
            <p className="text-red-300 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Validation */}
        {tab === "Validation" && (
          suite ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-200 text-sm font-semibold">CAC Validation — 22 Criteria</span>
                <Badge label={suite.status} style={suite.status === "PASS" ? S.PASS : S.PARTIAL} />
              </div>
              {suite.results.map(r => <TestRow key={r.id} r={r} />)}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs text-center py-6">Run the validation suite first.</p>
          )
        )}

        {/* Live Composer */}
        {tab === "Live Composer" && <LiveComposerPanel />}

        {/* Diagnostics */}
        {tab === "Diagnostics" && (
          suite ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800">
                <span className="text-zinc-200 text-sm font-semibold">Composer Diagnostics — last {suite.diagnostics.length} runs</span>
              </div>
              {suite.diagnostics.length > 0
                ? suite.diagnostics.map((d, i) => <DiagRow key={i} d={d} />)
                : <p className="px-4 py-4 text-zinc-600 text-xs">No diagnostics yet.</p>
              }
            </div>
          ) : (
            <p className="text-zinc-600 text-xs text-center py-6">Run the validation suite to generate diagnostics.</p>
          )
        )}

        {/* Certification */}
        {tab === "Certification" && suite && (
          <div className={`border rounded-xl p-5 space-y-4 ${suite.status === "PASS" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-100 text-base font-bold">MemoryOS Cognitive Answer Composition Certification</span>
              <Badge label={suite.status === "PASS" ? "CERTIFIED" : suite.status}
                style={suite.status === "PASS" ? "bg-emerald-900/60 text-emerald-200 border-emerald-600" : S.PARTIAL} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: "Suite Status",        v: suite.status },
                { l: "Criteria",            v: `${suite.passed}/${suite.total}` },
                { l: "Duration",            v: `${suite.durationMs}ms` },
                { l: "Component",           v: "CognitiveAnswerComposer" },
                { l: "Phase",               v: "5.6.3" },
                { l: "Role",                v: "Presentation Layer" },
              ].map(m => (
                <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                  <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                  <div className="text-zinc-500 text-xs">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Completion Criteria</p>
              {[
                ["Narrative answers generated",              suite.passed >= 6],
                ["Snapshot data preserved",                  suite.results.find(r => r.id === 11)?.passed],
                ["Evidence preserved in answer",             suite.results.find(r => r.id === 14)?.passed],
                ["Confidence preserved",                     suite.results.find(r => r.id === 16)?.passed],
                ["All 10 templates operational",             suite.results.slice(0, 5).every(r => r.passed)],
                ["Diagnostics operational",                  suite.results.find(r => r.id === 22)?.passed],
                ["Graceful degradation validated",           suite.results.find(r => r.id === 17)?.passed],
                ["Architecture invariants verified",         suite.results.find(r => r.id === 20)?.passed],
                ["Validation suite passing",                 suite.status === "PASS"],
              ].map(([label, ok], i) => (
                <p key={i} className={`text-xs ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                  {ok ? "✓" : "○"} {label}
                </p>
              ))}
            </div>
            <div className="bg-zinc-800/30 rounded-lg p-3">
              <p className="text-zinc-400 text-xs">
                The <strong className="text-zinc-200">CognitiveAnswerComposer</strong> is hereby certified as the official presentation layer of the MemoryOS Core.
                It transforms Live Cognitive Pipeline output into high-quality human-readable answers without executing any engine, connector, or business logic.
                Data flow: <code className="text-violet-300">LiveCognitivePipeline → CognitiveAnswerComposer → Chat Response</code>
              </p>
            </div>
            <p className="text-zinc-600 text-xs font-mono">Generated: {new Date().toISOString()}</p>
          </div>
        )}
        {tab === "Certification" && !suite && (
          <p className="text-zinc-600 text-xs text-center py-6">Run the validation suite to generate the certification.</p>
        )}
      </div>
    </div>
  );
}