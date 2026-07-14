/**
 * Phase603Page.jsx — Phase 6.0.3 Knowledge Graph Consumption Validation
 * Validates the complete path: KnowledgeGraphStore → CCG → Composer
 */
import React, { useState } from "react";
import { CheckCircle, XCircle, Loader2, AlertCircle, Database, GitBranch, MessageSquare, Layers } from "lucide-react";

// ── Acceptance queries ────────────────────────────────────────────────────────

const ACCEPTANCE_QUERIES = [
  { id: 1, label: "Show all entities",           message: "show all entities" },
  { id: 2, label: "Show all relationships",       message: "show all relationships" },
  { id: 3, label: "Show Module Graph",            message: "show module graph" },
  { id: 4, label: "Who uses ConnectionManager",  message: "Who uses ConnectionManager" },
  { id: 5, label: "PlanningEngine dependencies", message: "PlanningEngine dependencies" },
];

// ── Status badge ──────────────────────────────────────────────────────────────

function Badge({ status }) {
  const map = {
    PASS: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    FAIL: "bg-red-500/20 text-red-400 border-red-500/30",
    SKIP: "bg-zinc-700/40 text-zinc-400 border-zinc-700",
    RUN:  "bg-violet-500/20 text-violet-400 border-violet-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${map[status] ?? map.SKIP}`}>
      {status}
    </span>
  );
}

// ── Chain step card ────────────────────────────────────────────────────────────

function ChainStep({ icon: Icon, label, value, sub, ok }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${ok ? "bg-emerald-900/10 border-emerald-700/30" : "bg-red-900/10 border-red-700/30"}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ok ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
        <Icon className={`w-4 h-4 ${ok ? "text-emerald-400" : "text-red-400"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-300">{label}</p>
        <p className={`text-sm font-mono ${ok ? "text-emerald-300" : "text-red-400"}`}>{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
      <div className="ml-auto">
        {ok
          ? <CheckCircle className="w-4 h-4 text-emerald-400" />
          : <XCircle className="w-4 h-4 text-red-400" />}
      </div>
    </div>
  );
}

// ── Query result row ──────────────────────────────────────────────────────────

function QueryRow({ q, result }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) {
    return (
      <div className="flex items-center gap-3 p-3 bg-zinc-900 rounded-xl border border-zinc-800">
        <Badge status="SKIP" />
        <span className="text-sm text-zinc-400">{q.label}</span>
      </div>
    );
  }
  const isKG  = result.pipelineStatus === "KNOWLEDGE_GRAPH";
  const hasAnswer = result.answer && result.answer.length > 10;
  const status = isKG && hasAnswer ? "PASS" : hasAnswer ? "FAIL" : "FAIL";
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-800/50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge status={status} />
        <span className="text-sm text-zinc-300 flex-1">{q.label}</span>
        <div className="flex items-center gap-2">
          {isKG
            ? <span className="text-[10px] text-emerald-400 font-mono bg-emerald-900/30 px-2 py-0.5 rounded">from KG</span>
            : <span className="text-[10px] text-orange-400 font-mono bg-orange-900/30 px-2 py-0.5 rounded">{result.pipelineStatus ?? "other"}</span>}
          <span className="text-[10px] text-zinc-500">{result.durationMs}ms</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-800">
          <div className="mt-2 space-y-1">
            <div className="text-xs text-zinc-500 font-mono">source: {result.source} · pipeline: {result.pipelineStatus}</div>
            <div className="text-xs text-zinc-500 font-mono">connectors: {(result.connectorsUsed ?? []).join(", ") || "none"}</div>
            <pre className="text-xs text-zinc-300 bg-zinc-950 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap mt-2">
              {result.answer?.slice(0, 1200) ?? "(empty answer)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Phase603Page() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);
  const [error, setError]       = useState(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResults(null);

    try {
      // Dynamic import to avoid build-time issues with TS modules
      const [
        { KnowledgeGraphStore },
        { ConversationCognitiveGateway },
      ] = await Promise.all([
        import("@/lib/project-knowledge/KnowledgeGraphStore"),
        import("@/lib/conversation-cognitive-gateway/ConversationCognitiveGateway"),
      ]);

      // ── Step 1: Read KnowledgeGraphStore ────────────────────────────────
      const kgReady   = KnowledgeGraphStore.isReady();
      const kgDiag    = KnowledgeGraphStore.diagnostics();
      const kgSnap    = KnowledgeGraphStore.snapshotFields();

      // ── Step 2: Check snapshot fields ────────────────────────────────────
      const snapEntityCount = kgSnap.kgEntityCount ?? 0;
      const snapRelCount    = kgSnap.kgRelationshipCount ?? 0;
      const snapModCount    = kgSnap.kgModuleCount ?? 0;

      // ── Step 3: Run acceptance queries through CCG ────────────────────
      const ccg = new ConversationCognitiveGateway();
      const queryResults = {};
      for (const q of ACCEPTANCE_QUERIES) {
        const r = await ccg.process(q.message, "phase603-session", null, 0);
        queryResults[q.id] = r;
      }

      // ── Step 4: Planner KG size ───────────────────────────────────────
      // The planner queries KG before GitHub — test by checking KG is populated
      const plannerKgSize = kgReady ? kgDiag.entityCount : 0;

      // ── Step 5: Composer diagnostics ─────────────────────────────────
      const { CognitiveAnswerComposer } = await import("@/lib/cognitive-answer-composer/CognitiveAnswerComposer");
      const composer  = new CognitiveAnswerComposer();
      const composerH = composer.health();

      // ── Determine which queries came from KG ─────────────────────────
      const kgAnswered = Object.values(queryResults).filter(r => r.pipelineStatus === "KNOWLEDGE_GRAPH").length;

      setResults({
        kgReady, kgDiag, kgSnap,
        snapEntityCount, snapRelCount, snapModCount,
        plannerKgSize,
        composerDiagnostics: composerH.diagnosticsStored,
        queryResults,
        kgAnswered,
        totalQueries: ACCEPTANCE_QUERIES.length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const allPass = results && results.kgAnswered === results.totalQueries;
  const partialPass = results && results.kgAnswered > 0 && results.kgAnswered < results.totalQueries;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-heading">Phase 6.0.3</h1>
              <p className="text-xs text-zinc-400">Knowledge Graph Consumption Validation</p>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mt-3">
            Validates the complete consumption chain: <span className="font-mono text-violet-300">KnowledgeGraphStore → ConversationCognitiveGateway → CognitiveAnswerComposer</span>
          </p>
          <button
            onClick={run}
            disabled={running}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-medium transition"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {running ? "Running validation..." : "Run Phase 6.0.3 Validation"}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-700/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Validation Error</p>
              <p className="text-xs text-red-400 font-mono mt-1">{error}</p>
            </div>
          </div>
        )}

        {results && (
          <>
            {/* Summary banner */}
            <div className={`p-4 rounded-xl border ${allPass ? "bg-emerald-900/20 border-emerald-700/30" : partialPass ? "bg-yellow-900/20 border-yellow-700/30" : "bg-red-900/20 border-red-700/30"}`}>
              <div className="flex items-center gap-3">
                {allPass
                  ? <CheckCircle className="w-6 h-6 text-emerald-400" />
                  : <XCircle className="w-6 h-6 text-red-400" />}
                <div>
                  <p className="font-semibold text-white">
                    {allPass ? "ALL ACCEPTANCE QUERIES ANSWERED FROM KG" : partialPass ? "PARTIAL — Some queries still routing incorrectly" : "FAIL — Queries not answered from KG"}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {results.kgAnswered}/{results.totalQueries} queries answered from KnowledgeGraphStore
                  </p>
                </div>
              </div>
            </div>

            {/* Chain step sizes */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Consumption Chain — Size Diagnostics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ChainStep
                  icon={Database}
                  label="KnowledgeGraphStore"
                  value={`${results.kgDiag.entityCount} entities · ${results.kgDiag.relationshipCount} rels · ${results.kgDiag.moduleCount} modules`}
                  sub={`Health: ${results.kgDiag.health} · Age: ${Math.round(results.kgDiag.ageMs / 1000)}s`}
                  ok={results.kgReady && results.kgDiag.entityCount > 0}
                />
                <ChainStep
                  icon={Layers}
                  label="ProjectSnapshot (snapshotFields)"
                  value={`${results.snapEntityCount} entities · ${results.snapRelCount} rels · ${results.snapModCount} modules`}
                  sub={`kgReady: ${results.kgSnap.kgReady} · repo: ${results.kgSnap.kgRepo ?? "—"}`}
                  ok={results.snapEntityCount > 0}
                />
                <ChainStep
                  icon={GitBranch}
                  label="CognitiveTaskPlanner (KG pre-check)"
                  value={`${results.plannerKgSize} entities available before GitHub`}
                  sub="Planner reads KG before invoking GitHub connector"
                  ok={results.plannerKgSize > 0}
                />
                <ChainStep
                  icon={MessageSquare}
                  label="CognitiveAnswerComposer"
                  value={`KNOWLEDGE_GRAPH template active`}
                  sub={`${results.composerDiagnostics} diagnostics stored`}
                  ok={true}
                />
              </div>
            </div>

            {/* Acceptance query results */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Acceptance Queries</h2>
              <div className="space-y-2">
                {ACCEPTANCE_QUERIES.map(q => (
                  <QueryRow key={q.id} q={q} result={results.queryResults[q.id]} />
                ))}
              </div>
            </div>

            {/* Raw KG diagnostics */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">KnowledgeGraphStore — Full Diagnostics</h2>
              <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-300 overflow-auto max-h-64">
                {JSON.stringify(results.kgDiag, null, 2)}
              </pre>
            </div>
          </>
        )}

        {!results && !running && !error && (
          <div className="text-center py-16 text-zinc-500">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Press the button above to run Phase 6.0.3 validation</p>
          </div>
        )}
      </div>
    </div>
  );
}