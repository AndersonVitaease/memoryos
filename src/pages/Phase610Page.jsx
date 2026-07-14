import React, { useState } from "react";
import { EngineeringWorkflow } from "@/lib/engineering-workflow/EngineeringWorkflow";

const wf = new EngineeringWorkflow();

function Badge({ label, color }) {
  const colors = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    purple: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${colors[color] ?? colors.gray}`}>
      {label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-zinc-500 w-48 shrink-0">{label}</span>
      <span className="text-zinc-200 font-mono">{value}</span>
    </div>
  );
}

const STATUS_COLOR = {
  PENDING_ANALYSIS: "yellow",
  PENDING_APPROVAL: "yellow",
  APPROVED: "blue",
  IMPLEMENTING: "blue",
  VALIDATING: "blue",
  REPAIRING: "red",
  COMPLETE: "green",
  REJECTED: "red",
};

const COMPLEXITY_COLOR = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "red",
  CRITICAL: "red",
};

export default function Phase610Page() {
  const [objective, setObjective]   = useState("");
  const [session, setSession]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab]               = useState("plan");

  async function handleInitiate() {
    if (!objective.trim()) return;
    setLoading(true);
    try {
      const s = await wf.initiate(objective.trim());
      setSession(s);
      setTab("plan");
    } finally {
      setLoading(false);
    }
  }

  function handleApprove() {
    if (!session) return;
    setSession({ ...wf.approve(session) });
  }

  function handleReject() {
    if (!session || !rejectReason.trim()) return;
    setSession({ ...wf.reject(session, rejectReason.trim()) });
    setRejectReason("");
  }

  const plan        = session?.plan;
  const inspection  = session?.inspectionSummary;
  const status      = session?.status ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.1.0</span>
          <Badge label="AUTONOMOUS ENGINEERING WORKFLOW" color="purple" />
        </div>
        <h1 className="text-2xl font-bold text-white">Engineering Workflow</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Analyze → Plan → Inspect → Identify → Generate Plan → Await Approval → Implement → Validate → Report
        </p>
      </div>

      {/* Workflow diagram */}
      <div className="flex flex-wrap gap-1 items-center text-xs font-mono text-zinc-500">
        {["Objective","Inspect Codebase","Inspect KG","Inspect GitHub","Check Dependencies","Find Reusable","Generate Plan","⏸ WAIT APPROVAL","Implement","Validate","Repair","Report"].map((s, i, arr) => (
          <React.Fragment key={s}>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">{s}</span>
            {i < arr.length - 1 && <span className="text-zinc-700">→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Objective input */}
      <Section title="Engineering Request">
        <div className="flex gap-3">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Add semantic search to the chat interface"'
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleInitiate()}
            disabled={loading || !!session}
          />
          <button
            onClick={handleInitiate}
            disabled={loading || !!session || !objective.trim()}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-medium transition-colors"
          >
            {loading ? "Analyzing…" : "Initiate Workflow"}
          </button>
          {session && (
            <button
              onClick={() => { setSession(null); setObjective(""); }}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </Section>

      {/* Session result */}
      {session && (
        <>
          {/* Status bar */}
          <div className="flex items-center gap-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900">
            <span className="text-xs text-zinc-500 font-mono">STATUS</span>
            <Badge label={status} color={STATUS_COLOR[status] ?? "gray"} />
            <span className="text-xs text-zinc-600 font-mono">{session.id}</span>
            {status === "PENDING_APPROVAL" && plan?.requiresArchitectApproval && (
              <Badge label="⚠ STABLE COMPONENTS AFFECTED — ARCHITECT APPROVAL REQUIRED" color="red" />
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800">
            {["plan", "inspection", "log"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-mono transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* TAB: PLAN */}
          {tab === "plan" && plan && (
            <div className="space-y-4">
              <Section title="Engineering Plan">
                <Row label="Objective"            value={plan.objective} />
                <Row label="Complexity"           value={<Badge label={plan.estimatedComplexity} color={COMPLEXITY_COLOR[plan.estimatedComplexity]} />} />
                <Row label="Architectural Impact" value={plan.architecturalImpact} />
                <Row label="Performance Impact"   value={plan.performanceImpact} />
                <Row label="Rollback Strategy"    value={plan.rollbackStrategy} />
              </Section>

              <div className="grid grid-cols-2 gap-4">
                <Section title="Affected Components">
                  {plan.affectedComponents.map(c => <div key={c} className="text-sm text-zinc-300 font-mono">{c}</div>)}
                </Section>
                <Section title="Stable Components Touched">
                  {plan.stableComponentsTouched.length === 0
                    ? <span className="text-green-400 text-sm">None — additive only ✅</span>
                    : plan.stableComponentsTouched.map(c => <div key={c} className="text-sm text-red-400 font-mono">⚠ {c}</div>)}
                </Section>
                <Section title="Reusable Components Detected">
                  {plan.reusableComponents.length === 0
                    ? <span className="text-zinc-500 text-sm">None detected</span>
                    : plan.reusableComponents.map(c => <div key={c} className="text-sm text-blue-300 font-mono">↩ {c}</div>)}
                </Section>
                <Section title="Regression Risks">
                  {plan.regressionRisks.map((r, i) => <div key={i} className="text-sm text-yellow-300">{r}</div>)}
                </Section>
              </div>

              <Section title="Implementation Order">
                {plan.implementationOrder.map((s, i) => <div key={i} className="text-sm text-zinc-300 font-mono">{s}</div>)}
              </Section>

              <Section title="Validation Strategy">
                <div className="flex flex-wrap gap-2">
                  {plan.validationStrategy.map(v => <Badge key={v} label={v} color="blue" />)}
                </div>
              </Section>
            </div>
          )}

          {/* TAB: INSPECTION */}
          {tab === "inspection" && inspection && (
            <div className="space-y-4">
              <Section title="Knowledge Graph">
                <Row label="Entities"       value={inspection.kgEntities} />
                <Row label="Relationships"  value={inspection.kgRelationships} />
                <Row label="Modules"        value={inspection.kgModules} />
                <Row label="KG Ready"       value={<Badge label={inspection.kgReady ? "READY" : "NOT READY"} color={inspection.kgReady ? "green" : "red"} />} />
              </Section>

              <Section title="Recent GitHub Commits">
                {inspection.recentCommits.length === 0
                  ? <span className="text-zinc-500 text-sm">GitHub not configured or no commits</span>
                  : inspection.recentCommits.map((c, i) => <div key={i} className="text-sm text-zinc-300 font-mono">{c}</div>)}
              </Section>

              <Section title="Architecture Dependencies">
                {inspection.architectureDependencies.length === 0
                  ? <span className="text-zinc-500 text-sm">No direct dependencies detected for this objective</span>
                  : inspection.architectureDependencies.map((d, i) => <div key={i} className="text-sm text-zinc-300 font-mono">{d}</div>)}
              </Section>

              <Section title="Duplicate Risk">
                {inspection.duplicateRisk.length === 0
                  ? <span className="text-green-400 text-sm">No duplicate risk detected ✅</span>
                  : inspection.duplicateRisk.map((r, i) => <div key={i} className="text-sm text-yellow-300">{r}</div>)}
              </Section>

              <Section title="Stable Baseline (frozen)">
                <div className="flex flex-wrap gap-2">
                  {inspection.stableBaseline.map(c => <Badge key={c} label={c} color="green" />)}
                </div>
              </Section>
            </div>
          )}

          {/* TAB: LOG */}
          {tab === "log" && (
            <Section title="Workflow Log">
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {session.log.map((line, i) => (
                  <div key={i} className="text-xs font-mono text-zinc-400">{line}</div>
                ))}
              </div>
            </Section>
          )}

          {/* Approval gate */}
          {status === "PENDING_APPROVAL" && (
            <div className="border border-yellow-700/50 rounded-lg p-4 bg-yellow-950/20 space-y-3">
              <p className="text-yellow-300 text-sm font-medium">
                ⏸ Engineering Plan ready. Awaiting Architect approval before any code is written.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-sm font-medium transition-colors"
                >
                  ✅ Approve Plan
                </button>
                <input
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
                  placeholder="Rejection reason (required to reject)"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim()}
                  className="px-4 py-2 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm font-medium transition-colors"
                >
                  ❌ Reject Plan
                </button>
              </div>
            </div>
          )}

          {status === "APPROVED" && (
            <div className="border border-green-700/50 rounded-lg p-4 bg-green-950/20">
              <p className="text-green-300 text-sm font-medium">
                ✅ Plan approved at {new Date(session.approvedAt).toISOString().slice(11, 19)}.
                Implementation authorized — MemoryOS may now proceed.
              </p>
            </div>
          )}

          {status === "REJECTED" && (
            <div className="border border-red-700/50 rounded-lg p-4 bg-red-950/20">
              <p className="text-red-300 text-sm">❌ Plan rejected. Reset to start a new workflow.</p>
            </div>
          )}
        </>
      )}

      {/* Stable baseline footer */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-zinc-600">BASELINE STABLE:</span>
          {["RepositoryKnowledgeBuilder","SourceCodeParser","KnowledgeGraphStore","LiveCognitivePipeline",
            "ConversationCognitiveGateway","GitHubQueryRouter","CognitiveAnswerComposer",
            "ConnectorInvocationService","GitHubConnector","Base44Connector"].map(c => (
            <Badge key={c} label={c} color="green" />
          ))}
        </div>
        <p className="text-xs text-zinc-600 font-mono mt-2">
          Acceptance Validation 5/5 · Phase 6.0.4 COMPLETE · Sprint 6.1.0 ACTIVE
        </p>
      </div>
    </div>
  );
}