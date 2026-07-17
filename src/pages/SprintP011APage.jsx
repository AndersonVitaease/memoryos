// Sprint P-01.11A — Architecture Freeze Certification Dashboard
import React, { useState } from "react";
import { ExecutionChain }         from "@/lib/execution-chain/ExecutionChain";
import { runExecutionChainCertification } from "@/lib/execution-chain/ExecutionChainCertification";
import { runP01ACertification }   from "@/lib/execution-chain/tests/ExecutionChainP01A.cert";

const GROUPS = [
  { prefix: "R-", label: "Regression",     color: "text-violet-400" },
  { prefix: "I-", label: "Integration",    color: "text-sky-400" },
  { prefix: "A-", label: "Architecture",   color: "text-teal-400" },
  { prefix: "P-", label: "Pipeline",       color: "text-emerald-400" },
  { prefix: "EX-",label: "Explainability", color: "text-amber-400" },
  { prefix: "AU-",label: "Audit",          color: "text-orange-400" },
  { prefix: "RH-",label: "Runtime Health", color: "text-rose-400" },
];

const DELIVERABLES = [
  { id: "EF-01", label: "ExecutionPipeline",          desc: "Executes any PipelineStage sequence",     done: true },
  { id: "EF-02", label: "PipelineStage<I,O>",          desc: "Canonical contract for all runtimes",     done: true },
  { id: "EF-03", label: "PipelineBuilder",             desc: "Assembles canonical 13-stage pipeline",   done: true },
  { id: "EF-04", label: "ExecutionCompositionRoot",    desc: "Single DI composition point",             done: true },
  { id: "EF-05", label: "ExecutionContext",             desc: "Shared context — no ad-hoc params",       done: true },
  { id: "EF-06", label: "ExplainabilityEvidence V2",   desc: "Structured evidence per stage",           done: true },
  { id: "EF-07", label: "RuntimeAuditSink",            desc: "Bus→Audit bridge — no bus.history()",     done: true },
  { id: "EF-08", label: "ExecutionSnapshot",           desc: "Decoupled Dashboard-safe shape",          done: true },
  { id: "EF-09", label: "RuntimeRegistry",             desc: "Runtime discovery + health tracking",     done: true },
  { id: "EF-10", label: "PipelineValidator",           desc: "Pre-execution validation of pipeline",    done: true },
  { id: "EF-11", label: "Runtime Health",              desc: "health() on every RuntimeDescriptor",     done: true },
  { id: "EF-12", label: "External Certification",      desc: "tests/execution-chain/*.cert.ts",         done: true },
  { id: "EF-13", label: "SOLID Certification",         desc: "SRP/OCP/LSP/ISP/DIP all verified",       done: true },
];

function CaseRow({ c }) {
  const group = GROUPS.find(g => c.id.startsWith(g.prefix));
  return (
    <div className={`flex items-start gap-3 px-4 py-1.5 text-xs border-b border-zinc-800 last:border-0 ${c.status === "FAIL" ? "bg-red-950/20" : ""}`}>
      <span className={`font-bold shrink-0 w-4 ${c.status === "PASS" ? "text-emerald-400" : "text-red-400"}`}>{c.status === "PASS" ? "✓" : "✗"}</span>
      <span className={`font-mono shrink-0 w-12 ${group?.color ?? "text-zinc-500"}`}>{c.id.split(" ")[0]}</span>
      <span className="text-zinc-300 flex-1">{c.label.replace(/^[A-Z]+-\d+ — /, "")}</span>
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

export default function SprintP011APage() {
  const [p011a,     setP011A]   = useState(null);
  const [p011,      setP011]    = useState(null);
  const [running,   setRunning] = useState(false);
  const [liveReport, setLiveReport] = useState(null);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveInput, setLiveInput] = useState("What was decided in last Friday's meeting?");
  const [tab, setTab] = useState("deliverables");

  async function runAll() {
    setRunning(true);
    setP011A(null); setP011(null);
    try {
      const [a, b] = await Promise.all([runP01ACertification(), runExecutionChainCertification()]);
      setP011A(a); setP011(b);
    } finally { setRunning(false); }
  }

  async function runLive() {
    setLiveRunning(true); setLiveReport(null);
    try {
      const chain = new ExecutionChain();
      const r = await chain.execute({ text: liveInput, sessionId: `sess-${Date.now().toString(36)}`, userId: "user-freeze", timestamp: Date.now() });
      setLiveReport(r);
    } finally { setLiveRunning(false); }
  }

  const TABS = ["deliverables", "p011a", "p011", "live"];
  const totalCases = (p011a?.total ?? 0) + (p011?.total ?? 0);
  const totalPassed = (p011a?.passed ?? 0) + (p011?.passed ?? 0);
  const allCertified = p011a?.certified && p011?.certified;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT P-01.11A</span>
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">ARCHITECTURE FREEZE</span>
            <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded">CORE HARDENING</span>
            {allCertified && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded">✓ MEMORYOS CORE v1.0</span>}
          </div>
          <h1 className="text-2xl font-bold text-white">MemoryOS Core v1.0 — Architecture Freeze Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            ExecutionChain desacoplada via ExecutionPipeline · PipelineBuilder · ExecutionCompositionRoot · ExecutionContext
          </p>
        </div>

        {/* Architecture principles */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { label: "ExecutionPipeline",    note: "Runs 13 stages" },
            { label: "PipelineStage<I,O>",   note: "Single contract" },
            { label: "PipelineBuilder",      note: "Canonical assembly" },
            { label: "ExecutionCompositionRoot", note: "Only instantiator" },
            { label: "ExecutionContext",      note: "Single param" },
            { label: "PipelineValidator",    note: "Pre-flight check" },
            { label: "RuntimeAuditSink",     note: "Bus→Audit bridge" },
            { label: "RuntimeRegistry",      note: "12 runtimes tracked" },
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
        {p011a && p011 && (
          <div className={`border rounded-lg p-4 ${allCertified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
            <p className={`font-bold text-sm ${allCertified ? "text-emerald-400" : "text-red-400"}`}>
              {allCertified
                ? "✓ P-01.11A ARCHITECTURE FREEZE CERTIFIED — MemoryOS Core v1.0 Complete"
                : "✗ CERTIFICATION INCOMPLETE — Review failed cases"}
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              Total: {totalPassed}/{totalCases} · P-01.11A: {p011a.passed}/{p011a.total} · P-01.11: {p011.passed}/{p011.total}
            </p>
            {allCertified && (
              <div className="mt-2 text-xs text-emerald-300 space-y-0.5">
                <p>✓ Architecture Complete · ✓ Runtime Complete · ✓ Integration Complete · ✓ Hardening Complete · ✓ Architecture Freeze Certified</p>
                <p className="text-emerald-500">NEXT MILESTONE → Memory Intelligence Upgrade</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold capitalize whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t === "p011a" ? "P-01.11A Cert" : t === "p011" ? "P-01.11 Regression" : t}
            </button>
          ))}
        </div>

        {/* Deliverables tab */}
        {tab === "deliverables" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800">
              <p className="text-xs text-zinc-400 uppercase font-bold">EF-01..EF-13 Deliverables</p>
            </div>
            <div className="divide-y divide-zinc-800">
              {DELIVERABLES.map(d => (
                <div key={d.id} className="px-4 py-2 flex items-start gap-3 text-xs">
                  <span className={`font-bold shrink-0 w-4 ${d.done ? "text-emerald-400" : "text-zinc-600"}`}>{d.done ? "✓" : "○"}</span>
                  <span className="text-violet-300 font-bold shrink-0 w-12">{d.id}</span>
                  <span className="text-zinc-200 font-semibold shrink-0 w-52">{d.label}</span>
                  <span className="text-zinc-500">{d.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* P-01.11A cert tab */}
        {tab === "p011a" && (
          <div className="space-y-3">
            <SuiteBadge report={p011a} label="P-01.11A — Architecture Freeze (60 tests)" />
            {p011a && (
              <div>
                {GROUPS.map(g => {
                  const groupCases = p011a.cases.filter(c => c.id.startsWith(g.prefix));
                  if (!groupCases.length) return null;
                  const passed = groupCases.filter(c => c.status === "PASS").length;
                  return (
                    <div key={g.prefix} className="mb-3">
                      <div className="px-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-t flex items-center gap-2">
                        <span className={`text-xs font-bold ${g.color}`}>{g.label}</span>
                        <span className="text-zinc-600 text-xs">{passed}/{groupCases.length}</span>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 border-t-0 rounded-b overflow-hidden">
                        {groupCases.map(c => <CaseRow key={c.id} c={c} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!p011a && !running && <p className="text-zinc-600 text-xs">Run certification to see results.</p>}
          </div>
        )}

        {/* P-01.11 regression tab */}
        {tab === "p011" && (
          <div className="space-y-3">
            <SuiteBadge report={p011} label="P-01.11 Regression (35 tests)" />
            {p011 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {p011.cases.map(c => <CaseRow key={c.id} c={c} />)}
              </div>
            )}
          </div>
        )}

        {/* Live execution tab */}
        {tab === "live" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <input value={liveInput} onChange={e => setLiveInput(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
              <button onClick={runLive} disabled={liveRunning || !liveInput.trim()}
                className="px-6 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm font-semibold transition">
                {liveRunning ? "Executing..." : "▶ Execute Live Pipeline"}
              </button>
            </div>
            {liveReport && (
              <div className="space-y-2">
                <div className={`border rounded-lg p-3 text-sm ${liveReport.status === "COMPLETED" ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
                  <span className={`font-bold ${liveReport.status === "COMPLETED" ? "text-emerald-400" : "text-red-400"}`}>
                    {liveReport.status} · {liveReport.stagesPassed}/{liveReport.stagesTotal} stages · {liveReport.totalDurationMs}ms
                  </span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  {liveReport.stages.map(s => (
                    <div key={s.stage} className="px-4 py-1.5 flex items-center gap-3 text-xs border-b border-zinc-800 last:border-0">
                      <span className={`font-bold w-3 ${s.status === "COMPLETED" ? "text-emerald-400" : "text-red-400"}`}>{s.status === "COMPLETED" ? "✓" : "✗"}</span>
                      <span className="text-zinc-400 w-48 shrink-0">{s.stage}</span>
                      <span className="text-zinc-600">{s.durationMs}ms</span>
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