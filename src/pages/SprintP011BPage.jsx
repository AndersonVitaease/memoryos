// Sprint P-01.11B — Architecture Freeze Hardening Dashboard
import React, { useState } from "react";
import { runP01BCertification } from "@/lib/execution-chain/tests/ExecutionChainP01B.cert";
import { runP01ACertification } from "@/lib/execution-chain/tests/ExecutionChainP01A.cert";
import { ExecutionChain }        from "@/lib/execution-chain/ExecutionChain";
import { ExecutionSnapshotAssembler } from "@/lib/execution-chain/ExecutionSnapshot";

const GROUPS = [
  { prefix: "ES-", label: "ExecutionState",        color: "text-violet-400" },
  { prefix: "RA-", label: "ReportAssembler",        color: "text-sky-400"    },
  { prefix: "EC-", label: "Explainability Auto",    color: "text-teal-400"   },
  { prefix: "SR-", label: "Self-Registration",      color: "text-emerald-400"},
  { prefix: "DI-", label: "Dashboard Isolation",    color: "text-amber-400"  },
  { prefix: "HC-", label: "Hardening Constraints",  color: "text-orange-400" },
  { prefix: "RG-", label: "Regression",             color: "text-rose-400"   },
];

const EF_B = [
  { id: "EF-14", label: "ExecutionState",            desc: "Replaces StageOutputBag + Map<string,unknown> — fully typed" },
  { id: "EF-15", label: "Pipeline State Propagation",desc: "ExecutionState flows through all 13 stages — no manual copies" },
  { id: "EF-16", label: "ExecutionReportAssembler",  desc: "Sole assembler: ExecutionState → ExecutionChainReport" },
  { id: "EF-17", label: "Explainability Collector",  desc: "Pipeline auto-collects evidence per stage — no manual build" },
  { id: "EF-18", label: "Runtime Self Registration", desc: "descriptor() replaces manual registration in ECR" },
  { id: "EF-19", label: "Dashboard Isolation",       desc: "Dashboard consumes only ExecutionSnapshot via SnapshotAssembler" },
  { id: "EF-20", label: "Architecture Cert Suite",   desc: "50 tests: ES, RA, EC, SR, DI, HC, RG" },
];

function CaseRow({ c }) {
  const group = GROUPS.find(g => c.id.startsWith(g.prefix));
  return (
    <div className={`flex items-start gap-3 px-4 py-1.5 text-xs border-b border-zinc-800 last:border-0 ${c.status === "FAIL" ? "bg-red-950/20" : ""}`}>
      <span className={`font-bold shrink-0 w-3 ${c.status === "PASS" ? "text-emerald-400" : "text-red-400"}`}>{c.status === "PASS" ? "✓" : "✗"}</span>
      <span className={`font-mono shrink-0 w-14 ${group?.color ?? "text-zinc-500"}`}>{c.id}</span>
      <span className="text-zinc-300 flex-1 truncate">{c.label}</span>
      <span className="text-zinc-600 shrink-0">{c.durationMs}ms</span>
      {c.error && <span className="text-red-400 shrink-0 max-w-xs truncate" title={c.error}>{c.error}</span>}
    </div>
  );
}

function SuiteBadge({ report, label }) {
  if (!report) return null;
  return (
    <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`font-bold text-sm ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
          {report.certified ? "✓ CERTIFIED" : "✗ FAILED"} — {label ?? report.suite}
        </span>
        <span className="text-zinc-400 text-xs">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
      </div>
    </div>
  );
}

export default function SprintP011BPage() {
  const [p011b,   setP011B]    = useState(null);
  const [p011a,   setP011A]    = useState(null);
  const [running, setRunning]  = useState(false);
  const [tab,     setTab]      = useState("deliverables");
  const [liveInput, setLiveInput] = useState("What was decided in last Friday's meeting?");
  const [liveReport, setLiveReport] = useState(null);
  const [liveSnap,   setLiveSnap]   = useState(null);
  const [liveRunning, setLiveRunning] = useState(false);

  async function runAll() {
    setRunning(true); setP011B(null); setP011A(null);
    try {
      const [b, a] = await Promise.all([runP01BCertification(), runP01ACertification()]);
      setP011B(b); setP011A(a);
    } finally { setRunning(false); }
  }

  async function runLive() {
    setLiveRunning(true); setLiveReport(null); setLiveSnap(null);
    try {
      const chain  = new ExecutionChain();
      const report = await chain.execute({ text: liveInput, sessionId: `sess-${Date.now().toString(36)}`, userId: "user-b", timestamp: Date.now() });
      const snap   = new ExecutionSnapshotAssembler().fromReport(report);
      setLiveReport(report);
      setLiveSnap(snap);
    } finally { setLiveRunning(false); }
  }

  const allCertified = p011b?.certified && p011a?.certified;
  const TABS = ["deliverables", "p011b", "p011a", "live"];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT P-01.11B</span>
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">ARCHITECTURE FREEZE HARDENING</span>
            {allCertified && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded">✓ MEMORYOS CORE v1.0 — HARDENED</span>}
          </div>
          <h1 className="text-2xl font-bold text-white">MemoryOS Core v1.0 — Architecture Freeze Hardening</h1>
          <p className="text-zinc-400 text-sm mt-1">
            EF-14 ExecutionState · EF-15 State Propagation · EF-16 ReportAssembler · EF-17 Explainability Auto · EF-18 Self-Registration · EF-19 Dashboard Isolation · EF-20 Cert Suite
          </p>
        </div>

        {/* Architecture grid */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { label: "ExecutionState",       note: "Replaces Map + Bag" },
            { label: "State Propagation",    note: "No manual copies"   },
            { label: "ReportAssembler",      note: "Sole report builder" },
            { label: "Explainability Auto",  note: "Pipeline collects" },
            { label: "Self-Registration",    note: "descriptor() API"   },
            { label: "Dashboard Isolation",  note: "Snapshot only"      },
            { label: "ExecutionChain",       note: "5-line orchestrator" },
            { label: "50 Cert Tests",        note: "EF-20 suite"        },
          ].map(m => (
            <div key={m.label} className="border border-zinc-700 rounded p-2">
              <div className="flex items-center gap-1">
                <span className="text-emerald-400">✓</span>
                <span className="text-zinc-200 font-semibold truncate">{m.label}</span>
              </div>
              <p className="text-zinc-500 text-[10px] mt-0.5">{m.note}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={runAll} disabled={running}
            className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition">
            {running ? "Certificando..." : "▶ Run All Certifications"}
          </button>
        </div>

        {/* Summary banners */}
        {p011b && p011a && (
          <div className={`border rounded-lg p-4 ${allCertified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
            <p className={`font-bold text-sm ${allCertified ? "text-emerald-400" : "text-red-400"}`}>
              {allCertified
                ? "✓ P-01.11B HARDENING CERTIFIED — MemoryOS Core v1.0 Architecture Freeze Complete"
                : "✗ CERTIFICATION INCOMPLETE — Review failed cases"}
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              P-01.11B: {p011b.passed}/{p011b.total} · P-01.11A (regression): {p011a.passed}/{p011a.total}
            </p>
            {allCertified && (
              <div className="mt-2 text-xs text-emerald-300 space-y-0.5">
                <p>✓ ExecutionState Complete · ✓ ReportAssembler Complete · ✓ Dashboard Isolated · ✓ Self-Registration Complete · ✓ Architecture Freeze Hardened</p>
                <p className="text-emerald-500">NEXT → Product Validation · Connectors · Real Users</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold capitalize whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t === "p011b" ? "P-01.11B (50 tests)" : t === "p011a" ? "P-01.11A Regression" : t}
            </button>
          ))}
        </div>

        {/* Deliverables */}
        {tab === "deliverables" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800">
              <p className="text-xs text-zinc-400 uppercase font-bold">EF-14..EF-20 Deliverables — P-01.11B</p>
            </div>
            <div className="divide-y divide-zinc-800">
              {EF_B.map(d => (
                <div key={d.id} className="px-4 py-2 flex items-start gap-3 text-xs">
                  <span className="text-emerald-400 font-bold shrink-0 w-4">✓</span>
                  <span className="text-violet-300 font-bold shrink-0 w-12">{d.id}</span>
                  <span className="text-zinc-200 font-semibold shrink-0 w-56">{d.label}</span>
                  <span className="text-zinc-500">{d.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* P-01.11B cert */}
        {tab === "p011b" && (
          <div className="space-y-3">
            <SuiteBadge report={p011b} label="P-01.11B — Hardening (50 tests)" />
            {p011b && (
              <div>
                {GROUPS.map(g => {
                  const gCases = p011b.cases.filter(c => c.id.startsWith(g.prefix));
                  if (!gCases.length) return null;
                  const passed = gCases.filter(c => c.status === "PASS").length;
                  return (
                    <div key={g.prefix} className="mb-3">
                      <div className="px-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-t flex items-center gap-2">
                        <span className={`text-xs font-bold ${g.color}`}>{g.label}</span>
                        <span className="text-zinc-600 text-xs">{passed}/{gCases.length}</span>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 border-t-0 rounded-b overflow-hidden">
                        {gCases.map(c => <CaseRow key={c.id} c={c} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!p011b && !running && <p className="text-zinc-600 text-xs">Run certification to see results.</p>}
          </div>
        )}

        {/* P-01.11A regression */}
        {tab === "p011a" && (
          <div className="space-y-3">
            <SuiteBadge report={p011a} label="P-01.11A — Regression (60 tests)" />
            {p011a && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {p011a.cases.map(c => <CaseRow key={c.id} c={c} />)}
              </div>
            )}
            {!p011a && !running && <p className="text-zinc-600 text-xs">Run certification to see results.</p>}
          </div>
        )}

        {/* Live */}
        {tab === "live" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <input value={liveInput} onChange={e => setLiveInput(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
              <button onClick={runLive} disabled={liveRunning || !liveInput.trim()}
                className="px-6 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm font-semibold transition">
                {liveRunning ? "Executing..." : "▶ Execute + Build Snapshot"}
              </button>
            </div>
            {liveSnap && (
              <div className="space-y-3">
                <div className={`border rounded-lg p-3 ${liveSnap.status === "COMPLETED" ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
                  <p className={`font-bold text-sm ${liveSnap.status === "COMPLETED" ? "text-emerald-400" : "text-red-400"}`}>
                    {liveSnap.status} · {liveSnap.stagesPassed}/{liveSnap.stagesTotal} · {liveSnap.totalDurationMs}ms
                  </p>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-400">
                    <span>Intent: <span className="text-zinc-200">{liveSnap.intentType ?? "—"}</span></span>
                    <span>Connector: <span className="text-zinc-200">{liveSnap.connectorUsed ?? "—"}</span></span>
                    <span>Memorized: <span className="text-zinc-200">{liveSnap.memorized === null ? "—" : String(liveSnap.memorized)}</span></span>
                    <span>Compliance: <span className="text-zinc-200">{liveSnap.compliance ?? "—"}</span></span>
                  </div>
                  {liveSnap.humanSummary && (
                    <p className="mt-2 text-xs text-zinc-400 italic">{liveSnap.humanSummary}</p>
                  )}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-1.5 border-b border-zinc-800 text-xs text-zinc-500 uppercase font-bold">ExecutionSnapshot.stages (Dashboard-safe)</div>
                  {liveSnap.stages.map(s => (
                    <div key={s.stage} className="px-4 py-1.5 flex items-center gap-3 text-xs border-b border-zinc-800 last:border-0">
                      <span className={`font-bold w-3 ${s.status === "COMPLETED" ? "text-emerald-400" : "text-red-400"}`}>{s.status === "COMPLETED" ? "✓" : "✗"}</span>
                      <span className="text-zinc-400 w-48 shrink-0">{s.stage}</span>
                      <span className="text-zinc-600">{s.durationMs}ms</span>
                      <span className="text-zinc-500 truncate">{s.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}