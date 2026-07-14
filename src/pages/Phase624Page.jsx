import React, { useState, useEffect, useCallback } from "react";
import { EngineeringMemory } from "@/lib/engineering-memory/EngineeringMemory";

const mem = new EngineeringMemory();

// Seed demo data on first load
(function seed() {
  if (mem.allEntries().length > 0) return;
  mem.recordImplementation({ objective: "Add caching to KnowledgeGraphStore", planId: "plan_001", components: ["KnowledgeGraphStore"], strategy: "EXTEND", filesChanged: ["src/lib/project-knowledge/KnowledgeGraphStore.ts"], durationMs: 4200, regressionsPassed: true, approved: true, rollbackExecuted: false, outcome: "PASS" });
  mem.recordImplementation({ objective: "Create EngineeringGovernance layer", planId: "plan_002", components: ["EngineeringGovernance","CoreProtectionEngine"], strategy: "CREATE", filesChanged: ["src/lib/engineering-governance/EngineeringGovernance.ts"], durationMs: 8100, regressionsPassed: true, approved: true, rollbackExecuted: false, outcome: "PASS" });
  mem.recordBug({ description: "KG entities return empty after HMR reload", rootCause: "Singleton not anchored to globalThis", module: "KnowledgeGraphStore", impact: "HIGH", fix: "Anchor to globalThis.__memoryos_kgs__", relatedRegression: "reg_001", confidence: 0.95, version: "6.0.4" });
  mem.recordRegression({ testsRun: 7, testsFailed: 0, testsPassed: 7, fixes: [], shieldScore: 5, rcaSummary: ["All tests passed"], recovery: "N/A", durationMs: 1200 });
  mem.recordDecision({ objective: "Add caching to KG", whyReused: "KGStore already has the infrastructure", whyCreated: "", whyRefactored: "", alternativesRejected: ["Create new CacheEngine"], finalDecision: "EXTEND KnowledgeGraphStore" });
  mem.recordConnector({ connectorName: "GitHubConnector", problems: ["path encoding breaks directory separators"], authNotes: "PAT token via ConnectionManager", encodingNotes: "Use path.split('/').map(encodeURIComponent).join('/')", pagination: "per_page param, link header", rateLimitNotes: "60 req/h unauthenticated, 5000 authenticated", retryStrategy: "Exponential backoff x3", strategies: ["segment-encode paths","cache tree response"] });
  mem.recordApproval({ proposalId: "aprop_001", objective: "Refactor KGStore", approved: true, reason: "Safe extension, no breaking changes", approver: "Human" });
  mem.runLearningLoop("PASS", ["KnowledgeGraphStore"]);
})();

function Badge({ label, color = "gray", xs }) {
  const c = { green: "bg-green-900/40 text-green-300 border-green-700/40", yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40", red: "bg-red-900/40 text-red-300 border-red-700/40", blue: "bg-blue-900/40 text-blue-300 border-blue-700/40", violet: "bg-violet-900/40 text-violet-300 border-violet-700/40", orange: "bg-orange-900/40 text-orange-300 border-orange-700/40", teal: "bg-teal-900/40 text-teal-300 border-teal-700/40", gray: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  return <span className={`${xs ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"} font-mono rounded border ${c[color] ?? c.gray}`}>{label}</span>;
}

function Panel({ title, children }) {
  return <div className="border border-zinc-800 rounded-lg p-4 space-y-2"><p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</p>{children}</div>;
}

function KV({ k, v }) {
  return <div className="flex gap-3 text-sm items-start"><span className="text-zinc-500 w-44 shrink-0">{k}</span><span className="text-zinc-300 flex-1">{String(v)}</span></div>;
}

function Stat({ label, value, color = "white", sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <p className="text-xs font-mono text-zinc-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color === "green" ? "text-green-300" : color === "red" ? "text-red-400" : color === "blue" ? "text-blue-300" : color === "yellow" ? "text-yellow-300" : "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

const KIND_COLOR = { IMPLEMENTATION: "violet", BUG: "red", REGRESSION: "orange", DECISION: "blue", ARCHITECTURE: "teal", CONNECTOR: "green", PATTERN: "yellow", REPAIR: "gray", APPROVAL: "green" };
const OUTCOME_COLOR = { PASS: "green", FAIL: "red", ROLLBACK: "orange", REJECTED: "red", PENDING: "yellow" };

const TABS = ["overview","experience","implementations","bugs","regressions","architecture","decisions","connectors","patterns","lessons","analytics","search","timeline"];

export default function Phase624Page() {
  const [tab, setTab]     = useState("overview");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [, forceRefresh]  = useState(0);

  const refresh = useCallback(() => forceRefresh(n => n + 1), []);

  function handleSearch() {
    if (!query.trim()) return;
    const results = mem.searchBeforeImplementing(query.trim());
    setSearchResults(results);
  }

  const exp      = mem.experienceSnapshot();
  const analytics = mem.analytics();
  const retStats = mem.retentionStats();
  const idxStats = mem.indexerStats();
  const allEntries = mem.allEntries();
  const auditStats = mem.audit.stats();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.2.4</span>
          <Badge label="ENGINEERING MEMORY" color="violet" />
          <Badge label={`${allEntries.length} memories`} color="blue" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Memory (MEM)</h1>
        <p className="text-zinc-400 text-sm mt-1">Permanent learning layer · 19 modules · Never deletes knowledge · Always searchable</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-mono uppercase whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
        ))}
      </div>

      {/* TAB: OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="TOTAL MEMORIES"  value={allEntries.length}          color="white" />
            <Stat label="IMPLEMENTATIONS" value={exp.totalImplementations}   color="violet" />
            <Stat label="SUCCESS RATE"    value={`${exp.successRate}%`}       color="green" />
            <Stat label="AVG CONFIDENCE"  value={`${exp.averageConfidence}%`} color="blue" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="ACTIVE"     value={retStats.ACTIVE}     color="green" />
            <Stat label="ARCHIVED"   value={retStats.ARCHIVED}   color="gray" />
            <Stat label="SUPERSEDED" value={retStats.SUPERSEDED} color="gray" />
            <Stat label="KW INDEX"   value={idxStats.keywords}   color="teal" sub={`${idxStats.components} components`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(exp.memoriesByKind ?? {}).map(([kind, count]) => (
              <div key={kind} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
                <Badge label={kind} color={KIND_COLOR[kind] ?? "gray"} xs />
                <span className="text-white font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: EXPERIENCE */}
      {tab === "experience" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="TOTAL IMPL."   value={exp.totalImplementations} />
            <Stat label="SUCCESS RATE"  value={`${exp.successRate}%`}     color="green" />
            <Stat label="ROLLBACK RATE" value={`${exp.rollbackRate}%`}    color={exp.rollbackRate > 20 ? "red" : "gray"} />
            <Stat label="REUSE RATE"    value={`${exp.reuseRate}%`}       color="blue" />
            <Stat label="BUGS AVOIDED"  value={exp.bugsAvoided}           color="teal" />
            <Stat label="TIME SAVED"    value={`${Math.round(exp.estimatedTimeSavedMs / 1000)}s`} color="yellow" />
            <Stat label="AVG CONFIDENCE" value={`${exp.averageConfidence}%`} color="violet" />
            <Stat label="AUDIT ENTRIES" value={auditStats.total} />
          </div>
          <Panel title="Hierarchy Position">
            {["Engineering Workflow","Engineering Intelligence","Engineering Memory (HERE)","Engineering Governance","Architecture Authority","Implementation"].map((l, i) => (
              <div key={l} className={`flex items-center gap-2 text-sm py-0.5 ${l.includes("HERE") ? "text-violet-300 font-semibold" : "text-zinc-400"}`}>
                <span className="text-zinc-700">{i + 1}.</span> {l.replace(" (HERE)","")}
                {l.includes("HERE") && <Badge label="MEM" color="violet" xs />}
              </div>
            ))}
          </Panel>
        </div>
      )}

      {/* TAB: IMPLEMENTATIONS */}
      {tab === "implementations" && (
        <div className="space-y-2">
          {mem.implementations.all().length === 0 && <p className="text-zinc-500 text-sm">No implementations recorded yet.</p>}
          {mem.implementations.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={e.outcome} color={OUTCOME_COLOR[e.outcome] ?? "gray"} />
                <Badge label={e.strategy} color="blue" xs />
                <span className="text-zinc-300 text-sm flex-1">{e.objective}</span>
                <span className="text-zinc-600 text-xs">{e.durationMs}ms</span>
              </div>
              <div className="flex flex-wrap gap-1">{e.components.map(c => <Badge key={c} label={c} color="violet" xs />)}</div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: BUGS */}
      {tab === "bugs" && (
        <div className="space-y-2">
          {mem.bugs.all().length === 0 && <p className="text-zinc-500 text-sm">No bugs recorded.</p>}
          {mem.bugs.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2"><Badge label={e.impact} color={e.impact === "HIGH" || e.impact === "CRITICAL" ? "red" : "yellow"} /><Badge label={e.module} color="blue" xs /><span className="text-zinc-300 text-sm flex-1">{e.description}</span></div>
              <p className="text-xs text-zinc-500">Root cause: {e.rootCause}</p>
              <p className="text-xs text-zinc-400">Fix: {e.fix}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB: REGRESSIONS */}
      {tab === "regressions" && (
        <div className="space-y-3">
          <Panel title="Average Shield Score"><p className="text-2xl font-bold text-green-300">{mem.regressions.averageShield().toFixed(1)} / 5</p></Panel>
          {mem.regressions.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex gap-3"><Badge label={`Shield: ${e.shieldScore}/5`} color={e.shieldScore === 5 ? "green" : "yellow"} /><Badge label={`${e.testsPassed}/${e.testsRun} passed`} color={e.testsFailed === 0 ? "green" : "red"} /></div>
              {e.rcaSummary.map((r, i) => <p key={i} className="text-xs text-zinc-400">{r}</p>)}
            </div>
          ))}
        </div>
      )}

      {/* TAB: ARCHITECTURE */}
      {tab === "architecture" && (
        <div className="space-y-2">
          {mem.architectures.all().length === 0 && <p className="text-zinc-500 text-sm">No architecture memories recorded yet.</p>}
          {mem.architectures.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1 text-sm">
              <KV k="Proposal" v={e.proposalSummary} />
              <KV k="Decision" v={e.decision} />
              <KV k="Migration" v={e.migrationPlan} />
              {e.featureFlags.length > 0 && <div className="flex flex-wrap gap-1">{e.featureFlags.map(f => <Badge key={f} label={f} color="teal" xs />)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* TAB: DECISIONS */}
      {tab === "decisions" && (
        <div className="space-y-2">
          {mem.decisions.all().length === 0 && <p className="text-zinc-500 text-sm">No decisions recorded yet.</p>}
          {mem.decisions.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1 text-sm">
              <p className="text-zinc-200 font-medium">{e.objective}</p>
              <KV k="Final Decision" v={e.finalDecision} />
              {e.whyReused && <KV k="Why Reused" v={e.whyReused} />}
              {e.whyCreated && <KV k="Why Created" v={e.whyCreated} />}
              {e.alternativesRejected.length > 0 && <p className="text-xs text-zinc-500">Rejected: {e.alternativesRejected.join(", ")}</p>}
            </div>
          ))}
        </div>
      )}

      {/* TAB: CONNECTORS */}
      {tab === "connectors" && (
        <div className="space-y-3">
          {mem.connectors.all().length === 0 && <p className="text-zinc-500 text-sm">No connector memories recorded yet.</p>}
          {mem.connectors.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2"><Badge label={e.connectorName} color="teal" />{e.problems.length > 0 && <Badge label={`${e.problems.length} known issues`} color="yellow" xs />}</div>
              <KV k="Auth" v={e.authNotes} />
              <KV k="Encoding" v={e.encodingNotes} />
              <KV k="Rate Limits" v={e.rateLimitNotes} />
              <KV k="Retry" v={e.retryStrategy} />
              {e.strategies.length > 0 && <div className="flex flex-wrap gap-1">{e.strategies.map(s => <Badge key={s} label={s} color="blue" xs />)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* TAB: PATTERNS */}
      {tab === "patterns" && (
        <div className="space-y-3">
          {mem.patterns.all().length === 0 && <p className="text-zinc-500 text-sm">No patterns detected yet.</p>}
          {mem.patterns.all().map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2"><Badge label={e.patternType} color="yellow" /><Badge label={`freq: ${e.frequency}`} color="orange" xs /></div>
              <p className="text-sm text-zinc-300">{e.description}</p>
              <div className="flex flex-wrap gap-1">{e.involvedComponents.map(c => <Badge key={c} label={c} color="blue" xs />)}</div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: LESSONS */}
      {tab === "lessons" && (
        <div className="space-y-2">
          {mem.lessons.all().length === 0 && <p className="text-zinc-500 text-sm">No lessons recorded yet. They appear after implementations.</p>}
          {mem.lessons.all().map(l => (
            <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2"><Badge label={l.category} color={l.category === "SUCCESS" ? "green" : l.category === "FAILURE" ? "red" : "yellow"} xs /><Badge label={l.sprint} color="violet" xs /></div>
              <p className="text-zinc-300">{l.lesson}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB: ANALYTICS */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Panel title="Top Changed Components">
              {analytics.topChangedComponents.length === 0 ? <p className="text-zinc-600 text-xs">None yet</p>
                : analytics.topChangedComponents.map(({ component, count }) => (
                  <div key={component} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 font-mono">{component}</span>
                    <Badge label={`${count}×`} color="violet" xs />
                  </div>
                ))}
            </Panel>
            <Panel title="Top Bug Modules">
              {analytics.topBugModules.length === 0 ? <p className="text-zinc-600 text-xs">None yet</p>
                : analytics.topBugModules.map(({ module, count }) => (
                  <div key={module} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 font-mono">{module}</span>
                    <Badge label={`${count}×`} color="red" xs />
                  </div>
                ))}
            </Panel>
            <Panel title="Top Reused Components">
              {analytics.topReuseComponents.length === 0 ? <p className="text-zinc-600 text-xs">None yet</p>
                : analytics.topReuseComponents.map(({ component, count }) => (
                  <div key={component} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 font-mono">{component}</span>
                    <Badge label={`${count}×`} color="teal" xs />
                  </div>
                ))}
            </Panel>
            <Panel title="Connectors">
              {analytics.topConnectors.length === 0 ? <p className="text-zinc-600 text-xs">None yet</p>
                : analytics.topConnectors.map(({ name, count }) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 font-mono">{name}</span>
                    <Badge label={`${count}×`} color="green" xs />
                  </div>
                ))}
            </Panel>
          </div>
          <Panel title="Metrics">
            <KV k="Avg duration"          v={`${analytics.averageDurationMs}ms`} />
            <KV k="Regressions avoided"   v={analytics.regressionsAvoided} />
            <KV k="Recurring causes"      v={analytics.recurringCauses.join(", ") || "none"} />
          </Panel>
        </div>
      )}

      {/* TAB: SEARCH */}
      {tab === "search" && (
        <div className="space-y-4">
          <Panel title="Search Before Implementing">
            <p className="text-xs text-zinc-500">Search all memories before implementing. The system reuses existing knowledge when possible.</p>
            <div className="flex gap-3 mt-2">
              <input className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                placeholder="e.g. KnowledgeGraphStore caching"
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()} />
              <button onClick={handleSearch} className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-semibold transition-colors">Search</button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-zinc-500">{searchResults.length} result(s)</p>
                {searchResults.map(({ entry, score, matchedOn }) => (
                  <div key={entry.id} className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1">
                    <div className="flex items-center gap-2"><Badge label={entry.kind} color={KIND_COLOR[entry.kind] ?? "gray"} xs /><Badge label={`score: ${score}`} color="violet" xs /><Badge label={matchedOn} color="gray" xs /></div>
                    <p className="text-xs text-zinc-300 font-mono">{entry.id}</p>
                    <p className="text-xs text-zinc-500">{JSON.stringify(entry).slice(0, 120)}…</p>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && query && <p className="text-zinc-500 text-xs mt-2">No results — safe to create new implementation.</p>}
          </Panel>
        </div>
      )}

      {/* TAB: TIMELINE */}
      {tab === "timeline" && (
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {allEntries.length === 0 && <p className="text-zinc-500 text-sm">No entries yet.</p>}
          {[...allEntries].reverse().map(e => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded border border-zinc-800 bg-zinc-900 text-xs font-mono">
              <Badge label={e.kind} color={KIND_COLOR[e.kind] ?? "gray"} xs />
              <Badge label={e.status} color={e.status === "ACTIVE" ? "green" : "gray"} xs />
              <span className="text-zinc-400 flex-1 truncate">{e.tags.join(", ")}</span>
              <span className="text-zinc-600">{new Date(e.createdAt).toISOString().slice(11, 19)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-1 items-center">
        <span className="text-xs font-mono text-zinc-600 mr-1">19 MODULES:</span>
        {["ImplementationMemory","BugMemory","RegressionMemory","DecisionMemory","ArchitectureMemory","ConnectorMemory","PatternMemory","RepairMemory","ApprovalMemory","MemoryIndexer","MemorySearch","MemoryRanking","MemoryRetention","MemoryAnalytics","LearningLoop","EngineeringLessons","EngineeringExperience","MemoryAudit"].map(m => (
          <Badge key={m} label={m} color="violet" xs />
        ))}
      </div>
    </div>
  );
}