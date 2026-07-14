import React, { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle, XCircle, AlertTriangle, Activity, Search, GitBranch, FileCode, ChevronDown, ChevronUp } from "lucide-react";
import { EF581ValidationSuite } from "@/lib/github-deep-analysis/ef581Tests";
import { RepositoryResolver } from "@/lib/github-deep-analysis/RepositoryResolver";
import { SearchRanker } from "@/lib/github-deep-analysis/SearchRanker";
import { ConnectorInvocationService } from "@/lib/cognitive-connector/ConnectorInvocationService";

const suite    = new EF581ValidationSuite();
const resolver = new RepositoryResolver();
const ranker   = new SearchRanker();
const cis      = new ConnectorInvocationService();

const TABS = [
  { id: "validation",  label: "Validation Suite",    icon: ShieldCheck },
  { id: "resolver",    label: "Repo Resolver",        icon: GitBranch },
  { id: "ranker",      label: "Search Ranker",        icon: Search },
  { id: "diagnostics", label: "Live Diagnostics",     icon: Activity },
];

const STATUS_STYLES = {
  PASS:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:           "bg-red-900/40 text-red-300 border-red-700",
  NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
};

function TestRow({ result }) {
  const [open, setOpen] = useState(false);
  const icon = result.status === "PASS"
    ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
    : result.status === "FAIL"
      ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800/60 transition text-left">
        {icon}
        <span className="flex-1 text-sm text-zinc-200">{result.name}</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${STATUS_STYLES[result.status]}`}>{result.status}</span>
        <span className="text-xs text-zinc-600 ml-2">{result.durationMs}ms</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-zinc-950 text-xs space-y-1">
          <p className="text-zinc-500">Category: <span className="text-zinc-400">{result.category}</span></p>
          {result.evidence.map((e, i) => <p key={i} className="text-zinc-400">• {e}</p>)}
          {result.error && <p className="text-red-400 font-mono mt-1">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

function ValidationTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setReport(null);
    setReport(await suite.run());
    setLoading(false);
  };

  const categories = report ? [...new Set(report.results.map(r => r.category))] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Runs all EF-58.1 tests against live GitHub connector.</p>
        <button onClick={run} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? "Running..." : "Run Validation"}
        </button>
      </div>
      {report && (
        <>
          <div className={`rounded-xl border p-4 ${report.certified ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-800"}`}>
            <div className="flex items-center gap-2 mb-1">
              {report.certified ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <span className={`font-bold ${report.certified ? "text-emerald-300" : "text-red-300"}`}>{report.certified ? "CERTIFIED" : "NOT CERTIFIED"}</span>
            </div>
            <p className="text-sm text-zinc-300 mb-3">{report.summary}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",  value: report.totalTests,    color: "text-zinc-200" },
                { label: "Passed", value: report.passed,        color: "text-emerald-300" },
                { label: "Failed", value: report.failed,        color: "text-red-300" },
                { label: "N/C",    value: report.notConfigured, color: "text-amber-300" },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500">{m.label}</p>
                  <p className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{cat}</h3>
              {report.results.filter(r => r.category === cat).map(r => <TestRow key={r.id} result={r} />)}
            </div>
          ))}
        </>
      )}
      {!report && !loading && (
        <div className="text-center py-12 text-zinc-600">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Run Validation" to execute all EF-58.1 accuracy tests.</p>
        </div>
      )}
    </div>
  );
}

function ResolverTab() {
  const [query, setQuery] = useState("Where is ConnectionManager implemented?");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const inv = await cis.invoke("github", "repos.list", { per_page: 10 },
      { originComponent: "Phase581Page", reason: "Resolver demo" });
    if (inv.record.status !== "SUCCESS") {
      setResult({ error: "GitHub not configured or no repos found." });
      setLoading(false); return;
    }
    const repos = (inv.result?.data?.items ?? []);
    const resolved = resolver.resolve(repos, query, null);
    setResult({ resolved, repos });
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Test automatic repository resolution for any query.</p>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500" />
        <button onClick={run} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Resolve"}
        </button>
      </div>
      {result?.error && <p className="text-red-400 text-sm">{result.error}</p>}
      {result?.resolved && (
        <div className="space-y-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1">Selected Repository</p>
            <p className="text-lg font-bold text-zinc-100 font-mono">{result.resolved.owner}/{result.resolved.repo}</p>
            <p className="text-xs text-zinc-400 mt-1">{result.resolved.reason}</p>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-zinc-500">Confidence: <span className="text-zinc-300">{Math.round(result.resolved.confidence * 100)}%</span></span>
              <span className="text-xs text-zinc-500">Confirmation needed: <span className={result.resolved.needsConfirmation ? "text-amber-300" : "text-emerald-300"}>{String(result.resolved.needsConfirmation)}</span></span>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">All Candidates (ranked)</p>
            {result.resolved.candidates.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0 gap-2">
                <span className="text-sm font-mono text-zinc-300">{c.owner}/{c.repo}</span>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>Score: {c.score.toFixed(2)}</span>
                  <span className="truncate max-w-40">{c.signals.join(", ") || "no signals"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RankerTab() {
  const [query, setQuery] = useState("ConnectionManager");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    // Discover repo first
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 3 },
      { originComponent: "Phase581Page", reason: "Ranker demo" });
    let owner = null, repo = null;
    if (reposInv.record.status === "SUCCESS") {
      const items = reposInv.result?.data?.items ?? [];
      if (items.length > 0) { owner = items[0].owner; repo = items[0].name; }
    }
    if (!owner || !repo) { setResult({ error: "GitHub not configured." }); setLoading(false); return; }
    const inv = await cis.invoke("github", "search.symbol", { query, owner, repo },
      { originComponent: "Phase581Page", reason: "Search for ranking" });
    if (inv.record.status !== "SUCCESS") { setResult({ error: inv.record.error ?? "Search failed" }); setLoading(false); return; }
    const items = (inv.result?.data?.items ?? []);
    const ranked = ranker.rank(items, query);
    setResult({ ranked, total: inv.result?.data?.totalCount });
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Test search ranking — implementation files should surface first.</p>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500" placeholder="symbol or text to search" />
        <button onClick={run} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search & Rank"}
        </button>
      </div>
      {result?.error && <p className="text-red-400 text-sm">{result.error}</p>}
      {result?.ranked && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-3">GitHub found {result.total} results. Showing top ranked:</p>
          {result.ranked.slice(0, 15).map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
              <span className="text-xs text-zinc-600 w-5 shrink-0">#{i + 1}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${
                r.tier === "implementation" ? "bg-emerald-900/30 text-emerald-400" :
                r.tier === "documentation" ? "bg-zinc-800 text-zinc-500" :
                r.tier === "test" ? "bg-blue-900/30 text-blue-400" :
                "bg-zinc-800 text-zinc-400"
              }`}>{r.tier}</span>
              <span className="text-xs font-mono text-zinc-300 truncate flex-1">{r.path}</span>
              <span className="text-xs text-zinc-600 shrink-0">{r.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
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
              { label: "Certification",  value: report.certificationLevel },
              { label: "Total Calls",    value: report.totalInvocations },
              { label: "Successful",     value: report.successfulInvocations },
              { label: "Connectors",     value: report.discoveredConnectors?.length ?? 0 },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className="text-lg font-bold text-zinc-200 font-mono">{String(m.value)}</p>
              </div>
            ))}
          </div>
          {report.invocationHistory?.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-2">Recent Capability Executions</p>
              {report.invocationHistory.slice(-10).reverse().map(inv => (
                <div key={inv.id} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${inv.status === "SUCCESS" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{inv.status}</span>
                  <span className="text-xs font-mono text-zinc-400 flex-1 truncate">{inv.connectorId}.{inv.operation}</span>
                  <span className="text-xs text-zinc-600">{inv.durationMs}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Phase581Page() {
  const [tab, setTab] = useState("validation");
  const content = { validation: <ValidationTab />, resolver: <ResolverTab />, ranker: <RankerTab />, diagnostics: <DiagnosticsTab /> };
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 font-heading">Phase 5.8.1 — GitHub Engineering Accuracy</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Precision · Repository Resolution · Search Ranking · Code Intelligence</p>
      </div>
      <div className="flex gap-1 flex-wrap border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${tab === t.id ? "text-violet-300 border-violet-500 bg-violet-900/10" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>
      <div>{content[tab]}</div>
    </div>
  );
}