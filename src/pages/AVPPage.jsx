import React, { useState } from "react";
import { runAVP } from "@/lib/avp/AVPRunner";
import { runACL } from "@/lib/acl/ACLRunner";

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
  return { CRITICAL:"text-red-400", HIGH:"text-orange-400", MEDIUM:"text-yellow-400", LOW:"text-blue-400", INFO:"text-zinc-500" }[s] ?? "text-zinc-400";
}

// ── Audit row (shared between AVP + ACL) ──────────────────────────────────────
function AuditRow({ id, result, live, allNames }) {
  const [open, setOpen] = useState(false);
  const isLive = !result && live === id;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => result && setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="text-zinc-500 font-mono text-xs w-16 shrink-0">{id}</span>
        <span className="text-white text-sm flex-1">{result?.name ?? allNames[id] ?? id}</span>
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
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.metrics).map(([k, v]) => (
              <span key={k} className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300 font-mono">
                {k}: <span className="text-violet-300">{String(v)}</span>
              </span>
            ))}
          </div>
          {result.findings.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
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
          {result.findings.filter(f => f.severity !== "INFO").length === 0 && (
            <div className="text-emerald-400 text-xs font-mono">✓ No issues — clean audit</div>
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

function LayerHeader({ label, subtitle, color }) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${color}`}>
      <div className="font-bold text-sm">{label}</div>
      <div className="text-xs opacity-70 mt-0.5">{subtitle}</div>
    </div>
  );
}

// ── Unified Certificate ───────────────────────────────────────────────────────
function UnifiedCertificate({ avpReport, aclReport }) {
  const unified = avpReport?.certified && aclReport?.certified;

  if (!avpReport || !aclReport) return null;

  return (
    <div className={`border-2 rounded-2xl p-8 text-center space-y-5 ${
      unified
        ? "border-violet-500 bg-gradient-to-br from-violet-950/40 to-zinc-950"
        : "border-red-700 bg-red-950/10"
    }`}>
      <div className={`text-xs font-mono tracking-widest ${unified ? "text-violet-300" : "text-red-400"}`}>
        OFFICIAL CERTIFICATE · MemoryOS Core v1.0
      </div>

      {unified ? (
        <>
          <div className="text-4xl font-bold text-white">Architecture Validation Program v2.0</div>
          <div className="text-violet-200 text-lg">OFFICIAL MEMORYOS CORE v1.0 CERTIFIED</div>

          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              ["Runtime Certification",      "CERTIFIED", avpReport.overallScore],
              ["Architecture Certification", "CERTIFIED", aclReport.overallScore],
              ["Engineering Certification",  "CERTIFIED", avpReport.engineeringScore],
            ].map(([label, val, score]) => (
              <div key={label} className="bg-zinc-900/60 rounded-lg p-3 border border-violet-800">
                <div className="text-xs text-zinc-400">{label}</div>
                <div className="text-emerald-400 font-bold text-sm mt-1">{val}</div>
                <div className="text-violet-300 font-mono text-xs">{score}/100</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs font-mono">
            {[
              ["Dependency Cycles",  aclReport.dependencyCycles,  0],
              ["Layer Bypasses",     aclReport.layerBypasses,      0],
              ["Dead Code",          aclReport.deadCodeCount,      0],
              ["Architecture Drift", aclReport.driftComponents,   0],
            ].map(([label, val, threshold]) => (
              <div key={label} className={`rounded p-2 border ${val <= threshold ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
                <div className="text-zinc-400">{label}</div>
                <div className={`font-bold text-lg ${val <= threshold ? "text-emerald-400" : "text-red-400"}`}>{val}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-violet-800 pt-4 flex justify-center gap-6 text-emerald-400 font-mono text-sm">
            <span>✓ Connector Expansion</span>
            <span>✓ Beta Validation</span>
            <span>✓ Production Readiness</span>
          </div>

          <div className="text-xs text-zinc-500 font-mono">
            AVP Score: {avpReport.overallScore}/100 · ACL Score: {aclReport.overallScore}/100
            · Issued: {new Date().toISOString().slice(0,10)}
          </div>
        </>
      ) : (
        <>
          <div className="text-3xl font-bold text-red-400">Certificate Denied</div>
          <div className="text-zinc-300 text-sm">One or more certification gates failed</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className={`p-3 rounded border ${avpReport.certified ? "border-emerald-700 bg-emerald-950/20 text-emerald-400" : "border-red-700 bg-red-950/20 text-red-400"}`}>
              AVP Runtime: {avpReport.certified ? "PASS" : "FAIL"} ({avpReport.overallScore}/100)
            </div>
            <div className={`p-3 rounded border ${aclReport.certified ? "border-emerald-700 bg-emerald-950/20 text-emerald-400" : "border-red-700 bg-red-950/20 text-red-400"}`}>
              ACL Architecture: {aclReport.certified ? "PASS" : "FAIL"} ({aclReport.overallScore}/100)
            </div>
          </div>
          <div className="text-xs text-zinc-500">Resolve all CRITICAL findings and re-run</div>
        </>
      )}
    </div>
  );
}

// ── Audit name maps ───────────────────────────────────────────────────────────
const AVP_NAMES = {
  "AVP-01": "Structural Architecture Audit",
  "AVP-02": "Runtime Integrity Audit",
  "AVP-03": "Concurrency Audit",
  "AVP-04": "Session Isolation Audit",
  "AVP-05": "Failure Injection Audit",
  "AVP-06": "Explainability Audit",
  "AVP-07": "Constitution Audit",
  "AVP-08": "Chaos Engineering Audit",
  "AVP-09": "Performance Certification",
  "AVP-10": "AVP — Architecture Freeze Certification",
};
const ACL_NAMES = {
  "ACL-01": "Dependency Graph Audit",
  "ACL-02": "Layer Boundary Audit",
  "ACL-03": "Pipeline Integrity Audit",
  "ACL-04": "Registry Integrity Audit",
  "ACL-05": "Public API Audit",
  "ACL-06": "Architecture Drift Audit",
  "ACL-07": "Engineering Rules Audit",
  "ACL-08": "Runtime Ownership Audit",
  "ACL-09": "Architecture Score",
  "ACL-10": "Final Architecture Certification",
};
const ALL_NAMES = { ...AVP_NAMES, ...ACL_NAMES };

const AVP_IDS  = Object.keys(AVP_NAMES);
const ACL_IDS  = Object.keys(ACL_NAMES);
const AVP_KEYS = ["avp01","avp02","avp03","avp04","avp05","avp06","avp07","avp08","avp09","avp10"];
const ACL_KEYS = ["acl01","acl02","acl03","acl04","acl05","acl06","acl07","acl08","acl09","acl10"];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AVPPage() {
  const [avpReport, setAvpReport] = useState(null);
  const [aclReport, setAclReport] = useState(null);
  const [running, setRunning]     = useState(false);
  const [phase, setPhase]         = useState(null); // "avp" | "acl" | null
  const [liveAudit, setLive]      = useState(null);
  const [avpResults, setAvpRes]   = useState({});
  const [aclResults, setAclRes]   = useState({});

  async function run() {
    setRunning(true);
    setAvpReport(null);
    setAclReport(null);
    setAvpRes({});
    setAclRes({});
    setLive(null);

    try {
      // ── Phase 1: AVP ──────────────────────────────────────────────────────
      setPhase("avp");
      setLive("AVP-01");

      const avp = await runAVP((auditId, result) => {
        setLive(null);
        setAvpRes(prev => {
          const key = auditId.replace("-","").toLowerCase();
          return { ...prev, [key]: result };
        });
        const idx = AVP_IDS.indexOf(auditId);
        if (idx < AVP_IDS.length - 1) setLive(AVP_IDS[idx + 1]);
      });
      setAvpReport(avp);

      // ── Phase 2: ACL ──────────────────────────────────────────────────────
      setPhase("acl");
      setLive("ACL-01");

      const acl = await runACL(avp, (auditId, result) => {
        setLive(null);
        setAclRes(prev => {
          const key = auditId.replace("-","").toLowerCase();
          return { ...prev, [key]: result };
        });
        const idx = ACL_IDS.indexOf(auditId);
        if (idx < ACL_IDS.length - 1) setLive(ACL_IDS[idx + 1]);
      });
      setAclReport(acl);

    } finally {
      setRunning(false);
      setPhase(null);
      setLive(null);
    }
  }

  const bothDone = avpReport && aclReport;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">
            ARCHITECTURE VALIDATION PROGRAM v2.0
          </div>
          <h1 className="text-3xl font-bold">Official MemoryOS Core v1.0 Certification</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Runtime Certification (AVP) + Architecture Certification (ACL) + Engineering Certification
          </p>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {["AVP: Runtime Audits","ACL: Architecture Audits","Engineering Quality"].map(s => (
            <span key={s} className="bg-violet-900/30 border border-violet-700 text-violet-300 text-xs px-3 py-1 rounded-full">{s}</span>
          ))}
        </div>

        {/* Phase indicator */}
        {running && (
          <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3">
            <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-sm text-zinc-300">
              {phase === "avp" ? "Phase 1/2 — Running AVP Runtime Audits…"
                              : "Phase 2/2 — Running ACL Architecture Audits…"}
            </span>
            {avpReport && phase === "acl" && (
              <span className={`ml-auto text-xs font-mono font-bold ${avpReport.certified ? "text-emerald-400":"text-red-400"}`}>
                AVP {avpReport.certified ? "✓ PASS" : "✗ FAIL"} ({avpReport.overallScore}/100)
              </span>
            )}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors"
        >
          {running ? "Running AVP + ACL — Full Certification…" : "▶  Run Full Certification (AVP + ACL — 20 Audits)"}
        </button>

        {/* ── AVP Layer ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <LayerHeader
            label="Layer 1 — AVP: Runtime Certification (10 Audits)"
            subtitle="Structural · Runtime · Concurrency · Isolation · Failure · Explainability · Constitution · Chaos · Performance · Freeze"
            color="border-blue-800 bg-blue-950/20 text-blue-300"
          />
          <div className="space-y-2">
            {AVP_IDS.map((id, i) => (
              <AuditRow
                key={id}
                id={id}
                result={avpResults[AVP_KEYS[i]]}
                live={liveAudit}
                allNames={ALL_NAMES}
              />
            ))}
          </div>

          {avpReport && (
            <div className={`border rounded-lg p-4 flex items-center justify-between ${scoreBg(avpReport.overallScore)}`}>
              <div>
                <div className="text-xs text-zinc-400 mb-1">AVP Runtime Score</div>
                <div className={`text-3xl font-bold font-mono ${scoreColor(avpReport.overallScore)}`}>{avpReport.overallScore}/100</div>
              </div>
              <div className={`text-xl font-bold ${avpReport.certified ? "text-emerald-400":"text-red-400"}`}>
                {avpReport.certified ? "✓ RUNTIME CERTIFIED" : "✗ RUNTIME FAILED"}
              </div>
            </div>
          )}
        </div>

        {/* ── ACL Layer ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <LayerHeader
            label="Layer 2 — ACL: Architecture Certification (10 Audits)"
            subtitle="Dependency Graph · Layer Boundary · Pipeline Integrity · Registry · Public API · Drift · Engineering Rules · Ownership · Score · Final Cert"
            color="border-violet-800 bg-violet-950/20 text-violet-300"
          />
          <div className="space-y-2">
            {ACL_IDS.map((id, i) => (
              <AuditRow
                key={id}
                id={id}
                result={aclResults[ACL_KEYS[i]]}
                live={liveAudit}
                allNames={ALL_NAMES}
              />
            ))}
          </div>

          {aclReport && (
            <div className={`border rounded-lg p-4 flex items-center justify-between ${scoreBg(aclReport.overallScore)}`}>
              <div>
                <div className="text-xs text-zinc-400 mb-1">ACL Architecture Score</div>
                <div className={`text-3xl font-bold font-mono ${scoreColor(aclReport.overallScore)}`}>{aclReport.overallScore}/100</div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${aclReport.certified ? "text-emerald-400":"text-red-400"}`}>
                  {aclReport.certified ? "✓ ARCHITECTURE CERTIFIED" : "✗ ARCHITECTURE FAILED"}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  Cycles: {aclReport.dependencyCycles} · Bypasses: {aclReport.layerBypasses}
                  · Dead: {aclReport.deadCodeCount} · Drift: {aclReport.driftComponents}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Final Report ───────────────────────────────────────────────────── */}
        {bothDone && (
          <>
            {/* Score grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ScoreCard label="AVP Runtime"       score={avpReport.overallScore} />
              <ScoreCard label="ACL Architecture"  score={aclReport.overallScore} />
              <ScoreCard label="Engineering"        score={avpReport.engineeringScore} />
              <ScoreCard label="Arch Score"         score={aclReport.architectureScore} />
            </div>

            {/* Critical findings */}
            {(avpReport.criticalFindings.length + aclReport.criticalFindings.length) > 0 && (
              <div className="border border-red-800 rounded-lg p-4 bg-red-950/20 space-y-2">
                <div className="text-red-400 font-bold text-sm">
                  Critical Findings ({avpReport.criticalFindings.length + aclReport.criticalFindings.length})
                </div>
                {[...avpReport.criticalFindings, ...aclReport.criticalFindings].map((f, i) => (
                  <div key={i} className="text-xs text-red-300 font-mono">
                    [{f.category}] {f.message}
                    {f.detail && <div className="text-red-500 ml-4">{f.detail}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Unified Certificate */}
            <UnifiedCertificate avpReport={avpReport} aclReport={aclReport} />
          </>
        )}
      </div>
    </div>
  );
}