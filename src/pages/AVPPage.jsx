import React, { useState, useRef } from "react";
import { runAVP } from "@/lib/avp/AVPRunner";

// ── Score helpers ──────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 90) return "text-emerald-400";
  if (s >= 70) return "text-yellow-400";
  return "text-red-400";
}
function scoreBg(s) {
  if (s >= 90) return "bg-emerald-900/30 border-emerald-700";
  if (s >= 70) return "bg-yellow-900/30 border-yellow-700";
  return "bg-red-900/30 border-red-700";
}
function statusBadge(status) {
  const styles = {
    PASS:    "bg-emerald-900/50 text-emerald-300 border-emerald-700",
    WARN:    "bg-yellow-900/50 text-yellow-300 border-yellow-700",
    FAIL:    "bg-red-900/50 text-red-300 border-red-700",
    PENDING: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return `text-xs px-2 py-0.5 rounded border font-bold font-mono ${styles[status] ?? styles.PENDING}`;
}
function severityColor(s) {
  return { CRITICAL:"text-red-400", HIGH:"text-orange-400", MEDIUM:"text-yellow-400", LOW:"text-blue-400", INFO:"text-zinc-400" }[s] ?? "text-zinc-400";
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function AuditRow({ id, result, live }) {
  const [open, setOpen] = useState(false);
  const isLive = !result && live === id;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => result && setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="text-zinc-500 font-mono text-xs w-14 shrink-0">{id}</span>
        <span className="text-white text-sm flex-1">{result?.name ?? AUDIT_NAMES[id] ?? id}</span>

        {isLive && (
          <span className="flex items-center gap-1 text-violet-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Running…
          </span>
        )}
        {result && (
          <>
            <span className="font-mono text-xs text-zinc-500 mr-2">{result.durationMs}ms</span>
            <span className={`font-bold font-mono text-sm w-16 text-right ${scoreColor(result.score)}`}>{result.score}</span>
            <span className={statusBadge(result.status)}>{result.status}</span>
            <span className="text-zinc-600 text-xs ml-2">{open ? "▲" : "▼"}</span>
          </>
        )}
      </button>

      {open && result && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3 bg-zinc-950">
          {/* Metrics */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.metrics).map(([k, v]) => (
              <span key={k} className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300 font-mono">
                {k}: <span className="text-violet-300">{String(v)}</span>
              </span>
            ))}
          </div>
          {/* Findings */}
          {result.findings.length > 0 && (
            <div className="space-y-1">
              {result.findings.map((f, i) => (
                <div key={i} className="text-xs font-mono">
                  <span className={`font-bold ${severityColor(f.severity)}`}>[{f.severity}]</span>
                  <span className="text-zinc-400 mx-1">{f.category}:</span>
                  <span className="text-zinc-300">{f.message}</span>
                  {f.detail && <div className="text-zinc-500 ml-10 mt-0.5">{f.detail}</div>}
                </div>
              ))}
            </div>
          )}
          {result.findings.length === 0 && (
            <div className="text-emerald-400 text-xs font-mono">✓ No findings — clean audit</div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, score }) {
  return (
    <div className={`border rounded-lg p-3 text-center ${scoreBg(score)}`}>
      <div className={`text-2xl font-bold font-mono ${scoreColor(score)}`}>{score}</div>
      <div className="text-zinc-400 text-xs mt-1">{label}</div>
    </div>
  );
}

// ── Certificate ────────────────────────────────────────────────────────────────
function Certificate({ report }) {
  if (!report.certified) return null;
  return (
    <div className="border-2 border-violet-500 rounded-2xl p-8 bg-gradient-to-br from-violet-950/40 to-zinc-950 text-center space-y-4">
      <div className="text-violet-300 text-xs font-mono tracking-widest">OFFICIAL CERTIFICATE · MemoryOS Core v1.0</div>
      <div className="text-4xl font-bold text-white">Architecture Freeze</div>
      <div className="text-violet-200 text-lg">OFFICIAL ARCHITECTURE FREEZE CERTIFICATE</div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        {[
          ["Architecture Status", "CERTIFIED"],
          ["Engineering Status",  "CERTIFIED"],
          ["Runtime Status",      "CERTIFIED"],
        ].map(([label, val]) => (
          <div key={label} className="bg-zinc-900/60 rounded-lg p-3 border border-violet-800">
            <div className="text-xs text-zinc-400">{label}</div>
            <div className="text-emerald-400 font-bold text-sm mt-1">{val}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-violet-800 pt-4 text-sm text-zinc-300">
        <div className="font-semibold text-violet-300 mb-2">Approved for:</div>
        <div className="flex justify-center gap-6 text-emerald-400 font-mono">
          <span>✓ Connector Expansion</span>
          <span>✓ Beta Validation</span>
          <span>✓ Production Readiness</span>
        </div>
      </div>

      <div className="text-xs text-zinc-500 font-mono">
        Overall Score: {report.overallScore}/100 · Issued: {new Date().toISOString().slice(0,10)}
      </div>
    </div>
  );
}

// ── Audit names ────────────────────────────────────────────────────────────────
const AUDIT_NAMES = {
  "AVP-01": "Structural Architecture Audit",
  "AVP-02": "Runtime Integrity Audit",
  "AVP-03": "Concurrency Audit",
  "AVP-04": "Session Isolation Audit",
  "AVP-05": "Failure Injection Audit",
  "AVP-06": "Explainability Audit",
  "AVP-07": "Constitution Audit",
  "AVP-08": "Chaos Engineering Audit",
  "AVP-09": "Performance Certification",
  "AVP-10": "Architecture Freeze Certification",
};

const AUDIT_IDS = Object.keys(AUDIT_NAMES);
const REPORT_KEYS = ["avp01","avp02","avp03","avp04","avp05","avp06","avp07","avp08","avp09","avp10"];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AVPPage() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [liveAudit, setLive]  = useState(null);
  const [results, setResults] = useState({});
  const abortRef              = useRef(false);

  async function run() {
    setRunning(true);
    setReport(null);
    setResults({});
    setLive(null);
    abortRef.current = false;

    try {
      const r = await runAVP((auditId, result) => {
        setLive(null);
        setResults(prev => {
          const key = auditId.replace("-","").toLowerCase();
          return { ...prev, [key]: result };
        });
        // Prime next audit
        const idx = AUDIT_IDS.indexOf(auditId);
        if (idx < AUDIT_IDS.length - 1) setLive(AUDIT_IDS[idx + 1]);
      });
      setReport(r);
    } finally {
      setRunning(false);
      setLive(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">ARCHITECTURE VALIDATION PROGRAM</div>
          <h1 className="text-3xl font-bold">Official Architecture Freeze Certification</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Objective: Attempt to DISPROVE the MemoryOS architecture. Certificate issued only if no critical violations are found.
          </p>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {["Architecture: FROZEN","Implementation: COMPLETE","Engineering Quality: CERTIFIED"].map(s => (
            <span key={s} className="bg-violet-900/30 border border-violet-700 text-violet-300 text-xs px-3 py-1 rounded-full">{s}</span>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors"
        >
          {running ? "Running Architecture Validation Program…" : "▶  Run AVP — All 10 Audits"}
        </button>

        {/* Audit list */}
        <div className="space-y-2">
          {AUDIT_IDS.map((id, i) => (
            <AuditRow
              key={id}
              id={id}
              result={results[REPORT_KEYS[i]]}
              live={liveAudit ?? (running && !Object.keys(results).length ? "AVP-01" : null)}
            />
          ))}
        </div>

        {/* Final Report */}
        {report && (
          <>
            {/* Score grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
              <ScoreCard label="Architecture"    score={report.architectureScore} />
              <ScoreCard label="Engineering"     score={report.engineeringScore} />
              <ScoreCard label="Reliability"     score={report.reliabilityScore} />
              <ScoreCard label="Maintainability" score={report.maintainabilityScore} />
              <ScoreCard label="Scalability"     score={report.scalabilityScore} />
            </div>

            {/* Overall */}
            <div className={`border rounded-xl p-6 ${scoreBg(report.overallScore)} flex items-center justify-between`}>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Overall Score</div>
                <div className={`text-5xl font-bold font-mono ${scoreColor(report.overallScore)}`}>{report.overallScore}</div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                  {report.certified ? "CERTIFIED" : "NOT CERTIFIED"}
                </div>
                <div className="text-zinc-400 text-sm mt-1">
                  {report.totalDurationMs}ms total · {report.criticalFindings.length} critical findings
                </div>
              </div>
            </div>

            {/* Critical findings */}
            {report.criticalFindings.length > 0 && (
              <div className="border border-red-800 rounded-lg p-4 bg-red-950/20 space-y-2">
                <div className="text-red-400 font-bold text-sm">Critical Findings ({report.criticalFindings.length})</div>
                {report.criticalFindings.map((f, i) => (
                  <div key={i} className="text-xs text-red-300 font-mono">
                    [{f.category}] {f.message}
                    {f.detail && <div className="text-red-500 ml-4">{f.detail}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Remaining risks */}
            {report.remainingRisks.length > 0 && (
              <div className="border border-yellow-800 rounded-lg p-4 bg-yellow-950/20">
                <div className="text-yellow-400 font-bold text-sm mb-2">Remaining Risks ({report.remainingRisks.length})</div>
                <div className="space-y-1">
                  {report.remainingRisks.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-xs text-yellow-300 font-mono">{r}</div>
                  ))}
                  {report.remainingRisks.length > 10 && (
                    <div className="text-xs text-zinc-500">…and {report.remainingRisks.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            {/* Certificate */}
            <Certificate report={report} />
          </>
        )}
      </div>
    </div>
  );
}