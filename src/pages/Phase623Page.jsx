import React, { useState, useEffect, useRef } from "react";
import { ArchitectureAuthority } from "@/lib/architecture-authority/ArchitectureAuthority";
import { CORE_IMMUTABLE } from "@/lib/architecture-authority/AATypes";

const aa = new ArchitectureAuthority();

function Badge({ label, color = "gray", xs }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700/40",
    orange: "bg-orange-900/40 text-orange-300 border-orange-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border-teal-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  const sz = xs ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded border ${c[color] ?? c.gray}`}>{label}</span>;
}

function Panel({ title, children, color }) {
  const b = { red: "border-red-800/40", green: "border-green-800/40", yellow: "border-yellow-800/40", violet: "border-violet-800/40" }[color] ?? "border-zinc-800";
  return (
    <div className={`border rounded-lg p-4 space-y-2 ${b}`}>
      <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex gap-3 text-sm items-start">
      <span className="text-zinc-500 w-44 shrink-0">{k}</span>
      <span className="text-zinc-300 flex-1">{String(v)}</span>
    </div>
  );
}

const BC_COLOR   = { SAFE: "green", LOW: "blue", MEDIUM: "yellow", HIGH: "orange", CRITICAL: "red" };
const COMPAT_COLOR = { COMPATIBLE: "green", DEGRADED: "yellow", INCOMPATIBLE: "red", UNKNOWN: "gray" };
const STAGE_COLOR  = { AUTHORIZED: "green", AUTO_APPROVED: "green", BLOCKED: "red", REJECTED: "red", WAIT_ARCHITECTURE_APPROVAL: "yellow" };

const PIPELINE_STAGES = ["INSPECTING_ARCHITECTURE","DETECTING_BREAKING_CHANGES","VALIDATING_CONTRACTS","CHECKING_COMPATIBILITY","GENERATING_PROPOSAL","CREATING_FEATURE_FLAG","GENERATING_MIGRATION","ARCHITECTURE_DECISION","WAIT_ARCHITECTURE_APPROVAL","AUTHORIZED"];
const STAGE_SHORT = { INSPECTING_ARCHITECTURE: "Inspect", DETECTING_BREAKING_CHANGES: "Breaking Changes", VALIDATING_CONTRACTS: "Contracts", CHECKING_COMPATIBILITY: "Compatibility", GENERATING_PROPOSAL: "Proposal", CREATING_FEATURE_FLAG: "Feature Flag", GENERATING_MIGRATION: "Migration", ARCHITECTURE_DECISION: "Decision", WAIT_ARCHITECTURE_APPROVAL: "⏸ Approval", AUTHORIZED: "Authorized" };

function Pipeline({ stage }) {
  const ai = PIPELINE_STAGES.indexOf(stage);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {PIPELINE_STAGES.map((s, i) => {
        const active = s === stage, done = ai > i;
        return (
          <React.Fragment key={s}>
            <div className={`px-2 py-1 rounded border text-[10px] font-mono transition-all ${active ? "border-violet-500 bg-violet-900/30 text-violet-200 ring-1 ring-violet-500/50" : done ? "border-green-800 bg-green-900/20 text-green-500" : "border-zinc-800 text-zinc-600"}`}>
              {done && !active ? "✓ " : ""}{STAGE_SHORT[s] ?? s}
            </div>
            {i < PIPELINE_STAGES.length - 1 && <span className="text-zinc-800 text-[10px]">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function LogPane({ log }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log?.length]);
  return (
    <div ref={ref} className="bg-zinc-950 border border-zinc-800 rounded p-3 max-h-52 overflow-y-auto">
      {!log?.length && <p className="text-zinc-700 text-xs font-mono">No log yet…</p>}
      {log?.map((l, i) => <p key={i} className="text-xs font-mono text-zinc-400 leading-relaxed">{l}</p>)}
    </div>
  );
}

const TABS = ["overview","protected","contracts","compatibility","breaking-changes","feature-flags","migration","audit","approval-queue","timeline","log"];

export default function Phase623Page() {
  const [objective, setObjective]       = useState("");
  const [components, setComponents]     = useState("");
  const [exec, setExec]                 = useState(null);
  const [running, setRunning]           = useState(false);
  const [approving, setApproving]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab]                   = useState("overview");
  const [auditEntries, setAuditEntries] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [flags, setFlags]               = useState([]);

  useEffect(() => {
    aa.onStageChange = (updated) => {
      setExec({ ...updated });
      setAuditEntries([...aa.audit.all()]);
      setHistoryEntries([...aa.history.all()]);
      setFlags([...aa.flags.all()]);
    };
    return () => { aa.onStageChange = undefined; };
  }, []);

  async function handleSubmit() {
    if (!objective.trim() || running) return;
    setRunning(true);
    setTab("overview");
    const comps = components.split(",").map(s => s.trim()).filter(Boolean);
    try { await aa.submit(objective.trim(), comps); }
    finally { setRunning(false); }
  }

  function handleApprove() {
    if (!exec || exec.stage !== "WAIT_ARCHITECTURE_APPROVAL" || approving) return;
    setApproving(true);
    try { aa.approve(exec); } finally { setApproving(false); }
  }

  function handleReject() {
    if (!exec || exec.stage !== "WAIT_ARCHITECTURE_APPROVAL" || !rejectReason.trim()) return;
    aa.reject(exec, rejectReason.trim());
    setRejectReason("");
  }

  function handleReset() { setExec(null); setObjective(""); setComponents(""); setTab("overview"); }

  const stage    = exec?.stage ?? "IDLE";
  const result   = exec?.result;
  const proposal = result?.proposal;
  const isDone   = ["AUTHORIZED","AUTO_APPROVED","BLOCKED","REJECTED"].includes(stage);
  const auditStats = aa.audit.stats();
  const histStats  = aa.history.stats();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.2.3</span>
          <Badge label="ARCHITECTURE AUTHORITY" color="violet" />
          <Badge label="MAXIMUM AUTHORITY" color="red" />
        </div>
        <h1 className="text-2xl font-bold">Architecture Authority</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Inspect → Breaking Changes → Contracts → Compatibility → Proposal → Feature Flag → Migration → Decision → Approval → Authorized
        </p>
        <div className="mt-2 flex flex-wrap gap-2 items-center text-xs text-zinc-600">
          <span>Hierarchy:</span>
          {["Engineering Workflow","Engineering Intelligence","Engineering Governance","Architecture Authority","Implementation"].map((l, i, arr) => (
            <React.Fragment key={l}><span className="text-zinc-400">{l}</span>{i < arr.length - 1 && <span>→</span>}</React.Fragment>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div className="border border-zinc-800 rounded-lg p-3"><Pipeline stage={stage} /></div>

      {/* Status bar */}
      {exec && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <span className="text-xs font-mono text-zinc-500">STAGE</span>
          <Badge label={stage} color={STAGE_COLOR[stage] ?? "blue"} />
          <span className="text-xs font-mono text-zinc-600">{exec.id}</span>
          {proposal?.estimatedComplexity && <Badge label={`Complexity: ${proposal.estimatedComplexity}`} color={BC_COLOR[proposal.estimatedComplexity]} />}
          {proposal?.confidenceScore != null && <Badge label={`Confidence: ${proposal.confidenceScore}%`} color={proposal.confidenceScore >= 70 ? "green" : "yellow"} />}
          {proposal?.status && <Badge label={proposal.status} color={proposal.status === "APPROVED" || proposal.status === "AUTO_APPROVED" ? "green" : proposal.status === "BLOCKED" ? "red" : "yellow"} />}
        </div>
      )}

      {/* Submit form */}
      <Panel title="Submit Architecture Proposal">
        <div className="space-y-3">
          <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='Objective e.g. "Refactor KnowledgeGraphStore to support multi-tenant isolation"'
            value={objective} onChange={e => setObjective(e.target.value)}
            disabled={running || !!exec} />
          <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder="Affected components (comma-separated) e.g. KnowledgeGraphStore, ConnectorInvocationService"
            value={components} onChange={e => setComponents(e.target.value)}
            disabled={running || !!exec} />
          <div className="flex gap-3">
            {!exec && (
              <button onClick={handleSubmit} disabled={running || !objective.trim()}
                className="px-5 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors">
                {running ? "Analyzing…" : "▶ Submit to Architecture Authority"}
              </button>
            )}
            {exec && isDone && (
              <button onClick={handleReset} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">↺ New Proposal</button>
            )}
          </div>
        </div>
      </Panel>

      {/* Approval gate */}
      {stage === "WAIT_ARCHITECTURE_APPROVAL" && proposal && (
        <div className="border border-yellow-700/60 rounded-lg p-5 bg-yellow-950/20 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-yellow-300 text-xl">⏸</span>
            <div>
              <p className="text-yellow-200 font-semibold">WAIT_ARCHITECTURE_APPROVAL — human approval mandatory</p>
              <p className="text-yellow-600 text-xs mt-0.5">Core hit: {proposal.coreComponentsHit.join(", ") || "none"} · Breaking: {proposal.breakingChanges.length} · Complexity: {proposal.estimatedComplexity}</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={handleApprove} disabled={approving}
              className="px-5 py-2.5 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 text-sm font-semibold transition-colors">
              {approving ? "Authorizing…" : "✅ Approve Architecture"}
            </button>
            <input className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
              placeholder="Rejection reason…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <button onClick={handleReject} disabled={!rejectReason.trim()}
              className="px-4 py-2.5 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm font-semibold transition-colors">❌ Reject</button>
          </div>
        </div>
      )}

      {/* Result banners */}
      {(stage === "AUTHORIZED" || stage === "AUTO_APPROVED") && (
        <div className="border border-green-700/40 rounded-lg p-4 bg-green-950/10 flex items-center gap-3">
          <span className="text-green-300 text-xl">✅</span>
          <p className="text-green-200 font-semibold">{stage === "AUTO_APPROVED" ? "Auto-approved — no Core components affected" : "Architecture approved — implementation authorized"}</p>
        </div>
      )}
      {stage === "BLOCKED" && (
        <div className="border border-red-700/40 rounded-lg p-4 bg-red-950/10">
          <p className="text-red-300 font-semibold">❌ Blocked — CRITICAL complexity + Core components. Requires re-scoping.</p>
        </div>
      )}
      {stage === "REJECTED" && (
        <div className="border border-red-700/40 rounded-lg p-4 bg-red-950/10">
          <p className="text-red-300 font-semibold">❌ Rejected: {proposal?.rejectionReason}</p>
        </div>
      )}

      {/* Stats row — always visible */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "PROPOSALS", v: histStats.total,    c: "gray" },
          { l: "APPROVED",  v: histStats.approved, c: "green" },
          { l: "BLOCKED",   v: histStats.blocked,  c: histStats.blocked > 0 ? "red" : "gray" },
          { l: "REJECTED",  v: histStats.rejected, c: histStats.rejected > 0 ? "red" : "gray" },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <p className="text-xs font-mono text-zinc-500">{l}</p>
            <p className={`text-xl font-bold mt-1 ${c === "green" ? "text-green-300" : c === "red" ? "text-red-400" : "text-white"}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      {exec && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-800">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-mono uppercase whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t.replace("-", " ")}
            </button>
          ))}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {exec && tab === "overview" && proposal && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Complexity",    v: proposal.estimatedComplexity, c: BC_COLOR[proposal.estimatedComplexity] },
              { l: "Confidence",    v: `${proposal.confidenceScore}%`, c: proposal.confidenceScore >= 70 ? "green" : "yellow" },
              { l: "Core Hit",      v: proposal.coreComponentsHit.length, c: proposal.coreComponentsHit.length > 0 ? "red" : "green" },
              { l: "Breaking",      v: proposal.breakingChanges.length, c: proposal.breakingChanges.length > 0 ? "orange" : "green" },
              { l: "Requires Approval", v: proposal.requiresApproval ? "YES" : "NO", c: proposal.requiresApproval ? "yellow" : "green" },
              { l: "Feature Flag",  v: result?.featureFlags?.[0]?.key ?? "—", c: "teal" },
            ].map(({ l, v, c }) => (
              <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs font-mono text-zinc-500">{l}</p>
                <div className="mt-1"><Badge label={String(v)} color={c} /></div>
              </div>
            ))}
          </div>
          <Panel title="Proposal">
            <KV k="Objective"            v={proposal.objective} />
            <KV k="Problem"              v={proposal.problem} />
            <KV k="Current Architecture" v={proposal.currentArchitecture} />
            <KV k="Proposed"             v={proposal.proposedArchitecture} />
            <KV k="Migration"            v={proposal.migration} />
            <KV k="Rollback"             v={proposal.rollback} />
          </Panel>
          <div className="grid grid-cols-2 gap-4">
            <Panel title="Advantages">
              {proposal.advantages.map((a, i) => <p key={i} className="text-sm text-green-300">✓ {a}</p>)}
            </Panel>
            <Panel title="Risks">
              {proposal.risks.map((r, i) => <p key={i} className="text-sm text-orange-300">⚠ {r}</p>)}
            </Panel>
          </div>
        </div>
      )}

      {/* TAB: PROTECTED */}
      {exec && tab === "protected" && (
        <Panel title="Core Immutable Components">
          <p className="text-xs text-zinc-500 mb-3">These components cannot be modified without WAIT_ARCHITECTURE_APPROVAL:</p>
          <div className="grid grid-cols-2 gap-2">
            {CORE_IMMUTABLE.map(c => {
              const hit = proposal?.coreComponentsHit.includes(c);
              return (
                <div key={c} className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-mono ${hit ? "border-red-700/50 bg-red-950/20 text-red-300" : "border-zinc-800 text-zinc-400"}`}>
                  <span>{hit ? "🔴" : "🔒"}</span> {c}
                  {hit && <Badge label="HIT" color="red" xs />}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* TAB: CONTRACTS */}
      {exec && tab === "contracts" && (
        <div className="space-y-3">
          {aa.contracts.all().map(c => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-zinc-200">{c.name}</span>
                <Badge label={`v${c.version}`} color="blue" xs />
                <Badge label={c.compatibility} color={COMPAT_COLOR[c.compatibility]} xs />
              </div>
              <p className="text-xs text-zinc-500 font-mono">Signature: {c.signature}</p>
              <div className="flex flex-wrap gap-1">
                {c.methods.map(m => <Badge key={m} label={m} color="teal" xs />)}
              </div>
              <p className="text-xs text-zinc-600">Exports: {c.exports.join(", ")}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB: COMPATIBILITY */}
      {exec && tab === "compatibility" && result?.compatibility && (
        <Panel title="Backward Compatibility Check">
          {Object.entries(result.compatibility).map(([domain, status]) => (
            <div key={domain} className="flex items-center gap-3 text-sm py-1">
              <span className="text-zinc-500 w-48">{domain}</span>
              <Badge label={status} color={COMPAT_COLOR[status] ?? "gray"} />
            </div>
          ))}
        </Panel>
      )}

      {/* TAB: BREAKING CHANGES */}
      {exec && tab === "breaking-changes" && (
        <div className="space-y-3">
          {result?.breakingChanges.length === 0 && <p className="text-green-400 text-sm">✅ No breaking changes detected.</p>}
          {result?.breakingChanges.map(bc => (
            <div key={bc.id} className={`border rounded-lg p-3 space-y-2 ${bc.autoBlocked ? "border-red-700/50 bg-red-950/10" : "border-zinc-800"}`}>
              <div className="flex items-center gap-3">
                <Badge label={bc.level}     color={BC_COLOR[bc.level]} />
                <Badge label={bc.component} color="blue" xs />
                {bc.autoBlocked && <Badge label="AUTO-BLOCKED" color="red" />}
              </div>
              <p className="text-sm text-zinc-300">{bc.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB: FEATURE FLAGS */}
      {exec && tab === "feature-flags" && (
        <Panel title="Feature Flags">
          {flags.length === 0 && <p className="text-zinc-500 text-sm">No feature flags yet.</p>}
          {flags.map(f => (
            <div key={f.key} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 text-sm">
              <span className={`font-mono text-xs ${f.enabled ? "text-green-300" : "text-zinc-500"}`}>{f.key}</span>
              <Badge label={f.enabled ? "ENABLED" : "DISABLED"} color={f.enabled ? "green" : "gray"} xs />
              <span className="text-zinc-600 flex-1 text-xs">{f.description}</span>
              {!f.enabled && (
                <button onClick={() => { aa.flags.enable(f.key); setFlags([...aa.flags.all()]); }}
                  className="px-2 py-1 text-[10px] rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">Enable</button>
              )}
            </div>
          ))}
          <p className="text-xs text-zinc-600 mt-2">All architecture changes are born disabled. Enable only after human approval and staging validation.</p>
        </Panel>
      )}

      {/* TAB: MIGRATION */}
      {exec && tab === "migration" && (
        <div className="space-y-4">
          {!result?.migrationPlan && <p className="text-zinc-500 text-sm">No migration plan required — no breaking changes or core components affected.</p>}
          {result?.migrationPlan && (
            <>
              <Panel title="Migration Steps">
                {result.migrationPlan.steps.map((s, i) => <p key={i} className="text-sm text-zinc-300">{s}</p>)}
              </Panel>
              <Panel title="Rollback Steps" color="red">
                {result.migrationPlan.rollbackSteps.map((s, i) => <p key={i} className="text-sm text-zinc-300">{s}</p>)}
              </Panel>
              <Panel title="Compatibility Layer">
                <p className="text-sm text-zinc-300">{result.migrationPlan.compatibilityLayer}</p>
              </Panel>
              <Panel title="Deprecation Plan">
                <p className="text-sm text-zinc-300">{result.migrationPlan.deprecationPlan}</p>
              </Panel>
              <Panel title="Risk Report">
                <p className="text-sm text-zinc-300">{result.migrationPlan.riskReport}</p>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* TAB: AUDIT */}
      {exec && tab === "audit" && (
        <Panel title="Immutable Architecture Audit">
          {auditEntries.length === 0 && <p className="text-zinc-500 text-sm">No audit entries yet.</p>}
          {[...auditEntries].reverse().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-1 text-xs font-mono">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={e.approval}      color={e.approval === "APPROVED" || e.approval === "AUTO_APPROVED" ? "green" : e.approval === "BLOCKED" ? "red" : "yellow"} xs />
                <Badge label={e.breakingLevel} color={BC_COLOR[e.breakingLevel]} xs />
                <span className="text-zinc-600 ml-auto">{new Date(e.timestamp).toISOString().slice(11, 23)}</span>
              </div>
              <p className="text-zinc-300">Objective: {e.objective}</p>
              <p className="text-zinc-500">Decision: {e.decision} · Approver: {e.approver}</p>
              <p className="text-zinc-500">Rollback: {e.rollbackAvailable ? "✓" : "✗"} · Migration: {e.migrationAvailable ? "✓" : "✗"} · Risk: {e.riskSummary}</p>
            </div>
          ))}
        </Panel>
      )}

      {/* TAB: APPROVAL QUEUE */}
      {exec && tab === "approval-queue" && (
        <Panel title="Approval Queue">
          {stage === "WAIT_ARCHITECTURE_APPROVAL"
            ? <div className="space-y-2">
                <p className="text-yellow-300 text-sm font-semibold">⏸ 1 proposal awaiting approval</p>
                <KV k="Objective"   v={proposal?.objective ?? ""} />
                <KV k="Core Hit"    v={proposal?.coreComponentsHit.join(", ") || "none"} />
                <KV k="Complexity"  v={proposal?.estimatedComplexity ?? ""} />
                <KV k="Confidence"  v={`${proposal?.confidenceScore ?? 0}%`} />
              </div>
            : <p className="text-zinc-500 text-sm">No proposals currently awaiting approval.</p>}
        </Panel>
      )}

      {/* TAB: TIMELINE */}
      {exec && tab === "timeline" && (
        <Panel title="Architecture History">
          {historyEntries.length === 0 && <p className="text-zinc-500 text-sm">No history entries yet.</p>}
          {[...historyEntries].reverse().map(e => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded border border-zinc-800 bg-zinc-900 text-xs font-mono">
              <Badge label={e.outcome}      color={e.outcome === "APPROVED" || e.outcome === "AUTO_APPROVED" ? "green" : e.outcome === "BLOCKED" ? "red" : e.outcome === "REJECTED" ? "red" : "yellow"} xs />
              <span className="text-zinc-400 flex-1 truncate">{e.objective}</span>
              <span className="text-zinc-600 shrink-0">{new Date(e.timestamp).toISOString().slice(11, 23)}</span>
            </div>
          ))}
        </Panel>
      )}

      {/* TAB: LOG */}
      {exec && tab === "log" && (
        <Panel title={`Execution Log (${exec.log.length} entries)`}>
          <LogPane log={exec.log} />
        </Panel>
      )}

      {/* Idle */}
      {!exec && !running && (
        <div className="text-center py-14 text-zinc-600 space-y-3">
          <p className="text-5xl">🏛</p>
          <p className="text-sm">Submit an architecture proposal to validate it through the Authority.</p>
          <p className="text-xs text-zinc-700">Core Immutable: {CORE_IMMUTABLE.length} protected components · {aa.contracts.all().length} registered contracts</p>
          <div className="flex flex-wrap gap-1 justify-center mt-3">
            {CORE_IMMUTABLE.map(c => <Badge key={c} label={c} color="gray" xs />)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-1 items-center">
        <span className="text-xs font-mono text-zinc-600 mr-1">MODULES:</span>
        {["ArchitectureInspector","ContractRegistry","ContractValidator","BreakingChangeDetector","CompatibilityEngine","ArchitectureProposalEngine","ArchitectureDecisionEngine","MigrationPlanner","FeatureFlagEngine","ArchitectureDiffEngine","ArchitectureHistory","ArchitectureAudit"].map(m => (
          <Badge key={m} label={m} color="violet" xs />
        ))}
      </div>
    </div>
  );
}