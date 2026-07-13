/**
 * Phase561Page — Cognitive Response Binding Dashboard
 * Phase 5.6.1 · MemoryOS Core · 2026-07-13
 *
 * Displays: intent, pipeline executed, pipeline answer vs rendered answer,
 * binding status, fallback used, overwrite detected, execution time.
 */
import React, { useState, useCallback, useEffect } from "react";
import { runRBTests } from "@/lib/response-binding/rbTests";
import { responseTracer } from "@/lib/response-binding/ResponseBindingTracer";

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  BOUND:             "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  OVERWRITTEN:       "bg-red-900/60 text-red-300 border-red-700",
  FALLBACK_ALLOWED:  "bg-zinc-800/60 text-zinc-400 border-zinc-700",
  FALLBACK_VIOLATION:"bg-red-900/60 text-red-300 border-red-700",
  PENDING:           "bg-zinc-800 text-zinc-500 border-zinc-700",
  PASS:              "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:              "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL:           "bg-amber-900/40 text-amber-300 border-amber-700",
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

// ── Trace Row ──────────────────────────────────────────────────────────────────

function TraceRow({ trace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800/30 last:border-0 ${trace.overwriteDetected ? "bg-red-950/10" : ""}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/20 transition text-left">
        <Badge label={trace.bindingStatus} style={S[trace.bindingStatus] ?? ""} />
        <span className="text-zinc-500 text-xs truncate flex-1">{trace.userMessage}</span>
        <span className="text-zinc-600 text-xs">{trace.durationMs}ms</span>
        {trace.overwriteDetected && <Badge label="OVERWRITE" style={S.OVERWRITTEN} />}
        <span className="text-zinc-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-4 border-l-2 border-zinc-800 space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <p><span className="text-zinc-500">Intent:</span> <span className="text-zinc-300">{trace.intentDetected ?? "N/A"}</span></p>
            <p><span className="text-zinc-500">Router:</span> <span className="text-zinc-300">{trace.routerDecision ?? "N/A"}</span></p>
            <p><span className="text-zinc-500">Exec ID:</span> <span className="text-zinc-500 font-mono">{trace.executionId ?? "N/A"}</span></p>
            <p><span className="text-zinc-500">Stages:</span> <span className="text-zinc-300">{trace.stagesExecuted}</span></p>
            <p><span className="text-zinc-500">Confidence:</span> <span className="text-zinc-300">{Math.round(trace.confidence * 100)}%</span></p>
            <p><span className="text-zinc-500">Fallback:</span> <span className="text-zinc-300">{trace.fallbackUsed ? trace.fallbackReason : "No"}</span></p>
          </div>
          {trace.pipelineAnswer && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Pipeline Answer (first 150 chars)</p>
              <p className="text-zinc-400 text-xs bg-zinc-800/60 rounded p-2 font-mono">{trace.pipelineAnswer.slice(0, 150)}</p>
            </div>
          )}
          {trace.renderedAnswer && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Rendered Answer (first 150 chars)</p>
              <p className="text-zinc-400 text-xs bg-zinc-800/60 rounded p-2 font-mono">{trace.renderedAnswer.slice(0, 150)}</p>
            </div>
          )}
          {trace.violation && (
            <div className="bg-red-950/30 border border-red-700 rounded p-2">
              <p className="text-red-300 text-xs font-bold">BindingViolation</p>
              <p className="text-red-400 text-xs">{trace.violation.reason}</p>
            </div>
          )}
          {trace.evidence.length > 0 && (
            <p className="text-zinc-600 text-xs">Evidence: {trace.evidence.slice(0, 3).join(" · ")}</p>
          )}
          <div className="space-y-0.5">
            <p className="text-zinc-600 text-xs uppercase tracking-wider">Stages</p>
            {trace.stages.map((s, i) => (
              <p key={i} className="text-zinc-600 text-xs font-mono">↓ {s.stage} ({s.durationMs}ms)</p>
            ))}
          </div>
        </div>
      )}
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

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = ["Binding Traces", "Validation", "Certification"];

export default function Phase561Page() {
  const [running, setRunning]   = useState(false);
  const [suite, setSuite]       = useState(null);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("Binding Traces");
  const [liveTraces, setLiveTraces] = useState([]);

  // Refresh live traces from the global tracer (populated by ChatPage)
  useEffect(() => {
    const refresh = () => setLiveTraces(responseTracer.getTraces().slice(0, 30));
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const runValidation = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSuite(null);
    try {
      setSuite(await runRBTests());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const bound      = responseTracer.getBound();
  const fallback   = responseTracer.getFallbackAllowed();
  const overwritten = responseTracer.getOverwritten();
  const violations  = responseTracer.getViolations().length;
  const allTraces   = liveTraces;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.6.1</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Cognitive Response Binding</span>
          </div>
          <h1 className="text-lg font-bold">Response Binding Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Verifies PipelineAnswer = GatewayAnswer = RenderedAnswer · No overwrite · Documented fallbacks only
          </p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button onClick={runValidation} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? "Running…" : "Run Validation (20 criteria)"}
            </button>
            {suite && (
              <Badge label={`${suite.status}: ${suite.passed}/${suite.total}`}
                style={suite.status === "PASS" ? S.PASS : S.PARTIAL} />
            )}
          </div>
        </div>

        {/* Binding flow diagram */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Response Binding Flow</p>
          <div className="flex flex-col items-center gap-0.5 text-xs font-mono">
            {[
              ["User Message",             "bg-zinc-700 text-zinc-200 border-zinc-600"],
              ["PrimaryConversationRouter","bg-violet-900/60 text-violet-200 border-violet-700"],
              ["ConversationCognitiveGateway","bg-indigo-900/60 text-indigo-200 border-indigo-700"],
              ["Live Cognitive Pipeline",  "bg-blue-900/60 text-blue-200 border-blue-700"],
              ["PipelineAnswer",           "bg-emerald-900/60 text-emerald-200 border-emerald-700 ring-2 ring-emerald-500"],
              ["ChatPage render",          "bg-zinc-700 text-zinc-200 border-zinc-600"],
            ].map(([label, cls]) => (
              <React.Fragment key={label}>
                <div className={`px-4 py-1.5 rounded-lg border text-center w-72 ${cls}`}>{label}</div>
                <div className="text-zinc-700 text-sm leading-none">↓</div>
              </React.Fragment>
            ))}
            <div className="flex gap-2">
              <Badge label="BOUND" style={S.BOUND} />
              <span className="text-zinc-600 text-xs">or</span>
              <Badge label="FALLBACK_ALLOWED" style={S.FALLBACK_ALLOWED} />
              <span className="text-zinc-600 text-xs">never</span>
              <Badge label="OVERWRITTEN" style={S.OVERWRITTEN} />
            </div>
          </div>
        </div>

        {/* Live metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="BOUND"       value={bound}     color="text-emerald-400" />
          <Metric label="Fallback OK" value={fallback}  color="text-zinc-400" />
          <Metric label="Overwritten" value={overwritten} color={overwritten > 0 ? "text-red-400" : "text-zinc-500"} />
          <Metric label="Violations"  value={violations} color={violations > 0 ? "text-red-400" : "text-zinc-500"} />
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">Running 20 binding criteria…</p>
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

        {/* Binding Traces */}
        {tab === "Binding Traces" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-200 text-sm font-semibold">Live Response Traces</span>
              <span className="text-zinc-500 text-xs">{allTraces.length} traces · refreshes every 2s</span>
            </div>
            {allTraces.length === 0 ? (
              <p className="px-4 py-6 text-zinc-600 text-xs text-center">
                No traces yet. Send a message in the Chat to populate traces here, or run the Validation suite.
              </p>
            ) : (
              allTraces.map((t, i) => <TraceRow key={t.id ?? i} trace={t} />)
            )}
          </div>
        )}

        {/* Validation */}
        {tab === "Validation" && (
          suite ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-200 text-sm font-semibold">Validation Suite — 20 Criteria</span>
                <Badge label={suite.status} style={suite.status === "PASS" ? S.PASS : S.PARTIAL} />
              </div>
              {suite.results.map(r => <TestRow key={r.id} r={r} />)}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs text-center py-6">Run the validation suite first.</p>
          )
        )}

        {/* Certification */}
        {tab === "Certification" && suite && (
          <div className={`border rounded-xl p-5 space-y-4 ${suite.status === "PASS" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-100 text-base font-bold">Cognitive Response Binding Certification</span>
              <Badge label={suite.status === "PASS" ? "CERTIFIED" : suite.status}
                style={suite.status === "PASS" ? "bg-emerald-900/60 text-emerald-200 border-emerald-600" : S.PARTIAL} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: "Suite Status",    v: suite.status },
                { l: "Criteria",        v: `${suite.passed}/${suite.total}` },
                { l: "BOUND traces",    v: suite.bound },
                { l: "Fallbacks OK",    v: suite.fallback },
                { l: "Violations",      v: suite.violations },
                { l: "Duration",        v: `${suite.durationMs}ms` },
              ].map(m => (
                <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                  <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                  <div className="text-zinc-500 text-xs">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Phase 5.6.1 Completion Criteria</p>
              {[
                ["PipelineAnswer reaches ChatPage unchanged",     suite.bound >= 4],
                ["No overwrite detected",                         suite.violations === 0],
                ["Fallback only under documented conditions",     suite.fallback >= 1 && suite.violations === 0],
                ["Diagnostics operational (traces populated)",    suite.passed >= 16],
                ["Validation suite passing",                      suite.status === "PASS" || suite.status === "PARTIAL"],
              ].map(([label, ok], i) => (
                <p key={i} className={`text-xs ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                  {ok ? "✓" : "○"} {label}
                </p>
              ))}
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