/**
 * PhaseKB02Page.jsx — Sprint KB-02 Dashboard
 * Evidence-Based Knowledge Foundation
 */

import React, { useState, useMemo } from "react";
import { EvidenceRegistry }  from "@/lib/operational-knowledge/evidence/EvidenceRegistry";
import { EvidenceCollector } from "@/lib/operational-knowledge/evidence/EvidenceCollector";
import { EvidenceValidator } from "@/lib/operational-knowledge/evidence/EvidenceValidator";
import { EvidenceSearch }    from "@/lib/operational-knowledge/evidence/EvidenceSearch";
import { EvidenceLinker }    from "@/lib/operational-knowledge/evidence/EvidenceLinker";
import { EvidenceIndex }     from "@/lib/operational-knowledge/evidence/EvidenceIndex";

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  CRITICAL: "bg-red-900 text-red-200 border-red-700",
  HIGH:     "bg-orange-900 text-orange-200 border-orange-700",
  MEDIUM:   "bg-yellow-900 text-yellow-200 border-yellow-700",
  LOW:      "bg-zinc-800 text-zinc-300 border-zinc-700",
  INFO:     "bg-blue-900 text-blue-200 border-blue-800",
};

const STATUS_COLORS = {
  OPEN:          "text-red-400",
  INVESTIGATING: "text-yellow-400",
  RESOLVED:      "text-emerald-400",
  ACCEPTED:      "text-blue-400",
  WONT_FIX:      "text-zinc-500",
  DUPLICATE:     "text-zinc-500",
};

const TABS = [
  { id: "overview",  label: "Overview"    },
  { id: "evidences", label: "Evidences"   },
  { id: "stats",     label: "Stats"       },
  { id: "graph",     label: "Links"       },
  { id: "validate",  label: "Validate"    },
  { id: "search",    label: "Search"      },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, color = "text-violet-300", sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function Badge({ label, style }) {
  return <span className={`text-xs font-mono px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function EvidenceRow({ e, onClick, active }) {
  return (
    <button onClick={() => onClick(e.id)}
      className={`w-full flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 text-left hover:bg-zinc-800/40 transition-colors ${active ? "bg-zinc-800/60" : ""}`}>
      <span className="text-zinc-600 font-mono text-xs w-16 shrink-0 mt-0.5">{e.id}</span>
      <div className="flex-1 min-w-0">
        <p className="text-zinc-200 text-sm">{e.title}</p>
        <p className="text-zinc-500 text-xs mt-0.5">{e.sprint} · {e.date}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge label={e.severity} style={SEVERITY_COLORS[e.severity] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
        <span className={`text-xs font-mono ${STATUS_COLORS[e.status] ?? "text-zinc-500"}`}>{e.status}</span>
      </div>
    </button>
  );
}

function EvidenceDetail({ evidence }) {
  if (!evidence) return (
    <div className="p-6 text-center text-zinc-600 text-sm">Select an evidence to view details.</div>
  );
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-violet-400 font-mono font-bold text-base">{evidence.id}</span>
        <Badge label={evidence.severity} style={SEVERITY_COLORS[evidence.severity] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
        <Badge label={evidence.type} style="bg-zinc-800 text-zinc-300 border-zinc-700" />
        <span className={`font-mono text-xs ${STATUS_COLORS[evidence.status]}`}>{evidence.status}</span>
      </div>
      <h3 className="text-white font-semibold">{evidence.title}</h3>
      {[
        ["Problem",          evidence.problem],
        ["Initial Hypothesis",evidence.initialHypothesis],
        ["Root Cause",       evidence.rootCause],
        ["Solution",         evidence.solution],
        ["Result",           evidence.result],
      ].map(([label, value]) => value ? (
        <div key={label}>
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-0.5">{label}</div>
          <div className="text-zinc-300">{value}</div>
        </div>
      ) : null)}
      {evidence.components?.length > 0 && (
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Components</div>
          <div className="flex flex-wrap gap-1">
            {evidence.components.map(c => <Badge key={c} label={c} style="bg-zinc-800 text-zinc-400 border-zinc-700" />)}
          </div>
        </div>
      )}
      {(evidence.links?.adrs?.length > 0 || evidence.links?.rfcs?.length > 0 || evidence.links?.officialDocs?.length > 0) && (
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Official References</div>
          <div className="flex flex-wrap gap-1">
            {[...(evidence.links.adrs ?? []), ...(evidence.links.rfcs ?? []), ...(evidence.links.officialDocs ?? [])].map(r =>
              <Badge key={r} label={r} style="bg-violet-900/40 text-violet-300 border-violet-800" />
            )}
          </div>
        </div>
      )}
      {(evidence.links?.antiPatterns?.length > 0 || evidence.links?.bestPractices?.length > 0 || evidence.links?.lessonsLearned?.length > 0) && (
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">KB Links</div>
          <div className="flex flex-wrap gap-1">
            {[...(evidence.links.lessonsLearned ?? []), ...(evidence.links.antiPatterns ?? []), ...(evidence.links.bestPractices ?? [])].map(r =>
              <Badge key={r} label={r} style="bg-emerald-900/40 text-emerald-300 border-emerald-800" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PhaseKB02Page() {
  const [activeTab,    setActiveTab]    = useState("overview");
  const [selectedId,   setSelectedId]   = useState(null);
  const [searchText,   setSearchText]   = useState("");
  const [searchResults,setSearchResults]= useState(null);
  const [validationReport, setValidationReport] = useState(null);

  const stats     = useMemo(() => EvidenceRegistry.getStats(),       []);
  const allEv     = useMemo(() => EvidenceRegistry.getAll(),         []);
  const latest    = useMemo(() => EvidenceCollector.getLatest(5),    []);
  const recurring = useMemo(() => EvidenceCollector.findRecurringProblems(), []);
  const openEv    = useMemo(() => EvidenceCollector.getOpenEvidences(), []);
  const indexInfo = useMemo(() => EvidenceIndex.summary(),           []);
  const selected  = useMemo(() => selectedId ? EvidenceRegistry.getById(selectedId) : null, [selectedId]);
  const graph     = useMemo(() => selectedId ? EvidenceLinker.buildGraph(selectedId) : null, [selectedId]);

  function handleSearch(e) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearchResults(EvidenceSearch.searchAll(searchText.trim()));
  }

  function runValidation() {
    setValidationReport(EvidenceValidator.auditRegistry());
  }

  const sprintEntries = useMemo(() => {
    return Object.entries(stats.bySprint).sort(([,a],[,b]) => b - a);
  }, [stats]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT KB-02 — EVIDENCE-BASED KNOWLEDGE FOUNDATION</div>
          <div className="text-xl font-bold text-white">MemoryOS Evidence Registry</div>
          <div className="text-zinc-400 text-sm mt-1">
            Every lesson backed by verifiable evidence. Searchable. Auditable. Cross-referenced.
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Evidences" value={stats.total}           color="text-violet-300" />
          <MetricCard label="Open"            value={openEv.length}        color={openEv.length > 0 ? "text-yellow-400" : "text-emerald-400"} />
          <MetricCard label="Resolved"        value={stats.byStatus?.RESOLVED ?? 0} color="text-emerald-400" />
          <MetricCard label="Index Terms"     value={indexInfo.termCount}  color="text-sky-300" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">LATEST EVIDENCES</div>
              {latest.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                  <span className="text-zinc-600 font-mono text-xs w-16">{e.id}</span>
                  <span className="text-zinc-300 text-sm flex-1 truncate">{e.title}</span>
                  <Badge label={e.severity} style={SEVERITY_COLORS[e.severity] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                </div>
              ))}
            </div>

            {recurring.length > 0 && (
              <div className="border border-amber-900/40 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-amber-400 tracking-widest">RECURRING PROBLEMS</div>
                {recurring.map(r => (
                  <div key={r.pattern} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-300 text-sm">{r.pattern}</span>
                    <span className="text-amber-400 font-mono text-xs">{r.occurrences}x</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP COMPONENTS AFFECTED</div>
              {stats.topComponents.map(({ component, count }) => (
                <div key={component} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                  <span className="text-zinc-300 text-sm font-mono">{component}</span>
                  <span className="text-violet-400 font-mono text-xs">{count} evidence{count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidences */}
        {activeTab === "evidences" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                ALL EVIDENCES — {allEv.length}
              </div>
              <div className="overflow-y-auto max-h-[520px]">
                {allEv.map(e => <EvidenceRow key={e.id} e={e} onClick={setSelectedId} active={selectedId === e.id} />)}
              </div>
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-y-auto max-h-[580px]">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">EVIDENCE DETAIL</div>
              <EvidenceDetail evidence={selected} />
            </div>
          </div>
        )}

        {/* Stats */}
        {activeTab === "stats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">BY SEVERITY</div>
                {Object.entries(stats.bySeverity).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 last:border-0">
                    <Badge label={k} style={SEVERITY_COLORS[k] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    <span className="text-zinc-400 font-mono text-sm">{v}</span>
                  </div>
                ))}
              </div>
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">BY STATUS</div>
                {Object.entries(stats.byStatus).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 last:border-0">
                    <span className={`text-sm font-mono ${STATUS_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                    <span className="text-zinc-400 font-mono text-sm">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">BY SPRINT</div>
              {sprintEntries.map(([sprint, count]) => (
                <div key={sprint} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                  <span className="text-zinc-300 text-sm flex-1">{sprint}</span>
                  <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full"
                      style={{ width: `${(count / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-zinc-400 font-mono text-xs w-4 text-right">{count}</span>
                </div>
              ))}
            </div>

            {(stats.avgTimeToFixMs > 0 || stats.avgTimeToInvestigateMs > 0) && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Avg Time to Fix" value={`${Math.round(stats.avgTimeToFixMs / 60000)}m`} color="text-sky-300" />
                <MetricCard label="Avg Investigation" value={`${Math.round(stats.avgTimeToInvestigateMs / 60000)}m`} color="text-amber-300" />
              </div>
            )}
          </div>
        )}

        {/* Links / Graph */}
        {activeTab === "graph" && (
          <div className="space-y-4">
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">SELECT EVIDENCE TO VIEW LINKS</div>
              <div className="overflow-y-auto max-h-48">
                {allEv.map(e => (
                  <button key={e.id} onClick={() => setSelectedId(e.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 text-left hover:bg-zinc-800/40 ${selectedId === e.id ? "bg-zinc-800/60" : ""}`}>
                    <span className="text-zinc-500 font-mono text-xs w-16">{e.id}</span>
                    <span className="text-zinc-300 text-sm truncate flex-1">{e.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {graph && (
              <div className="border border-violet-900/40 rounded-lg bg-zinc-900 p-4 space-y-3">
                <div className="text-violet-300 font-mono text-sm font-bold">{graph.evidenceId} — {graph.title}</div>
                {[
                  ["Lessons Learned",  graph.linkedLessons,       "text-sky-400"],
                  ["Anti-Patterns",    graph.linkedAntiPatterns,  "text-red-400"],
                  ["Best Practices",   graph.linkedBestPractices, "text-emerald-400"],
                  ["Known Issues",     graph.linkedKnownIssues,   "text-yellow-400"],
                  ["Official Docs",    graph.linkedOfficialDocs,  "text-violet-400"],
                  ["ADRs",             graph.linkedAdrs,          "text-blue-400"],
                  ["RFCs",             graph.linkedRfcs,          "text-purple-400"],
                  ["Components",       graph.linkedComponents,    "text-zinc-400"],
                ].filter(([, refs]) => refs.length > 0).map(([label, refs, color]) => (
                  <div key={label}>
                    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{label}</div>
                    <div className="flex flex-wrap gap-1">
                      {refs.map(r => <Badge key={r} label={r} style={`bg-zinc-800 border-zinc-700 ${color}`} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Validate */}
        {activeTab === "validate" && (
          <div className="space-y-4">
            <button onClick={runValidation}
              className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
              Run Evidence Audit
            </button>

            {validationReport && (
              <>
                <div className={`border-2 rounded-xl p-4 text-center ${validationReport.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
                  <div className={`text-xl font-bold ${validationReport.certified ? "text-emerald-400" : "text-red-400"}`}>
                    {validationReport.certified ? "✓ ALL EVIDENCES VALID" : "✗ VALIDATION FAILED"}
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">
                    {validationReport.valid}/{validationReport.totalChecked} valid · {validationReport.withWarnings} with warnings
                  </div>
                </div>

                <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                  {validationReport.results.map(r => (
                    <div key={r.evidenceId} className={`px-4 py-3 border-b border-zinc-800 last:border-0 ${!r.valid ? "bg-red-950/10" : ""}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${r.valid ? "text-emerald-400" : "text-red-400"}`}>{r.valid ? "PASS" : "FAIL"}</span>
                        <span className="text-zinc-400 font-mono text-xs">{r.evidenceId}</span>
                      </div>
                      {r.errors.map((err, i) => <div key={i} className="text-red-400 text-xs pl-2">✗ {err}</div>)}
                      {r.warnings.map((w, i) => <div key={i} className="text-yellow-400 text-xs pl-2">⚠ {w}</div>)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Search */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Search by component, sprint, ADR, RFC, problem, file, keyword..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-600" />
              <button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
                Search
              </button>
            </form>

            {searchResults !== null && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  RESULTS FOR "{searchText}" — {searchResults.length} found
                </div>
                {searchResults.length === 0
                  ? <div className="px-4 py-6 text-center text-zinc-500 text-sm">No results found.</div>
                  : searchResults.map(r => (
                    <div key={r.evidenceId} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 last:border-0">
                      <div>
                        <span className="text-zinc-500 font-mono text-xs mr-3">{r.evidenceId}</span>
                        <span className="text-zinc-300 text-sm">{r.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge label={r.severity} style={SEVERITY_COLORS[r.severity] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                        <span className="text-violet-400 font-mono text-xs">score:{r.score}</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            <div className="border border-zinc-800 rounded-lg bg-zinc-900 p-4">
              <div className="text-zinc-500 text-xs tracking-widest mb-1">INDEX STATS</div>
              <div className="text-zinc-400 text-xs">{indexInfo.termCount} terms · {indexInfo.evidenceCount} evidences indexed</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}