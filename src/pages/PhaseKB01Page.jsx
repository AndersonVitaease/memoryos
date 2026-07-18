/**
 * PhaseKB01Page.jsx — Sprint KB-01 Dashboard
 * Operational Knowledge Base Foundation
 */

import React, { useState, useMemo } from "react";
import { OperationalKnowledgeLoader } from "@/lib/operational-knowledge/OperationalKnowledgeLoader";
import { OperationalKnowledgeSearch } from "@/lib/operational-knowledge/OperationalKnowledgeSearch";
import { OperationalKnowledgeIndex }  from "@/lib/operational-knowledge/OperationalKnowledgeIndex";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  LESSONS_LEARNED:    "Lessons Learned",
  TROUBLESHOOTING:    "Troubleshooting",
  ANTI_PATTERNS:      "Anti-Patterns",
  BEST_PRACTICES:     "Best Practices",
  ENGINEERING_JOURNAL:"Engineering Journal",
  DEBUG_PLAYBOOK:     "Debug Playbook",
  KNOWN_ISSUES:       "Known Issues",
};

const PRIORITY_COLORS = {
  P0: "bg-red-900 text-red-200 border-red-700",
  P1: "bg-orange-900 text-orange-200 border-orange-700",
  P2: "bg-yellow-900 text-yellow-200 border-yellow-700",
  P3: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_COLORS = {
  OPEN:                "text-red-400",
  PARTIALLY_MITIGATED: "text-yellow-400",
  RESOLVED:            "text-emerald-400",
  ACCEPTED:            "text-blue-400",
  CLOSED:              "text-zinc-500",
};

const TABS = [
  { id: "overview",    label: "Overview"       },
  { id: "lessons",     label: "Lessons"        },
  { id: "antipatterns",label: "Anti-Patterns"  },
  { id: "practices",   label: "Best Practices" },
  { id: "issues",      label: "Known Issues"   },
  { id: "journal",     label: "Journal"        },
  { id: "search",      label: "Search"         },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, color = "text-violet-300" }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
    </div>
  );
}

function Badge({ label, style }) {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${style}`}>{label}</span>
  );
}

function EntryRow({ id, title, meta, metaColor = "text-zinc-500" }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-600 font-mono text-xs w-16 shrink-0 mt-0.5">{id}</span>
      <span className="text-zinc-300 text-sm flex-1">{title}</span>
      {meta && <span className={`text-xs font-mono shrink-0 ${metaColor}`}>{meta}</span>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PhaseKB01Page() {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  const stats      = useMemo(() => OperationalKnowledgeLoader.getStats(),       []);
  const lessons    = useMemo(() => OperationalKnowledgeLoader.getLessonsLearned(), []);
  const antiPatterns = useMemo(() => OperationalKnowledgeLoader.getAntiPatterns(), []);
  const bestPractices = useMemo(() => OperationalKnowledgeLoader.getBestPractices(), []);
  const knownIssues  = useMemo(() => OperationalKnowledgeLoader.getKnownIssues(),  []);
  const journal      = useMemo(() => OperationalKnowledgeLoader.getJournalEntries(), []);
  const indexSize    = useMemo(() => OperationalKnowledgeIndex.size(),             []);

  function handleSearch(e) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearchResults(OperationalKnowledgeSearch.searchAll(searchText.trim()));
  }

  const openIssues = knownIssues.filter(i => i.status !== "RESOLVED" && i.status !== "CLOSED" && i.status !== "ACCEPTED").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT KB-01 — OPERATIONAL KNOWLEDGE BASE FOUNDATION</div>
          <div className="text-xl font-bold text-white">MemoryOS Operational Knowledge Base</div>
          <div className="text-zinc-400 text-sm mt-1">
            Engineering lessons, troubleshooting guides, anti-patterns, best practices, known issues.
          </div>
          <div className="mt-2 text-xs text-zinc-600">
            Authority: ENGINEERING &nbsp;·&nbsp; Complements Official Library without altering it &nbsp;·&nbsp; Zero breaking changes
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Documents"      value={stats.totalDocuments} color="text-violet-300" />
          <MetricCard label="Total Entries"  value={stats.totalEntries}   color="text-sky-300" />
          <MetricCard label="Index Terms"    value={indexSize}            color="text-emerald-300" />
          <MetricCard label="Open Issues"    value={openIssues}           color={openIssues > 0 ? "text-yellow-400" : "text-emerald-400"} />
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
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">DOCUMENTS BY CATEGORY</div>
              {Object.entries(stats.byCategory).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                  <span className="text-zinc-300 text-sm">{CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className="text-violet-400 font-mono text-sm">{count}</span>
                </div>
              ))}
            </div>

            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">RELATIONSHIP TO OFFICIAL LIBRARY</div>
              <div className="p-4 space-y-2 text-sm text-zinc-400">
                <p>This Operational Knowledge Base <span className="text-white">complements</span> the Official Library.</p>
                <p>It does <span className="text-red-400">NOT modify</span> any Official Library document (MV, MPS, MAS, MDS, MRS, MCS, MDIS, MIES, MDPS, MGFS, MRI, MQCCS, MPEGS, MCF, CDG, CCS, RVP, ORB, TST).</p>
                <p>It does <span className="text-red-400">NOT alter</span> ADRs, RFCs, or the Architecture.</p>
                <p>It <span className="text-emerald-400">preserves</span> all engineering experience without contaminating architectural authority.</p>
              </div>
            </div>
          </div>
        )}

        {/* Lessons Learned */}
        {activeTab === "lessons" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              LESSONS LEARNED — {lessons.length} entries
            </div>
            {lessons.map(l => <EntryRow key={l.id} id={l.id} title={l.title} meta={l.sprint} />)}
          </div>
        )}

        {/* Anti-Patterns */}
        {activeTab === "antipatterns" && (
          <div className="border border-red-900/40 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-red-400 tracking-widest">
              ANTI-PATTERNS — {antiPatterns.length} entries — DO NOT REPEAT
            </div>
            {antiPatterns.map(ap => <EntryRow key={ap.id} id={ap.id} title={ap.title} />)}
          </div>
        )}

        {/* Best Practices */}
        {activeTab === "practices" && (
          <div className="border border-emerald-900/40 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-emerald-400 tracking-widest">
              BEST PRACTICES — {bestPractices.length} entries — APPROVED PATTERNS
            </div>
            {bestPractices.map(bp => <EntryRow key={bp.id} id={bp.id} title={bp.title} />)}
          </div>
        )}

        {/* Known Issues */}
        {activeTab === "issues" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              KNOWN ISSUES — {knownIssues.length} total · {openIssues} open
            </div>
            {knownIssues.map(ki => (
              <div key={ki.id} className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-600 font-mono text-xs w-16 shrink-0 mt-0.5">{ki.id}</span>
                <span className="text-zinc-300 text-sm flex-1">{ki.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge label={ki.priority} style={PRIORITY_COLORS[ki.priority] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                  <span className={`text-xs font-mono ${STATUS_COLORS[ki.status] ?? "text-zinc-500"}`}>{ki.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Engineering Journal */}
        {activeTab === "journal" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ENGINEERING JOURNAL — {journal.length} entries
            </div>
            {journal.map(ej => (
              <div key={ej.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-zinc-600 font-mono text-xs">{ej.id}</span>
                  <span className="text-violet-400 font-mono text-xs">{ej.sprint}</span>
                  <span className="text-zinc-600 text-xs">{ej.date}</span>
                </div>
                <p className="text-zinc-300 text-sm">{ej.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search by problem, component, sprint, error, keyword..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-600"
              />
              <button type="submit"
                className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
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
                    <div key={r.documentId} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 last:border-0">
                      <div>
                        <span className="text-zinc-600 font-mono text-xs mr-3">{r.documentId}</span>
                        <span className="text-zinc-300 text-sm">{r.documentName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                        <span className="text-violet-400 font-mono text-xs">score:{r.score}</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            <div className="border border-zinc-800 rounded-lg bg-zinc-900 p-4">
              <div className="text-zinc-500 text-xs tracking-widest mb-2">INDEX STATS</div>
              <div className="text-zinc-400 text-xs">
                {indexSize} indexed terms across {stats.totalDocuments} documents · {stats.totalEntries} total entries
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}