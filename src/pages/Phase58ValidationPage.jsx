import React, { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { EF58ValidationSuite } from "@/lib/github-deep-analysis/ef58Tests";

const suite = new EF58ValidationSuite();

const STATUS_STYLES = {
  PASS:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:           "bg-red-900/40 text-red-300 border-red-700",
  NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
  SKIP:           "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_ICON = {
  PASS:           <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
  FAIL:           <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
  NOT_CONFIGURED: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  SKIP:           <AlertTriangle className="w-4 h-4 text-zinc-500 shrink-0" />,
};

function TestRow({ result }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition text-left"
      >
        {STATUS_ICON[result.status]}
        <span className="flex-1 text-sm text-zinc-200 font-medium">{result.name}</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${STATUS_STYLES[result.status]}`}>{result.status}</span>
        <span className="text-xs text-zinc-600 ml-2">{result.durationMs}ms</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-zinc-950 text-xs space-y-1">
          <p className="text-zinc-500">ID: <span className="font-mono text-zinc-400">{result.id}</span> · Category: <span className="text-zinc-400">{result.category}</span></p>
          {result.evidence.length > 0 && (
            <div>
              <p className="text-zinc-500 mb-1">Evidence:</p>
              {result.evidence.map((e, i) => <p key={i} className="text-zinc-400 ml-2">• {e}</p>)}
            </div>
          )}
          {result.error && <p className="text-red-400 font-mono">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

export default function Phase58ValidationPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setReport(null);
    try {
      const r = await suite.run();
      setReport(r);
    } finally {
      setLoading(false);
    }
  };

  const categories = report
    ? [...new Set(report.results.map(r => r.category))]
    : [];

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100 font-heading">EF-58.13 — Engineering Validation Suite</h1>
          </div>
          <p className="text-sm text-zinc-500 ml-11">Phase 5.8.0 · All tests execute against live GitHub connector</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? "Running..." : "Run Validation"}
        </button>
      </div>

      {/* Summary */}
      {report && (
        <div className={`rounded-xl border p-4 ${report.certified ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-800"}`}>
          <div className="flex items-center gap-2 mb-2">
            {report.certified
              ? <CheckCircle className="w-5 h-5 text-emerald-400" />
              : <XCircle className="w-5 h-5 text-red-400" />}
            <span className={`font-bold text-base ${report.certified ? "text-emerald-300" : "text-red-300"}`}>
              {report.certified ? "CERTIFIED" : "NOT CERTIFIED"}
            </span>
          </div>
          <p className="text-sm text-zinc-300 mb-3">{report.summary}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total",          value: report.totalTests,    color: "text-zinc-200" },
              { label: "Passed",         value: report.passed,        color: "text-emerald-300" },
              { label: "Failed",         value: report.failed,        color: "text-red-300" },
              { label: "Not Configured", value: report.notConfigured, color: "text-amber-300" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-3">{report.durationMs}ms total · {new Date(report.generatedAt).toLocaleTimeString()}</p>
        </div>
      )}

      {/* Results by category */}
      {report && categories.map(cat => (
        <div key={cat} className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">{cat}</h2>
          {report.results.filter(r => r.category === cat).map(result => (
            <TestRow key={result.id} result={result} />
          ))}
        </div>
      ))}

      {!report && !loading && (
        <div className="text-center py-16 text-zinc-600">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Run Validation" to execute all EF-58 tests against the live GitHub connector.</p>
        </div>
      )}
    </div>
  );
}