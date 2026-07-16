/**
 * ArchitectureGovernancePanel.jsx — Sprint 8.5
 * Dashboard widget for /connections page.
 * Displays the Architecture Governance Engine results in real time.
 */

import { useState, useCallback } from "react";
import { Shield, CheckCircle, XCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const COMPONENT_ICONS = {
  "Official Bootstrap":  "🔧",
  "Official Registry":   "📋",
  "Official IConnector": "🔌",
  "Official Router":     "🔀",
  "Official Executor":   "⚡",
  "Official Runtime":    "🧠",
  "Official Pipeline":   "🔗",
};

function StatusBadge({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">{label ?? "PASS"}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">{label ?? "FAIL"}</span>;
}

function ScoreRing({ score }) {
  const color = score === 100 ? "text-emerald-400" : score >= 80 ? "text-amber-400" : "text-red-400";
  return (
    <div className={`text-4xl font-bold font-mono ${color}`}>
      {score}<span className="text-lg text-muted-foreground">/100</span>
    </div>
  );
}

export default function ArchitectureGovernancePanel() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const { runArchitectureGovernance } = await import("@/lib/architecture-governance/ArchitectureGovernanceEngine");
      const r = await runArchitectureGovernance();
      setResult(r);
    } catch (e) {
      setResult({ certified: false, score: 0, violations: [{ ruleId: "ERR", description: e.message, severity: "CRITICAL" }], warnings: [], report: { components: [], ruleResults: [], verdict: `Error: ${e.message}` } });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-foreground">Architecture Governance Engine</span>
          <span className="text-xs text-muted-foreground">AGE v1.0 · Sprint 8.5</span>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning…" : result ? "Re-scan" : "Run Scan"}
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {!result && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click <strong>Run Scan</strong> to audit the architecture in real time.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-violet-500/40 border-t-violet-400 rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Scanning {10} architecture rules…</span>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Score + certified */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Architecture Score</p>
                <ScoreRing score={result.score} />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Certified</p>
                {result.certified
                  ? <div className="flex items-center gap-1.5 text-emerald-400"><CheckCircle className="w-5 h-5" /><span className="font-semibold">TRUE</span></div>
                  : <div className="flex items-center gap-1.5 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">FALSE</span></div>
                }
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/20 p-2 text-center">
                <p className="text-xs text-muted-foreground">Violations</p>
                <p className={`text-lg font-bold ${result.violations.length === 0 ? "text-emerald-400" : "text-red-400"}`}>{result.violations.length}</p>
              </div>
              <div className="rounded-lg bg-muted/20 p-2 text-center">
                <p className="text-xs text-muted-foreground">Warnings</p>
                <p className={`text-lg font-bold ${result.warnings.length === 0 ? "text-emerald-400" : "text-amber-400"}`}>{result.warnings.length}</p>
              </div>
              <div className="rounded-lg bg-muted/20 p-2 text-center">
                <p className="text-xs text-muted-foreground">Rules</p>
                <p className="text-lg font-bold text-foreground">{result.report.passedRules ?? result.report.ruleResults?.filter(r=>r.passed).length ?? 0}/{result.report.totalRules ?? result.report.ruleResults?.length ?? 0}</p>
              </div>
            </div>

            {/* Components grid */}
            {result.report.components?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Components</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {result.report.components.map(c => (
                    <div key={c.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/30">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{COMPONENT_ICONS[c.name] ?? "🔹"}</span>
                        <span className="text-xs text-foreground">{c.name}</span>
                        {c.singleton !== undefined && (
                          <span className="text-xs text-muted-foreground">(singleton: {c.singleton ? "✓" : "✗"})</span>
                        )}
                      </div>
                      <StatusBadge ok={c.official} label={c.official ? "OFFICIAL" : "MISSING"} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Violations */}
            {result.violations.length > 0 && (
              <div>
                <p className="text-xs text-red-400 mb-2 font-medium">⚠ Violations</p>
                <div className="space-y-2">
                  {result.violations.map((v, i) => (
                    <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-red-400">{v.ruleId}</span>
                        <span className="text-xs text-muted-foreground">{v.severity}</span>
                      </div>
                      <p className="text-xs text-foreground">{v.description}</p>
                      {v.file && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{v.file}</p>}
                      {v.recommendation && <p className="text-xs text-amber-400 mt-1">→ {v.recommendation}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rule-by-rule details toggle */}
            {result.report.ruleResults?.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRules(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                >
                  {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showRules ? "Hide" : "Show"} rule details ({result.report.ruleResults.length} rules)
                </button>
                {showRules && (
                  <div className="mt-2 space-y-1">
                    {result.report.ruleResults.map(r => (
                      <div key={r.ruleId} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-muted/10">
                        {r.passed
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        }
                        <div className="min-w-0">
                          <p className="text-xs text-foreground"><span className="font-mono text-violet-400">{r.ruleId}</span> — {r.ruleName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.evidence}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{r.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Verdict */}
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${result.certified ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {result.report.verdict}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}