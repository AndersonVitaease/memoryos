import React, { useState } from "react";
import { GitBranch, Search, FileCode, Clock, GitCommit, Layers, Plug, Activity, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { GitHubQueryRouter } from "@/lib/conversation-cognitive-gateway/GitHubQueryRouter";
import { ConnectorInvocationService } from "@/lib/cognitive-connector/ConnectorInvocationService";
import { CognitiveAnswerComposer } from "@/lib/cognitive-answer-composer/CognitiveAnswerComposer";
import ReactMarkdown from "react-markdown";

const router  = new GitHubQueryRouter();
const cis     = new ConnectorInvocationService();
const composer = new CognitiveAnswerComposer();

const TABS = [
  { id: "search",       label: "Search",         icon: Search },
  { id: "tree",         label: "Repo Tree",       icon: Layers },
  { id: "commits",      label: "Commits",         icon: GitCommit },
  { id: "files",        label: "File Intel",      icon: FileCode },
  { id: "history",      label: "File History",    icon: Clock },
  { id: "prs",          label: "PRs & Issues",    icon: GitBranch },
  { id: "diagnostics",  label: "Diagnostics",     icon: Activity },
];

function StatusBadge({ status }) {
  const map = {
    SUCCESS: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    FAILED: "bg-red-900/40 text-red-300 border-red-700",
    NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
    RUNNING: "bg-blue-900/40 text-blue-300 border-blue-700",
    IDLE: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono border ${map[status] ?? map.IDLE}`}>
      {status}
    </span>
  );
}

function ResultCard({ title, result, loading }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition"
      >
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />}
          {result && <StatusBadge status={result.record?.status ?? "IDLE"} />}
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-zinc-950">
          {loading && <p className="text-xs text-zinc-500 animate-pulse">Executing...</p>}
          {!loading && result && (
            <>
              {result.narrative && (
                <div className="prose prose-sm prose-invert max-w-none text-zinc-300 mb-3">
                  <ReactMarkdown>{result.narrative}</ReactMarkdown>
                </div>
              )}
              {result.record?.error && (
                <p className="text-xs text-red-400 font-mono mt-2">{result.record.error}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2 text-xs text-zinc-600">
                {result.record?.id && <span>ID: {result.record.id.slice(-8)}</span>}
                {result.record?.durationMs != null && <span>{result.record.durationMs}ms</span>}
              </div>
            </>
          )}
          {!loading && !result && <p className="text-xs text-zinc-600">No result yet.</p>}
        </div>
      )}
    </div>
  );
}

async function runQuery(query, extraPayload = {}) {
  const route = router.route(query);
  if (!route.isGitHubQuery || !route.capability) {
    return { record: { status: "FAILED", error: "No GitHub capability matched for: " + query }, narrative: null };
  }
  const payload = { ...route.payload, ...extraPayload };
  // Auto-discover owner/repo if missing
  if (!payload.owner || !payload.repo) {
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 3 },
      { originComponent: "Phase58Page", reason: "Auto-discover repo" });
    if (reposInv.record.status === "SUCCESS") {
      const items = reposInv.result?.data?.items ?? [];
      if (items.length > 0) { payload.owner = items[0].owner; payload.repo = items[0].name; }
    }
  }
  const inv = await cis.invoke("github", route.capability, payload,
    { originComponent: "Phase58Page", reason: `EF-58 dashboard: ${route.capability}` });
  let narrative = null;
  if (inv.record.status === "SUCCESS" && inv.result?.data) {
    const composed = composer.composeFromConnectorResult(query, route.capability, inv.result.data, [], inv.record.id, inv.record.durationMs);
    narrative = composed.narrative;
  }
  return { record: inv.record, narrative };
}

// ── Tab Components ─────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState("Where is ConnectionManager implemented?");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    setResult(await runQuery(query));
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
        <p className="text-xs text-zinc-500 mb-3">Natural language search — maps to the correct GitHub Code Search capability automatically.</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()}
            className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Where is PlanningEngine?"'
          />
          <button onClick={run} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {["Where is ConnectionManager?", "Find PlanningEngine", "Who imports ConnectorInvocationService", "Search CognitiveAnswerComposer"].map(q => (
            <button key={q} onClick={() => { setQuery(q); }} className="text-xs text-zinc-500 hover:text-violet-400 transition bg-zinc-800 px-2 py-1 rounded">
              {q}
            </button>
          ))}
        </div>
      </div>
      <ResultCard title="Search Result" result={result} loading={loading} />
    </div>
  );
}

function RepoTreeTab() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const run = async (queryStr) => {
    setLoading(l => ({ ...l, [queryStr]: true }));
    const r = await runQuery(queryStr);
    setResults(prev => ({ ...prev, [queryStr]: r }));
    setLoading(l => ({ ...l, [queryStr]: false }));
  };

  const queries = [
    { label: "Repository Tree",      q: "repository tree" },
    { label: "Project Modules",      q: "project modules" },
    { label: "Dependencies",         q: "project dependencies" },
    { label: "Repository Statistics", q: "repository statistics" },
    { label: "Entry Points",         q: "entrypoints" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {queries.map(({ label, q }) => (
          <button key={q} onClick={() => run(q)} disabled={loading[q]} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition">
            {loading[q] && <Loader2 className="w-3 h-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      {queries.map(({ label, q }) => (
        <ResultCard key={q} title={label} result={results[q]} loading={loading[q]} />
      ))}
    </div>
  );
}

function CommitsTab() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const run = async (queryStr) => {
    setLoading(l => ({ ...l, [queryStr]: true }));
    const r = await runQuery(queryStr);
    setResults(prev => ({ ...prev, [queryStr]: r }));
    setLoading(l => ({ ...l, [queryStr]: false }));
  };

  const queries = [
    { label: "Commit Timeline",         q: "what changed last sprint" },
    { label: "Recent Commits",          q: "recent commits" },
    { label: "Branch Comparison",       q: "diff branch head main" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {queries.map(({ label, q }) => (
          <button key={q} onClick={() => run(q)} disabled={loading[q]} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition">
            {loading[q] && <Loader2 className="w-3 h-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      {queries.map(({ label, q }) => (
        <ResultCard key={q} title={label} result={results[q]} loading={loading[q]} />
      ))}
    </div>
  );
}

function FileIntelTab() {
  const [path, setPath] = useState("src/lib/connection-manager/ConnectionManager.ts");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const runOp = async (op, label) => {
    setLoading(l => ({ ...l, [op]: true }));
    const route = router.route(`explain file ${path}`);
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 1 }, { originComponent: "Phase58Page", reason: "auto-discover" });
    let owner = "", repo = "";
    if (reposInv.record.status === "SUCCESS") {
      const items = reposInv.result?.data?.items ?? [];
      if (items.length > 0) { owner = items[0].owner; repo = items[0].name; }
    }
    const inv = await cis.invoke("github", op, { owner, repo, path }, { originComponent: "Phase58Page", reason: `File Intel: ${op}` });
    let narrative = null;
    if (inv.record.status === "SUCCESS" && inv.result?.data) {
      const composed = composer.composeFromConnectorResult(label, op, inv.result.data, [], inv.record.id, inv.record.durationMs);
      narrative = composed.narrative;
    }
    setResults(prev => ({ ...prev, [op]: { record: inv.record, narrative } }));
    setLoading(l => ({ ...l, [op]: false }));
  };

  const ops = [
    { op: "file.explanation",     label: "File Explanation" },
    { op: "file.responsibilities", label: "Responsibilities" },
    { op: "file.dependencies",    label: "Dependencies" },
    { op: "file.imports",         label: "Imports" },
    { op: "file.exports",         label: "Exports" },
    { op: "file.summary",         label: "Summary" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500 font-mono"
          placeholder="src/lib/something.ts"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ops.map(({ op, label }) => (
          <button key={op} onClick={() => runOp(op, label)} disabled={loading[op]} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition">
            {loading[op] && <Loader2 className="w-3 h-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      {ops.map(({ op, label }) => (
        <ResultCard key={op} title={label} result={results[op]} loading={loading[op]} />
      ))}
    </div>
  );
}

function HistoryTab() {
  const [path, setPath] = useState("src/lib/connection-manager/ConnectionManager.ts");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 1 }, { originComponent: "Phase58Page", reason: "auto-discover" });
    let owner = "", repo = "";
    if (reposInv.record.status === "SUCCESS") {
      const items = reposInv.result?.data?.items ?? [];
      if (items.length > 0) { owner = items[0].owner; repo = items[0].name; }
    }
    const inv = await cis.invoke("github", "history.file", { owner, repo, path }, { originComponent: "Phase58Page", reason: "File History" });
    let narrative = null;
    if (inv.record.status === "SUCCESS" && inv.result?.data) {
      const composed = composer.composeFromConnectorResult("File history", "history.file", inv.result.data, [], inv.record.id, inv.record.durationMs);
      narrative = composed.narrative;
    }
    setResult({ record: inv.record, narrative });
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500 font-mono"
          placeholder="src/lib/something.ts"
        />
        <button onClick={run} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get History"}
        </button>
      </div>
      <ResultCard title="File History" result={result} loading={loading} />
    </div>
  );
}

function PRsTab() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const run = async (queryStr) => {
    setLoading(l => ({ ...l, [queryStr]: true }));
    const r = await runQuery(queryStr);
    setResults(prev => ({ ...prev, [queryStr]: r }));
    setLoading(l => ({ ...l, [queryStr]: false }));
  };

  const queries = [
    { label: "Open Pull Requests", q: "pull requests" },
    { label: "Open Issues",        q: "open issues" },
    { label: "Search Issues",      q: "find issue enhancement" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {queries.map(({ label, q }) => (
          <button key={q} onClick={() => run(q)} disabled={loading[q]} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition">
            {loading[q] && <Loader2 className="w-3 h-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      {queries.map(({ label, q }) => (
        <ResultCard key={q} title={label} result={results[q]} loading={loading[q]} />
      ))}
    </div>
  );
}

function DiagnosticsTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const r = await cis.buildReport();
    setReport(r);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button onClick={run} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
        Run Diagnostics
      </button>
      {report && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Status",       value: report.certificationLevel },
              { label: "Invocations",  value: report.totalInvocations },
              { label: "Successful",   value: report.successfulInvocations },
              { label: "Connectors",   value: report.discoveredConnectors?.length ?? 0 },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className="text-lg font-bold text-zinc-200 font-mono">{String(m.value)}</p>
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">Connectors</p>
            {(report.discoveredConnectors ?? []).map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-sm text-zinc-300">{c.name}</span>
                <StatusBadge status={c.healthStatus === "healthy" ? "SUCCESS" : c.healthStatus === "unhealthy" ? "NOT_CONFIGURED" : "FAILED"} />
              </div>
            ))}
          </div>
          {report.invocationHistory?.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-2">Recent Invocations</p>
              {report.invocationHistory.slice(-8).reverse().map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0 gap-2">
                  <span className="text-xs font-mono text-zinc-400 truncate">{inv.connectorId}.{inv.operation}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={inv.status} />
                    <span className="text-xs text-zinc-600">{inv.durationMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase58Page() {
  const [activeTab, setActiveTab] = useState("search");

  const tabContent = {
    search:      <SearchTab />,
    tree:        <RepoTreeTab />,
    commits:     <CommitsTab />,
    files:       <FileIntelTab />,
    history:     <HistoryTab />,
    prs:         <PRsTab />,
    diagnostics: <DiagnosticsTab />,
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <FileCode className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 font-heading">Phase 5.8.0 — GitHub Deep Analysis</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Engineering Knowledge Layer · Code Intelligence &amp; Repository Navigation</p>
      </div>

      {/* EF Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          "EF-58.1 Search Engine", "EF-58.2 Repository Map",
          "EF-58.3 File Intelligence", "EF-58.4 Commit Intelligence",
          "EF-58.5 Diff Analyzer", "EF-58.6 File History",
          "EF-58.8 PRs & Issues", "EF-58.9 Code Composer",
        ].map(ef => (
          <div key={ef} className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-2 py-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-emerald-300 truncate">{ef}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-zinc-800 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition border-b-2 -mb-px ${
              activeTab === t.id
                ? "text-violet-300 border-violet-500 bg-violet-900/10"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{tabContent[activeTab]}</div>
    </div>
  );
}