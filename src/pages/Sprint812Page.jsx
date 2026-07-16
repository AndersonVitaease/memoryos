import React, { useState } from "react";
import { runKFECertificationSuite }             from "@/lib/knowledge-fusion-engine/KnowledgeFusionCertificationSuite";
import { runKFEIntegrationCertificationSuite }  from "@/lib/knowledge-fusion-engine/KnowledgeFusionIntegrationCertificationSuite";

const STATUS = {
  idle:    { label: "Ready",      color: "bg-zinc-700 text-zinc-300" },
  running: { label: "Running...", color: "bg-yellow-900 text-yellow-300 animate-pulse" },
  done:    { label: "Complete",   color: "bg-emerald-900 text-emerald-300" },
};

function SuiteResult({ title, badge, report, elapsed }) {
  if (!report) return null;
  return (
    <div className="space-y-3">
      <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{badge}</span>
            <span className={`text-base font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ CERTIFIED" : "✗ FAILED"} — {title}
            </span>
          </div>
          <span className="text-zinc-400 text-xs">{elapsed}ms total</span>
        </div>
        <div className="grid grid-cols-4 gap-4 text-center">
          {[
            { val: report.passed,   label: "Passed",    cls: "text-emerald-400" },
            { val: report.failed,   label: "Failed",    cls: "text-red-400"     },
            { val: report.total,    label: "Total",     cls: "text-zinc-300"    },
            { val: report.passRate+"%", label: "Pass Rate", cls: "text-violet-400" },
          ].map(({ val, label, cls }) => (
            <div key={label}>
              <p className={`text-xl font-bold ${cls}`}>{val}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-800">
          <p className="text-xs text-zinc-400 uppercase">Test Cases</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {report.cases.map((c) => (
            <div key={c.id} className="px-4 py-2 flex items-start gap-3 text-xs">
              <span className={`mt-0.5 font-bold shrink-0 ${c.passed ? "text-emerald-400" : "text-red-400"}`}>
                {c.passed ? "✓" : "✗"}
              </span>
              <span className="text-zinc-500 shrink-0 w-10">{c.id}</span>
              <span className="text-zinc-300 flex-1">{c.description}</span>
              {c.evidence && <span className="text-zinc-500 shrink-0 max-w-xs text-right">{c.evidence}</span>}
              <span className="text-zinc-600 shrink-0">{c.durationMs}ms</span>
              {c.error && <span className="text-red-400 shrink-0 max-w-[200px] truncate" title={c.error}>{c.error}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sprint812Page() {
  const [unitStatus,  setUnitStatus]  = useState("idle");
  const [unitReport,  setUnitReport]  = useState(null);
  const [unitElapsed, setUnitElapsed] = useState(null);

  const [integStatus,  setIntegStatus]  = useState("idle");
  const [integReport,  setIntegReport]  = useState(null);
  const [integElapsed, setIntegElapsed] = useState(null);

  const [bothStatus, setBothStatus] = useState("idle");

  async function runUnit() {
    setUnitStatus("running");
    setUnitReport(null);
    const t0 = Date.now();
    const r  = await runKFECertificationSuite();
    setUnitReport(r);
    setUnitElapsed(Date.now() - t0);
    setUnitStatus("done");
  }

  async function runInteg() {
    setIntegStatus("running");
    setIntegReport(null);
    const t0 = Date.now();
    const r  = await runKFEIntegrationCertificationSuite();
    setIntegReport(r);
    setIntegElapsed(Date.now() - t0);
    setIntegStatus("done");
  }

  async function runBoth() {
    setBothStatus("running");
    setUnitStatus("running");
    setIntegStatus("running");
    setUnitReport(null);
    setIntegReport(null);

    const t0u = Date.now();
    const ru  = await runKFECertificationSuite();
    setUnitReport(ru);
    setUnitElapsed(Date.now() - t0u);
    setUnitStatus("done");

    const t0i = Date.now();
    const ri  = await runKFEIntegrationCertificationSuite();
    setIntegReport(ri);
    setIntegElapsed(Date.now() - t0i);
    setIntegStatus("done");

    setBothStatus("done");
  }

  const isRunning = unitStatus === "running" || integStatus === "running";

  // Pipeline graph from integration suite (static for display)
  const PIPELINE = [
    { name: "ConversationPipeline",      note: "" },
    { name: "PrimaryConversationRouter", note: "" },
    { name: "UnifiedContextBuilder",     note: "→ UnifiedContext" },
    { name: "KnowledgeNormalizer",       note: "→ RawKnowledgeUnit[]", highlight: true, sprint: "8.12.1" },
    { name: "KnowledgeFusionEngine",     note: "→ UnifiedKnowledgeModel", highlight: true, sprint: "8.12" },
    { name: "ConversationGoalBridge",    note: "" },
    { name: "ConversationPlanningEngine", note: "" },
    { name: "ConversationRuntimeEngine", note: "" },
    { name: "UniversalConnectorRouter",  note: "" },
  ];

  const MODULES = [
    { name: "KnowledgeNormalizer",               sprint: "8.12.1", desc: "UnifiedContext → RawKnowledgeUnit[] — sole UCB→KFE adapter" },
    { name: "KnowledgeFusionEngine",             sprint: "8.12",   desc: "RawKnowledgeUnit[] → UnifiedKnowledgeModel — orchestrator" },
    { name: "KnowledgeDeduplicator",             sprint: "8.12",   desc: "Eliminate duplicates across sources" },
    { name: "KnowledgeConflictResolver",         sprint: "8.12",   desc: "Detect & record source conflicts" },
    { name: "KnowledgeRelationshipBuilder",      sprint: "8.12",   desc: "Discover entity relationships" },
    { name: "KnowledgeConfidenceCalculator",     sprint: "8.12",   desc: "Deterministic confidence scoring" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT 8.12</span>
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">SPRINT 8.12.1</span>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS[bothStatus].color}`}>{STATUS[bothStatus].label}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Knowledge Fusion Integration Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Official pipeline: UnifiedContext → KnowledgeNormalizer → RawKnowledgeUnit[] → KnowledgeFusionEngine → UnifiedKnowledgeModel
            <br className="hidden sm:block" />
            No LLM · No Network · No Mocks · No Bypass · MDS v2.0
          </p>
        </div>

        {/* Pipeline graph */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase mb-3">Official Cognitive Pipeline</p>
          <div className="space-y-1">
            {PIPELINE.map((step, i) => (
              <React.Fragment key={step.name}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${step.highlight ? "bg-violet-900 text-violet-200" : "bg-zinc-800 text-zinc-300"}`}>
                    {step.name}
                    {step.sprint && <span className="ml-1 text-violet-400">★{step.sprint}</span>}
                  </span>
                  {step.note && <span className="text-zinc-600 text-xs">{step.note}</span>}
                </div>
                {i < PIPELINE.length - 1 && <div className="text-zinc-700 text-xs pl-2">↓</div>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULES.map((m) => (
            <div key={m.name} className={`border rounded p-3 ${m.sprint === "8.12.1" ? "border-indigo-800 bg-indigo-950" : "border-zinc-800 bg-zinc-900"}`}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-violet-300 text-xs font-semibold">{m.name}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded ${m.sprint === "8.12.1" ? "bg-indigo-800 text-indigo-300" : "bg-zinc-800 text-zinc-500"}`}>{m.sprint}</span>
              </div>
              <p className="text-zinc-500 text-xs">{m.desc}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={runBoth}
            disabled={isRunning}
            className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition"
          >
            {isRunning ? "Running..." : "Run All Certifications"}
          </button>
          <button
            onClick={runUnit}
            disabled={isRunning}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm transition"
          >
            Unit Suite (25 tests)
          </button>
          <button
            onClick={runInteg}
            disabled={isRunning}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm transition"
          >
            Integration Suite (20 tests)
          </button>
        </div>

        {/* Results */}
        <SuiteResult title="Unit Certification"       badge="8.12"   report={unitReport}  elapsed={unitElapsed} />
        <SuiteResult title="Integration Certification" badge="8.12.1" report={integReport} elapsed={integElapsed} />

        {/* Summary when both done */}
        {unitReport && integReport && (
          <div className={`border rounded-lg p-4 ${unitReport.certified && integReport.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
            <p className={`font-bold text-sm ${unitReport.certified && integReport.certified ? "text-emerald-400" : "text-red-400"}`}>
              {unitReport.certified && integReport.certified
                ? "✓ SPRINT 8.12.1 FULLY CERTIFIED — Pipeline integration validated end-to-end"
                : "✗ CERTIFICATION INCOMPLETE — Review failed cases above"}
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              Unit: {unitReport.passed}/{unitReport.total} · Integration: {integReport.passed}/{integReport.total} · Total: {unitReport.passed + integReport.passed}/{unitReport.total + integReport.total}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}