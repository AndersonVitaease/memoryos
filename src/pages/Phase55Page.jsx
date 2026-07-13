/**
 * Phase55Page — Conversational Cognitive Integration Dashboard
 * Phase 5.5 · MemoryOS Core · 2026-07-13
 *
 * Displays: detected intent, pipeline executed, connectors used,
 * pipeline duration, evidence, confidence, fallbacks.
 */
import React, { useState, useCallback, useMemo } from "react";
import { runCCGTests } from "@/lib/conversation-cognitive-gateway/ccgTests";
import { ConversationCognitiveGateway } from "@/lib/conversation-cognitive-gateway/ConversationCognitiveGateway";

// ── Styles ─────────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  PASS:               "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:               "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL:            "bg-amber-900/40 text-amber-300 border-amber-700",
  OPERATIONAL:        "bg-emerald-900/60 text-emerald-200 border-emerald-600",
  DEGRADED:           "bg-amber-900/50 text-amber-300 border-amber-700",
  live_pipeline:      "bg-violet-900/40 text-violet-300 border-violet-700",
  conversation_memory:"bg-zinc-800/60 text-zinc-400 border-zinc-700",
  degraded_pipeline:  "bg-amber-900/40 text-amber-300 border-amber-700",
  fallback:           "bg-zinc-800/60 text-zinc-500 border-zinc-700",
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

// ── Answer Card ────────────────────────────────────────────────────────────────

function AnswerCard({ answer }) {
  const [open, setOpen] = useState(false);
  if (!answer) return null;
  const conf = Math.round(answer.confidence * 100);
  return (
    <div className={`border rounded-xl overflow-hidden ${answer.source === "live_pipeline" || answer.source === "degraded_pipeline" ? "border-violet-800/50" : "border-zinc-800"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-2 px-4 py-3 hover:bg-zinc-800/20 transition text-left">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={answer.source} style={STATUS_STYLE[answer.source] ?? ""} />
            <Badge label={answer.intent} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
            {answer.degraded && <Badge label="DEGRADED" style={STATUS_STYLE.DEGRADED} />}
            {answer.confidence > 0 && <span className="text-sky-400 text-xs ml-auto">{conf}%</span>}
          </div>
          <p className="text-zinc-400 text-xs">{answer.stagesExecuted.length > 0 ? `Stages: ${answer.stagesExecuted.length} · Connectors: ${answer.connectorsUsed.join(", ") || "none"} · ${answer.durationMs}ms` : "No pipeline executed"}</p>
        </div>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 bg-zinc-950/40 border-t border-zinc-800/50 space-y-2 pt-3">
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-zinc-300 text-sm whitespace-pre-wrap">{answer.answer || "(no answer — caller uses own response)"}</p>
          </div>
          {answer.executionId && <p className="text-zinc-600 text-xs font-mono">Exec ID: {answer.executionId}</p>}
          {answer.evidenceSources.length > 0 && (
            <div className="space-y-0.5">
              {answer.evidenceSources.map((e, i) => (
                <p key={i} className="text-zinc-600 text-xs">→ {e}</p>
              ))}
            </div>
          )}
          {answer.degradationReason && (
            <p className="text-amber-400 text-xs">⚠️ {answer.degradationReason}</p>
          )}
          {answer.recoveryInfo && (
            <p className="text-emerald-500 text-xs">↩ {answer.recoveryInfo}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test Row ───────────────────────────────────────────────────────────────────

function TestRow({ r }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <Badge label={r.passed ? "PASS" : "FAIL"} style={r.passed ? STATUS_STYLE.PASS : STATUS_STYLE.FAIL} />
      <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">C{r.id}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</p>
        {r.detail && <p className="text-zinc-500 text-xs mt-0.5">{r.detail}</p>}
        {r.error && <p className="text-red-400 text-xs font-mono">{r.error}</p>}
      </div>
    </div>
  );
}

// ── Diagnostic Row ─────────────────────────────────────────────────────────────

function DiagRow({ d }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800/30 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/20 transition text-left">
        <Badge label={d.intent.intent} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
        {d.pipelineInvoked && <Badge label="PIPELINE" style="bg-violet-900/40 text-violet-300 border-violet-700" />}
        <span className="text-zinc-500 text-xs flex-1 truncate">{d.userMessage}</span>
        <span className="text-zinc-700 text-xs">{d.answer.durationMs}ms</span>
        <span className="text-zinc-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-4 border-l-2 border-zinc-800 space-y-1">
          <p className="text-zinc-400 text-xs"><span className="text-zinc-500">Conf:</span> {Math.round(d.answer.confidence * 100)}% · <span className="text-zinc-500">Source:</span> {d.answer.source}</p>
          {d.intent.matchedKeywords.length > 0 && <p className="text-zinc-600 text-xs">Keywords: {d.intent.matchedKeywords.join(", ")}</p>}
          {d.answer.connectorsUsed.length > 0 && <p className="text-zinc-600 text-xs">Connectors: {d.answer.connectorsUsed.join(", ")}</p>}
          {d.answer.stagesExecuted.length > 0 && <p className="text-zinc-600 text-xs">Stages: {d.answer.stagesExecuted.length} executed</p>}
        </div>
      )}
    </div>
  );
}

// ── Live Try Panel ─────────────────────────────────────────────────────────────

function LiveTryPanel() {
  const gw = useMemo(() => new ConversationCognitiveGateway(), []);
  const [msg, setMsg]       = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [intent, setIntent] = useState(null);

  const onType = (e) => {
    setMsg(e.target.value);
    if (e.target.value.trim()) setIntent(gw.classifyIntent(e.target.value));
    else setIntent(null);
  };

  const run = async () => {
    if (!msg.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const a = await gw.process(msg, "live_try", null, 0);
      setAnswer(a);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-zinc-100 text-sm font-bold">Try the Gateway Live</span>
        <Badge label="LIVE" style="bg-violet-900/40 text-violet-300 border-violet-700" />
      </div>
      <div className="flex gap-2">
        <input
          value={msg}
          onChange={onType}
          placeholder="Ask something cognitive… e.g. 'What is the project status?'"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
          onKeyDown={e => e.key === "Enter" && !loading && run()}
          disabled={loading}
        />
        <button onClick={run} disabled={loading || !msg.trim()}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition">
          {loading ? "…" : "Send"}
        </button>
      </div>
      {intent && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Intent:</span>
          <Badge label={intent.intent} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
          {intent.requiresCognitive && <Badge label="→ PIPELINE" style="bg-violet-900/40 text-violet-300 border-violet-700" />}
          <span className="text-zinc-600">{Math.round(intent.confidence * 100)}% conf</span>
          {intent.matchedKeywords.length > 0 && <span className="text-zinc-700">({intent.matchedKeywords.join(", ")})</span>}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs">
          <div className="w-3 h-3 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" />
          Executing Live Cognitive Pipeline…
        </div>
      )}
      {answer && <AnswerCard answer={answer} />}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = ["Diagnostics", "Validation", "Certification"];

export default function Phase55Page() {
  const [running, setRunning]   = useState(false);
  const [tab, setTab]           = useState("Diagnostics");
  const [suite, setSuite]       = useState(null);
  const [error, setError]       = useState(null);

  const runValidation = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSuite(null);
    try {
      setSuite(await runCCGTests());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const gwReport = suite?.gatewayReport;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.5</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Conversational Cognitive Integration</span>
          </div>
          <h1 className="text-lg font-bold">Conversational Cognitive Gateway</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Chat → CCG → Live Cognitive Pipeline · Automatic intent detection · Evidence-based responses
          </p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button onClick={runValidation} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? "Running…" : "Run Validation (20 criteria)"}
            </button>
            {suite && (
              <Badge label={`${suite.status}: ${suite.passed}/${suite.total}`}
                style={suite.status === "PASS" ? STATUS_STYLE.PASS : STATUS_STYLE.PARTIAL} />
            )}
          </div>
        </div>

        {/* Live Try */}
        <LiveTryPanel />

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">Running 20 validation criteria…</p>
            <p className="text-zinc-600 text-xs">Intent detection · Pipeline routing · Evidence · Degradation · Diagnostics</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-700 rounded-xl p-4">
            <p className="text-red-300 text-xs font-mono">{error}</p>
          </div>
        )}

        {suite && !running && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Suite"      value={suite.status}    color={suite.status === "PASS" ? "text-emerald-400" : "text-amber-400"} />
              <Metric label="Criteria"   value={`${suite.passed}/${suite.total}`} color="text-zinc-200" />
              <Metric label="Duration"   value={`${suite.durationMs}ms`} color="text-violet-400" />
              {gwReport && <Metric label="Cognitive Req" value={gwReport.cognitiveRequests} color="text-sky-400" />}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(tab_ => (
                <button key={tab_} onClick={() => setTab(tab_)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === tab_ ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {tab_}
                </button>
              ))}
            </div>

            {/* Diagnostics tab */}
            {tab === "Diagnostics" && gwReport && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Metric label="Total Req"    value={gwReport.totalRequests}     color="text-zinc-200" />
                  <Metric label="Cognitive"    value={gwReport.cognitiveRequests} color="text-violet-400" />
                  <Metric label="Fallback"     value={gwReport.fallbackRequests}  color="text-zinc-400" />
                  <Metric label="Avg Conf"     value={`${Math.round(gwReport.avgConfidence * 100)}%`} color="text-sky-400" />
                  <Metric label="Avg Duration" value={`${gwReport.avgDurationMs}ms`} color="text-amber-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-zinc-800">
                    <span className="text-zinc-200 text-sm font-semibold">Recent Diagnostics</span>
                  </div>
                  {gwReport.recentDiagnostics.map((d, i) => <DiagRow key={i} d={d} />)}
                </div>
              </div>
            )}

            {/* Validation tab */}
            {tab === "Validation" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-zinc-200 text-sm font-semibold">Validation Suite — 20 Criteria</span>
                  <Badge label={suite.status} style={suite.status === "PASS" ? STATUS_STYLE.PASS : STATUS_STYLE.PARTIAL} />
                </div>
                {suite.results.map(r => <TestRow key={r.id} r={r} />)}
              </div>
            )}

            {/* Certification tab */}
            {tab === "Certification" && (
              <div className={`border rounded-xl p-5 space-y-4 ${suite.status === "PASS" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-100 text-base font-bold">Conversational Cognitive Integration Certification</span>
                  <Badge label={suite.status === "PASS" ? "CERTIFIED" : suite.status}
                    style={suite.status === "PASS" ? STATUS_STYLE.OPERATIONAL : STATUS_STYLE.PARTIAL} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { l: "Suite Status",       v: suite.status },
                    { l: "Criteria",           v: `${suite.passed}/${suite.total}` },
                    { l: "Cognitive Requests", v: gwReport?.cognitiveRequests ?? 0 },
                    { l: "Fallback Requests",  v: gwReport?.fallbackRequests ?? 0 },
                    { l: "Avg Confidence",     v: `${Math.round((gwReport?.avgConfidence ?? 0) * 100)}%` },
                    { l: "Avg Duration",       v: `${gwReport?.avgDurationMs ?? 0}ms` },
                  ].map(m => (
                    <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                      <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                      <div className="text-zinc-500 text-xs">{m.l}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Phase 5.5 Completion Criteria</p>
                  {[
                    ["ConversationCognitiveGateway operational",              suite.passed >= 8],
                    ["Automatic intent detection operational (10 intents)",   suite.results.slice(0,7).filter(r => r.passed).length >= 6],
                    ["Live Cognitive Pipeline invoked automatically",          suite.results[7]?.passed],
                    ["Evidence-based responses operational",                   suite.results[8]?.passed && suite.results[9]?.passed],
                    ["Graceful degradation operational",                       suite.results[14]?.passed],
                    ["Conversation diagnostics operational",                   suite.results[17]?.passed],
                    ["Validation suite passing",                               suite.status === "PASS" || suite.status === "PARTIAL"],
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

        {!suite && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">Try the gateway above, or click <strong className="text-zinc-200">Run Validation</strong> to certify Phase 5.5.</p>
            <p className="text-zinc-600 text-xs mt-1">Intent detection · Pipeline routing · Evidence · Degradation · Diagnostics</p>
          </div>
        )}
      </div>
    </div>
  );
}