import React, { useState } from "react";
import { LiveCognitivePipeline } from "@/lib/live-cognitive-pipeline/LiveCognitivePipeline";

const PIPELINE = [
  {
    stage: "01",
    name: "Repository",
    engine: "RepositoryAnalyzer + RepositoryKnowledgeBuilder",
    sprint: "M-01",
    output: "ProjectKnowledgeGraph (entities, rels, modules)",
    color: "border-sky-700 bg-sky-950",
    badge: "bg-sky-900 text-sky-300",
    dot: "bg-sky-500",
  },
  {
    stage: "02",
    name: "Knowledge",
    engine: "KnowledgeReconstructionEngine + KnowledgeFusionEngine",
    sprint: "M-06.2B",
    output: "FusedEntity[] · FusedRelationship[] · FusedTimelineEvent[]",
    color: "border-violet-700 bg-violet-950",
    badge: "bg-violet-900 text-violet-300",
    dot: "bg-violet-500",
  },
  {
    stage: "03",
    name: "Identity",
    engine: "IdentityResolutionEngine",
    sprint: "M-06.3",
    output: "CanonicalEntity[] · aliases · versions · conflicts",
    color: "border-indigo-700 bg-indigo-950",
    badge: "bg-indigo-900 text-indigo-300",
    dot: "bg-indigo-500",
  },
  {
    stage: "04",
    name: "Project",
    engine: "ProjectReconstructionEngine",
    sprint: "M-06.4",
    output: "ProjectSnapshot · coverage · architecture · risks",
    color: "border-amber-700 bg-amber-950",
    badge: "bg-amber-900 text-amber-300",
    dot: "bg-amber-500",
  },
  {
    stage: "05",
    name: "Goals",
    engine: "GoalIntelligenceEngine",
    sprint: "M-06.5",
    output: "GoalGraph · CognitiveContext · recommendations",
    color: "border-emerald-700 bg-emerald-950",
    badge: "bg-emerald-900 text-emerald-300",
    dot: "bg-emerald-500",
  },
];

const BP_FIXES = [
  { id: "BP-01", fix: 'category: "technical" → "knowledge"', impact: "GoalCategory union — invalid value removed" },
  { id: "BP-02", fix: "CognitiveContext = {} → real PRE metrics", impact: "preComponentsLinked, kfeRelationshipsLinked, ireIdentitiesLinked now populated" },
  { id: "BP-03", fix: "Placeholder description → real entity counts", impact: "Goal description carries live pipeline metrics" },
  { id: "BP-04", fix: "subGoals: .subGoals → .subgoals (lowercase)", impact: "Pre-existing casing bug aligned with GoalDecomposer.ts" },
];

function PipelineArrow() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-4 bg-zinc-600" />
      <div className="text-zinc-500 text-xs">↓</div>
    </div>
  );
}

function StageCard({ stage, name, engine, sprint, output, color, badge, dot }) {
  return (
    <div className={`border rounded-lg p-4 ${color}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${badge}`}>Stage {stage} · {sprint}</span>
        <span className="text-white font-bold text-sm">{name}</span>
      </div>
      <p className="text-zinc-400 text-xs mb-1 font-mono">{engine}</p>
      <p className="text-zinc-500 text-xs">→ {output}</p>
    </div>
  );
}

function MetricBox({ label, value, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-center">
      <p className="text-xl font-bold text-violet-300 font-mono">{value ?? "—"}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function StageRow({ stage, result }) {
  if (!result) return null;
  const statusColor = {
    SUCCESS: "text-emerald-400",
    SKIPPED: "text-yellow-400",
    FAILED: "text-red-400",
    NOT_CONFIGURED: "text-zinc-500",
  }[result.status] ?? "text-zinc-400";
  return (
    <div className="px-4 py-2 flex items-start gap-3 text-xs border-b border-zinc-800 last:border-0">
      <span className={`font-bold shrink-0 w-5 ${statusColor}`}>
        {result.status === "SUCCESS" ? "✓" : result.status === "SKIPPED" ? "⊘" : "✗"}
      </span>
      <span className="text-zinc-500 shrink-0 w-6">{stage}</span>
      <span className="text-zinc-300 flex-1 font-medium">{result.stageName}</span>
      <span className={`shrink-0 font-semibold ${statusColor}`}>{result.status}</span>
      <span className="text-zinc-600 shrink-0">{result.durationMs}ms</span>
    </div>
  );
}

export default function Phase643Page() {
  const [status, setStatus] = useState("idle");
  const [report, setReport]  = useState(null);
  const [elapsed, setElapsed] = useState(null);
  const [error, setError]    = useState(null);

  async function runPipeline() {
    setStatus("running");
    setReport(null);
    setError(null);
    const t0 = Date.now();
    try {
      const pipeline = new LiveCognitivePipeline();
      const r = await pipeline.execute({ projectId: "memoryos" });
      setReport(r);
      setElapsed(Date.now() - t0);
      setStatus("done");
    } catch (e) {
      setError(String(e));
      setStatus("error");
      setElapsed(Date.now() - t0);
    }
  }

  const isRunning = status === "running";

  // Extract per-stage results by name
  const byName = (name) => report?.stages?.find(s => s.stageName === name);

  const gieOut = byName("GoalIntelligenceEngine")?.output;
  const preOut = byName("ProjectReconstructionEngine")?.output;
  const ireOut = byName("IdentityResolutionEngine")?.output;
  const kfeOut = byName("KnowledgeFusionEngine")?.output;
  const rkbOut = byName("RepositoryKnowledgeBuilder")?.output;

  const stagesPassed  = report?.stagesPassed ?? null;
  const stagesTotal   = report?.stagesTotal  ?? null;
  const pipelineStatus = report?.status ?? null;

  const statusColor = {
    OPERATIONAL: "border-emerald-700 bg-emerald-950 text-emerald-400",
    DEGRADED:    "border-yellow-700 bg-yellow-950 text-yellow-400",
    PARTIAL:     "border-orange-700 bg-orange-950 text-orange-400",
    FAILED:      "border-red-700 bg-red-950 text-red-400",
  }[pipelineStatus] ?? "border-zinc-700 bg-zinc-900 text-zinc-400";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT M-06.5</span>
            <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded">GIE REAL CONTEXT</span>
            {pipelineStatus && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${statusColor}`}>
                {pipelineStatus}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Canonical Cognitive Pipeline</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Repository → Knowledge → Identity → Project → Goals
            <br className="hidden sm:block" />
            M-06.5: GoalIntelligenceEngine receives real CognitiveContext from ProjectReconstructionEngine
          </p>
        </div>

        {/* Pipeline diagram */}
        <div className="space-y-0">
          {PIPELINE.map((step, i) => (
            <React.Fragment key={step.stage}>
              <StageCard {...step} />
              {i < PIPELINE.length - 1 && <PipelineArrow />}
            </React.Fragment>
          ))}
        </div>

        {/* BP fixes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-800">
            <p className="text-xs text-zinc-400 uppercase">M-06.5 Bug-Point Fixes</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {BP_FIXES.map(({ id, fix, impact }) => (
              <div key={id} className="px-4 py-3 flex items-start gap-3 text-xs">
                <span className="text-emerald-400 font-bold shrink-0 w-14">{id}</span>
                <div className="flex-1">
                  <p className="text-zinc-200 font-semibold">{fix}</p>
                  <p className="text-zinc-500 mt-0.5">{impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <div className="flex gap-3 items-center">
          <button
            onClick={runPipeline}
            disabled={isRunning}
            className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition"
          >
            {isRunning ? "Running Pipeline..." : "Execute Live Cognitive Pipeline"}
          </button>
          {elapsed !== null && (
            <span className="text-zinc-500 text-xs">{elapsed}ms</span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-700 bg-red-950 rounded-lg p-4 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {report && (
          <>
            {/* Pipeline status banner */}
            <div className={`border rounded-lg p-4 ${statusColor}`}>
              <p className="font-bold text-sm">
                {report.certified ? "✓" : "⚠"} {pipelineStatus} — {report.summary}
              </p>
              <p className="text-xs opacity-70 mt-1">
                Stages: {stagesPassed}/{stagesTotal} · Duration: {report.durationMs}ms
              </p>
            </div>

            {/* M-06.5 GIE metrics */}
            {gieOut && (
              <div className="bg-zinc-900 border border-emerald-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-emerald-800 bg-emerald-950">
                  <p className="text-xs text-emerald-400 uppercase font-semibold">Stage 05 — Goals (M-06.5 Integration)</p>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricBox label="PRE Components Linked" value={gieOut.preComponentsLinked} sub="from Stage 04" />
                  <MetricBox label="KFE Relationships Linked" value={gieOut.kfeRelationshipsLinked} sub="from Stage 02" />
                  <MetricBox label="IRE Identities Linked" value={gieOut.ireIdentitiesLinked} sub="from Stage 03" />
                  <MetricBox label="Graph Nodes Added" value={gieOut.knowledgeGraphNodes} sub="to KnowledgeGraph" />
                  <MetricBox label="Sub-Goals" value={gieOut.subGoals} sub="decomposed" />
                  <MetricBox label="Recommendations" value={gieOut.recommendations} sub="generated" />
                  <MetricBox label="Timeline Events" value={gieOut.timelineEventsAdded} sub="linked" />
                  <MetricBox label="KGS Loaded" value={gieOut.kgsLoaded ? "YES" : "NO"} sub={gieOut.kgsLoaded ? "real data" : "fallback"} />
                </div>
              </div>
            )}

            {/* Stage-by-stage breakdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800">
                <p className="text-xs text-zinc-400 uppercase">Stage Execution Log</p>
              </div>
              {report.stages.map((s, i) => (
                <StageRow key={s.stageId} stage={String(i + 1).padStart(2, "0")} result={s} />
              ))}
            </div>

            {/* Knowledge evidence */}
            {report.context?.knowledgeEvidence?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-zinc-800">
                  <p className="text-xs text-zinc-400 uppercase">Knowledge Evidence Chain</p>
                </div>
                <div className="p-4 space-y-1">
                  {report.context.knowledgeEvidence.map((e, i) => (
                    <p key={i} className="text-xs text-zinc-400 font-mono">
                      <span className="text-zinc-600">{String(i + 1).padStart(2, "0")}.</span> {e}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}