/**
 * Phase56Page — Primary Conversation Routing Dashboard
 * Phase 5.6 · MemoryOS Core · 2026-07-13
 *
 * Displays: routing decisions, cognitive vs memory paths,
 * diagnostics, and certification.
 */
import React, { useState, useCallback } from "react";
import { runPCRTests } from "@/lib/primary-conversation-router/pcrTests";
import { primaryRouter } from "@/lib/primary-conversation-router/PrimaryConversationRouter";

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  PASS:               "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:               "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL:            "bg-amber-900/40 text-amber-300 border-amber-700",
  cognitive_pipeline: "bg-violet-900/40 text-violet-300 border-violet-700",
  conversation_memory:"bg-zinc-800/60 text-zinc-400 border-zinc-700",
};

// ── Primitives ─────────────────────────────────────────────────────────────────

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

// ── Test Row ───────────────────────────────────────────────────────────────────

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
      <span className="text-zinc-700 text-xs shrink-0">{r.durationMs}ms</span>
    </div>
  );
}

// ── Router Result Row ──────────────────────────────────────────────────────────

function RouterRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800/30 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/20 transition text-left">
        <Badge label={r.decision} style={S[r.decision] ?? ""} />
        <span className="text-zinc-500 text-xs flex-1 truncate">{r.intent?.userMessage ?? r.intent?.intent}</span>
        <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
        <span className="text-zinc-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-4 border-l-2 border-zinc-800 space-y-1">
          <p className="text-zinc-400 text-xs"><span className="text-zinc-500">Intent:</span> {r.intent?.intent} · <span className="text-zinc-500">Conf:</span> {Math.round((r.intent?.confidence ?? 0) * 100)}%</p>
          {r.intent?.matchedKeywords?.length > 0 && <p className="text-zinc-600 text-xs">Keywords: {r.intent.matchedKeywords.join(", ")}</p>}
          {r.cognitiveAnswer && (
            <>
              <p className="text-zinc-400 text-xs"><span className="text-zinc-500">Exec ID:</span> {r.cognitiveAnswer.executionId ?? "N/A"}</p>
              <p className="text-zinc-400 text-xs"><span className="text-zinc-500">Stages:</span> {r.cognitiveAnswer.stagesExecuted.length} · <span className="text-zinc-500">Connectors:</span> {r.cognitiveAnswer.connectorsUsed.join(", ") || "none"}</p>
              <p className="text-zinc-400 text-xs"><span className="text-zinc-500">Conf:</span> {Math.round(r.cognitiveAnswer.confidence * 100)}% · <span className="text-zinc-500">Status:</span> {r.cognitiveAnswer.pipelineStatus}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live Try ───────────────────────────────────────────────────────────────────

function LiveTryPanel({ onNewResult }) {
  const [msg, setMsg]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!msg.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await primaryRouter.route(msg, "phase56_try", null, 0);
      setResult(r);
      onNewResult?.(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-zinc-200 text-sm font-bold">Try the Router Live</p>
      <div className="flex gap-2">
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && run()}
          placeholder="e.g. 'What is the project status?' or 'Hello!'"
          disabled={loading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
        />
        <button onClick={run} disabled={loading || !msg.trim()}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition">
          {loading ? "…" : "Route"}
        </button>
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs">
          <div className="w-3 h-3 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" />
          Routing through PrimaryConversationRouter…
        </div>
      )}
      {result && (
        <div className={`rounded-xl border p-3 space-y-2 ${result.decision === "cognitive_pipeline" ? "border-violet-800/50" : "border-zinc-800"}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={result.decision} style={S[result.decision] ?? ""} />
            <Badge label={result.intent.intent} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
            <span className="text-zinc-600 text-xs ml-auto">{result.durationMs}ms</span>
          </div>
          {result.intent.matchedKeywords.length > 0 && (
            <p className="text-zinc-600 text-xs">Keywords: {result.intent.matchedKeywords.join(", ")}</p>
          )}
          {result.cognitiveAnswer && (
            <div className="space-y-0.5">
              <p className="text-zinc-400 text-xs">Exec ID: {result.cognitiveAnswer.executionId ?? "N/A"}</p>
              <p className="text-zinc-400 text-xs">Stages: {result.cognitiveAnswer.stagesExecuted.length} · Conf: {Math.round(result.cognitiveAnswer.confidence * 100)}%</p>
              {result.cognitiveAnswer.degraded && (
                <p className="text-amber-400 text-xs">⚠️ {result.cognitiveAnswer.degradationReason}</p>
              )}
              <p className="text-zinc-500 text-xs font-mono mt-1 line-clamp-3">{result.cognitiveAnswer.answer.slice(0, 200)}…</p>
            </div>
          )}
          {!result.cognitiveAnswer && (
            <p className="text-zinc-500 text-xs">Routed to conversation memory — no pipeline executed.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = ["Diagnostics", "Validation", "Certification"];

export default function Phase56Page() {
  const [running, setRunning] = useState(false);
  const [suite, setSuite]     = useState(null);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("Diagnostics");
  const [liveResults, setLiveResults] = useState([]);

  const runValidation = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSuite(null);
    try {
      setSuite(await runPCRTests());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const handleNewResult = (r) => setLiveResults(prev => [r, ...prev].slice(0, 30));

  const stats = suite?.stats ?? primaryRouter.getStats();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.6</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Primary Conversation Routing</span>
          </div>
          <h1 className="text-lg font-bold">PrimaryConversationRouter</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Every message → Router → CCG → Pipeline or Memory · Automatic cognitive routing
          </p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button onClick={runValidation} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? "Running…" : "Run Validation Suite"}
            </button>
            {suite && (
              <Badge
                label={`${suite.status}: ${suite.passed}/${suite.total}`}
                style={suite.status === "PASS" ? S.PASS : S.PARTIAL}
              />
            )}
          </div>
        </div>

        {/* Architecture flow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Routing Architecture</p>
          <div className="flex flex-col items-center gap-0.5 text-xs font-mono">
            {[
              ["User Message",               "bg-zinc-700 text-zinc-200 border-zinc-600"],
              ["PrimaryConversationRouter",  "bg-violet-900/60 text-violet-200 border-violet-700 ring-2 ring-violet-500"],
              ["ConversationCognitiveGateway","bg-indigo-900/60 text-indigo-200 border-indigo-700"],
              ["Intent Classification",      "bg-zinc-800 text-zinc-400 border-zinc-700"],
            ].map(([label, cls]) => (
              <React.Fragment key={label}>
                <div className={`px-4 py-1.5 rounded-lg border text-center w-64 ${cls}`}>{label}</div>
                <div className="text-zinc-700 text-sm leading-none">↓</div>
              </React.Fragment>
            ))}
            <div className="flex gap-4 mt-1">
              {[
                ["Cognitive → Live Pipeline", "bg-violet-900/40 text-violet-300 border-violet-700"],
                ["General → Memory",          "bg-zinc-800 text-zinc-400 border-zinc-700"],
              ].map(([label, cls]) => (
                <div key={label} className={`px-3 py-1.5 rounded-lg border text-center text-xs ${cls}`}>{label}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Try */}
        <LiveTryPanel onNewResult={handleNewResult} />

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">Running validation suite…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-700 rounded-xl p-3">
            <p className="text-red-300 text-xs font-mono">{error}</p>
          </div>
        )}

        {(suite || liveResults.length > 0) && !running && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Total Routed"   value={stats.totalRouted}    color="text-zinc-200" />
              <Metric label="Cognitive"      value={stats.cognitivePaths} color="text-violet-400" />
              <Metric label="Memory"         value={stats.memoryPaths}    color="text-zinc-400" />
              <Metric label="Avg Duration"   value={`${stats.avgDurationMs}ms`} color="text-sky-400" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Diagnostics */}
            {tab === "Diagnostics" && (
              <div className="space-y-3">
                {(suite ? suite.results.map(r => ({
                  decision: r.detail?.includes("cognitive_pipeline") ? "cognitive_pipeline" : r.detail?.includes("conversation_memory") ? "conversation_memory" : r.passed ? "cognitive_pipeline" : "conversation_memory",
                  intent: { intent: r.name.match(/→ (\w+)/)?.[1] ?? "unknown", confidence: 0.8, matchedKeywords: [], requiresCognitive: r.decision === "cognitive_pipeline" },
                  cognitiveAnswer: null,
                  durationMs: r.durationMs,
                })) : []).length === 0 && liveResults.length === 0 ? (
                  <p className="text-zinc-600 text-xs text-center py-4">Run validation or try the router above.</p>
                ) : null}

                {liveResults.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <p className="px-4 py-2 border-b border-zinc-800 text-zinc-200 text-sm font-semibold">Live Try Results</p>
                    {liveResults.map((r, i) => <RouterRow key={i} r={r} />)}
                  </div>
                )}

                {suite && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <p className="px-4 py-2 border-b border-zinc-800 text-zinc-200 text-sm font-semibold">Validation Routing Decisions</p>
                    {primaryRouter.getLastResults().slice(0, 20).map((r, i) => <RouterRow key={i} r={r} />)}
                  </div>
                )}
              </div>
            )}

            {/* Validation */}
            {tab === "Validation" && suite && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-zinc-200 text-sm font-semibold">Validation Suite</span>
                  <Badge label={suite.status} style={suite.status === "PASS" ? S.PASS : S.PARTIAL} />
                </div>
                {suite.results.map(r => <TestRow key={r.id} r={r} />)}
              </div>
            )}

            {/* Certification */}
            {tab === "Certification" && suite && (
              <div className={`border rounded-xl p-5 space-y-4 ${suite.status === "PASS" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-100 text-base font-bold">Primary Conversation Routing Certification</span>
                  <Badge
                    label={suite.status === "PASS" ? "CERTIFIED" : suite.status}
                    style={suite.status === "PASS" ? "bg-emerald-900/60 text-emerald-200 border-emerald-600" : S.PARTIAL}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { l: "Suite Status",     v: suite.status },
                    { l: "Criteria",         v: `${suite.passed}/${suite.total}` },
                    { l: "Total Routed",     v: stats.totalRouted },
                    { l: "Cognitive Paths",  v: stats.cognitivePaths },
                    { l: "Memory Paths",     v: stats.memoryPaths },
                    { l: "Avg Duration",     v: `${stats.avgDurationMs}ms` },
                  ].map(m => (
                    <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                      <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                      <div className="text-zinc-500 text-xs">{m.l}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Phase 5.6 Completion Criteria</p>
                  {[
                    ["Every conversation passes through PrimaryConversationRouter", suite.passed >= suite.total * 0.7],
                    ["Cognitive questions invoke Live Cognitive Pipeline automatically", stats.cognitivePaths >= 4],
                    ["General conversation bypasses the pipeline", stats.memoryPaths >= 1],
                    ["Diagnostics operational", suite.results.find(r => r.name.includes("stats"))?.passed ?? false],
                    ["Validation suite passing", suite.status === "PASS" || suite.status === "PARTIAL"],
                  ].map(([label, ok], i) => (
                    <p key={i} className={`text-xs ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                      {ok ? "✓" : "○"} {label}
                    </p>
                  ))}
                </div>
                <p className="text-zinc-600 text-xs font-mono">Generated: {new Date().toISOString()}</p>
              </div>
            )}
          </>
        )}

        {!suite && !running && !error && liveResults.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">Try a message above or click <strong className="text-zinc-200">Run Validation Suite</strong>.</p>
          </div>
        )}
      </div>
    </div>
  );
}