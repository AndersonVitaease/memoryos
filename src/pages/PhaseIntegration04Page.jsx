/**
 * PhaseIntegration04Page.jsx — Sprint INTEGRATION-04 Dashboard
 * Knowledge-Aware Connector Runtime
 * Route: /integration04
 */

import React, { useState, useMemo } from "react";
import { ConnectorKnowledgePipeline } from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import { ConnectorKnowledgeAudit }    from "@/lib/connector-runtime/integration/ConnectorKnowledgeAudit";

const RESULT_COLORS = {
  SUCCESS:  "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  BLOCKED:  "bg-red-900/40 text-red-300 border-red-800",
  FALLBACK: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  RETRIED:  "bg-orange-900/40 text-orange-300 border-orange-800",
  FAILED:   "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const RISK_COLORS = {
  CRITICAL: "text-red-400", HIGH: "text-orange-400",
  MEDIUM: "text-yellow-400", LOW: "text-sky-400", NONE: "text-zinc-500",
};

const CONF_COLORS = {
  VERY_HIGH: "text-emerald-400", HIGH: "text-sky-400",
  MEDIUM: "text-yellow-400", LOW: "text-orange-400", INSUFFICIENT: "text-red-400",
};

const CB_COLORS = {
  CLOSED: "text-emerald-400", HALF_OPEN: "text-yellow-400", OPEN: "text-red-400",
};

const TABS = [
  { id: "context",     label: "Context"      },
  { id: "knowledge",   label: "Knowledge"    },
  { id: "risks",       label: "Risks"        },
  { id: "constraints", label: "Constraints"  },
  { id: "governance",  label: "Governance"   },
  { id: "confidence",  label: "Confidence"   },
  { id: "strategy",    label: "Strategy"     },
  { id: "advisory",    label: "Advisory"     },
  { id: "report",      label: "Report"       },
  { id: "audit",       label: "Audit"        },
  { id: "metrics",     label: "Metrics"      },
];

const DEMO_REQUESTS = [
  { requestId: "REQ-001", connector: "gmail",        operation: "READ",    intent: "read emails from inbox",             provider: "google",  parameters: {}, priority: "MEDIUM",   domain: "GMAIL",           project: "MemoryOS", sprint: "INT-04", tags: ["email"]      },
  { requestId: "REQ-002", connector: "google-drive", operation: "WRITE",   intent: "upload connector runtime document",  provider: "google",  parameters: {}, priority: "HIGH",     domain: "GOOGLE_DRIVE",    project: "MemoryOS", sprint: "INT-04", tags: ["drive"]      },
  { requestId: "REQ-003", connector: "github",       operation: "READ",    intent: "fetch repository connector code",    provider: "github",  parameters: {}, priority: "MEDIUM",   domain: "GITHUB",          project: "MemoryOS", sprint: "INT-04", tags: ["github"]     },
  { requestId: "REQ-004", connector: "gmail",        operation: "SEND",    intent: "send critical security alert email", provider: "google",  parameters: {}, priority: "CRITICAL", domain: "GMAIL",           project: "MemoryOS", sprint: "INT-04", tags: ["security"]   },
  { requestId: "REQ-005", connector: "google-drive", operation: "DELETE",  intent: "delete obsolete knowledge archive",  provider: "google",  parameters: {}, priority: "HIGH",     domain: "GOOGLE_DRIVE",    project: "MemoryOS", sprint: "INT-04", tags: ["governance"] },
];

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-2 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={"text-2xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
    </div>
  );
}

function ScoreBar({ value, color = "bg-violet-600" }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-zinc-500 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex gap-3 text-sm border-b border-zinc-800 py-1.5 last:border-0">
      <span className="text-zinc-500 w-36 shrink-0">{k}</span>
      <span className="text-zinc-300">{v}</span>
    </div>
  );
}

export default function PhaseIntegration04Page() {
  const [tab,        setTab]        = useState("context");
  const [running,    setRunning]    = useState(false);
  const [results,    setResults]    = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics  = useMemo(function() { return ConnectorKnowledgePipeline.getMetrics(); }, [refreshKey]);
  const timeline = useMemo(function() { return ConnectorKnowledgeAudit.getTimeline();   }, [refreshKey]);

  function runDemo() {
    setRunning(true);
    const out = DEMO_REQUESTS.map(function(r) {
      return { label: r.requestId, result: ConnectorKnowledgePipeline.run(r) };
    });
    setResults(out);
    setSelected(out[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  const s = selected ? selected.result : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT INTEGRATION-04 — KNOWLEDGE-AWARE CONNECTOR RUNTIME</div>
          <div className="text-xl font-bold text-white">Knowledge-Aware Connector Runtime</div>
          <div className="text-zinc-400 text-sm mt-1">Every connector operation consults the Knowledge Base before executing. Risk, Governance, Strategy and Confidence are always considered.</div>
        </div>

        {/* Pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Request","Context","Provider","RiskAnalyzer","GovernanceValidator","Constraints","ConfidenceCalc","Strategy","Advisor","ConnectorRuntime","ExternalAPI","Report"].map(function(s2, i, arr) {
              return (
                <React.Fragment key={s2}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{s2}</span>
                  {i < arr.length-1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Overview metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Executions"     value={metrics.totalExecutions} />
          <Metric label="Success Rate"   value={metrics.successRate + "%"}   color="text-emerald-400" />
          <Metric label="Avg Confidence" value={Math.round(metrics.avgConfidence * 100) + "%"} color="text-sky-400" />
          <Metric label="Failure Rate"   value={metrics.failureRate + "%"}   color="text-red-400" />
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 5 Connector Requests"}
          </button>
          {results.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {results.map(function(r, i) {
                return (
                  <button key={i} onClick={function() { setSelected(r); setTab("context"); }}
                    className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selected === r ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                    {r.result.ctx.requestId}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(function(t) {
            return (
              <button key={t.id} onClick={function() { setTab(t.id); }}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {!s && tab !== "metrics" && tab !== "audit" && (
          <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
            Run demo connector requests to populate the dashboard.
          </div>
        )}

        {/* Context */}
        {s && tab === "context" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <div className="text-zinc-400 text-xs tracking-widest mb-2">CONNECTOR CONTEXT</div>
              <Row k="Request ID"  v={s.ctx.requestId} />
              <Row k="Connector"   v={s.ctx.connector} />
              <Row k="Operation"   v={s.ctx.operation} />
              <Row k="Intent"      v={s.ctx.intent} />
              <Row k="Provider"    v={s.ctx.provider} />
              <Row k="Priority"    v={s.ctx.priority} />
              <Row k="Domain"      v={s.ctx.domain} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Knowledge Used"  value={s.bundle.all.length} />
              <Metric label="Risks Found"     value={s.risk.risks.length}        color="text-orange-400" />
              <Metric label="Risk Score"      value={s.risk.riskScore}           color="text-red-400" />
              <Metric label="Duration"        value={s.durationMs + "ms"}        color="text-zinc-400" />
            </div>
          </div>
        )}

        {/* Knowledge */}
        {s && tab === "knowledge" && (
          <div className="space-y-3">
            {[
              { label: "LESSONS",       items: s.advisory.lessonsApplied,        color: "text-sky-400"     },
              { label: "BEST PRACTICES",items: s.advisory.bestPracticesApplied,  color: "text-emerald-400" },
              { label: "GOVERNANCE",    items: s.advisory.governanceApplied,     color: "text-yellow-400"  },
            ].map(function(section) {
              return (
                <div key={section.label} className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className={"px-4 py-2 border-b border-zinc-800 text-xs tracking-widest " + section.color}>
                    {section.label} — {section.items.length}
                  </div>
                  {section.items.length === 0
                    ? <div className="px-4 py-4 text-zinc-600 text-xs">None found.</div>
                    : section.items.map(function(e) {
                        return (
                          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                            <span className="text-zinc-300 text-sm flex-1">{e.title}</span>
                            <span className="text-zinc-500 text-xs">ev:{e.evidenceScore}</span>
                          </div>
                        );
                      })}
                </div>
              );
            })}
          </div>
        )}

        {/* Risks */}
        {s && tab === "risks" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Overall"    value={s.risk.overallLevel}           color={RISK_COLORS[s.risk.overallLevel]} />
              <Metric label="Risk Score" value={s.risk.riskScore}              color="text-orange-400" />
              <Metric label="Blockers"   value={s.risk.blockers.length}        color="text-red-400" />
              <Metric label="Warnings"   value={s.risk.warnings.length}        color="text-yellow-400" />
            </div>
            <div className="flex gap-3 text-xs">
              <Badge label={s.risk.retryRisk  ? "RETRY RISK"   : "NO RETRY RISK"}   style={s.risk.retryRisk  ? "bg-orange-900/40 text-orange-300 border-orange-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
              <Badge label={s.risk.timeoutRisk ? "TIMEOUT RISK" : "NO TIMEOUT RISK"} style={s.risk.timeoutRisk ? "bg-red-900/40 text-red-300 border-red-800"           : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-orange-400 tracking-widest">RISK ENTRIES — {s.risk.risks.length}</div>
              {s.risk.risks.length === 0
                ? <div className="px-4 py-4 text-zinc-600 text-xs">No risks identified.</div>
                : s.risk.risks.map(function(r) {
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <span className={"text-xs font-bold w-16 " + RISK_COLORS[r.level]}>{r.level}</span>
                        <span className="text-zinc-300 text-sm flex-1">{r.title}</span>
                        <Badge label={r.category} />
                      </div>
                    );
                  })}
            </div>
          </div>
        )}

        {/* Constraints */}
        {s && tab === "constraints" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Metric label="Max Retries"  value={s.constraints.maxRetries} />
              <Metric label="Timeout"      value={s.constraints.timeoutMs + "ms"} color="text-sky-400" />
              <Metric label="Security"     value={s.constraints.securityLevel} color={s.constraints.securityLevel === "STRICT" ? "text-red-400" : s.constraints.securityLevel === "ELEVATED" ? "text-orange-400" : "text-emerald-400"} />
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <Row k="Mandatory Logging" v={s.constraints.mandatoryLogging ? "YES" : "NO"} />
              <Row k="Requires Review"   v={s.constraints.requiresReview   ? "YES" : "NO"} />
              <Row k="Rate Limited Ops"  v={s.constraints.rateLimitedOps.length > 0 ? s.constraints.rateLimitedOps.join(", ") : "None"} />
              <Row k="Blocked Providers" v={s.constraints.blockedProviders.length > 0 ? s.constraints.blockedProviders.join(", ") : "None"} />
            </div>
          </div>
        )}

        {/* Governance */}
        {s && tab === "governance" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge label={s.governance.compliant ? "COMPLIANT" : "VIOLATIONS"} style={s.governance.compliant ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-red-900/40 text-red-300 border-red-800"} />
              <Badge label={s.governance.blocked ? "BLOCKED" : "CLEAR"}          style={s.governance.blocked   ? "bg-red-900/40 text-red-300 border-red-800"             : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">GOVERNANCE CHECKS — {s.governance.checks.length}</div>
              {s.governance.checks.length === 0
                ? <div className="px-4 py-4 text-zinc-600 text-xs">No policies matched.</div>
                : s.governance.checks.map(function(c) {
                    return (
                      <div key={c.policyId} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <div className={"w-2 h-2 rounded-full shrink-0 " + (c.compliant ? "bg-emerald-500" : "bg-red-500")} />
                        <span className="text-zinc-300 text-sm flex-1">{c.policyName}</span>
                        <Badge label={c.category} />
                        <Badge label={c.priority} />
                      </div>
                    );
                  })}
            </div>
          </div>
        )}

        {/* Confidence */}
        {s && tab === "confidence" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5 space-y-4">
            <div className="text-center">
              <div className={"text-4xl font-bold font-mono " + CONF_COLORS[s.confidence.level]}>
                {Math.round(s.confidence.score * 100)}%
              </div>
              <div className={"text-sm mt-1 " + CONF_COLORS[s.confidence.level]}>{s.confidence.level}</div>
            </div>
            <div className="space-y-3">
              {Object.entries(s.confidence.breakdown).map(function([k, v]) {
                return (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 capitalize">{k}</span>
                      <span className="text-zinc-400 font-mono">{Math.round(Number(v) * 100)}%</span>
                    </div>
                    <ScoreBar value={Number(v) / 0.35} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategy */}
        {s && tab === "strategy" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Metric label="Retry Strategy"    value={s.plan.retryStrategy}    color="text-sky-400"    />
              <Metric label="Fallback Strategy" value={s.plan.fallbackStrategy} color="text-yellow-400" />
              <Metric label="Circuit Breaker"   value={s.plan.circuitBreaker}   color={CB_COLORS[s.plan.circuitBreaker]} />
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <Row k="Max Retries"      v={s.plan.maxRetries} />
              <Row k="Retry Delay"      v={s.plan.retryDelayMs + "ms"} />
              <Row k="Timeout"          v={s.plan.timeoutMs + "ms"} />
              <Row k="Provider Priority"v={s.plan.providerPriority.join(" → ")} />
              <Row k="Execution Order"  v={s.plan.executionOrder.join(" → ")} />
              <Row k="Recovery"         v={s.plan.recoveryStrategy} />
            </div>
          </div>
        )}

        {/* Advisory */}
        {s && tab === "advisory" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <div className="text-zinc-400 text-xs tracking-widest mb-3">EXECUTION ADVISORY</div>
              <div className="flex items-center gap-3 mb-3">
                <Badge label={s.advisory.proceed ? "PROCEED" : "BLOCKED"} style={s.advisory.proceed ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-red-900/40 text-red-300 border-red-800"} />
                <span className="text-zinc-400 text-sm">{s.advisory.reason}</span>
              </div>
              <Row k="Connector" v={s.advisory.recommendedConnector} />
              <Row k="Alt Provider" v={s.advisory.alternativeProvider || "None"} />
              <Row k="Retry" v={s.advisory.retryStrategy} />
              <Row k="Fallback" v={s.advisory.fallbackStrategy} />
            </div>
          </div>
        )}

        {/* Report */}
        {s && tab === "report" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Badge label={s.report.result} style={RESULT_COLORS[s.report.result]} />
              <span className="text-zinc-500 text-xs">{s.report.reportId}</span>
            </div>
            <Row k="Connector"        v={s.report.connector} />
            <Row k="Provider"         v={s.report.provider} />
            <Row k="Operation"        v={s.report.operation} />
            <Row k="Knowledge Used"   v={s.report.knowledgeUsed} />
            <Row k="Governance Used"  v={s.report.governanceUsed} />
            <Row k="Strategy Used"    v={s.report.strategyUsed} />
            <Row k="Fallback Used"    v={s.report.fallbackUsed ? "YES" : "NO"} />
            <Row k="Retries Used"     v={s.report.retriesUsed} />
            <Row k="Timeout (ms)"     v={s.report.timeoutMs} />
            <Row k="Risk Level"       v={s.report.riskLevel} />
            <Row k="Confidence"       v={Math.round(s.report.confidence * 100) + "%"} />
            <Row k="Duration"         v={s.report.durationMs + "ms"} />
          </div>
        )}

        {/* Audit */}
        {tab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              CONNECTOR KNOWLEDGE AUDIT — {timeline.length}
            </div>
            {timeline.length === 0
              ? <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo requests first.</div>
              : timeline.map(function(e) {
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 text-xs flex-wrap">
                      <span className="text-zinc-600 w-20 shrink-0">{e.id}</span>
                      <span className="text-violet-300 w-20 shrink-0">{e.requestId}</span>
                      <span className="text-zinc-400 w-24 shrink-0">{e.connector}</span>
                      <span className="text-zinc-500 flex-1">{e.operation}</span>
                      <Badge label={e.result} style={RESULT_COLORS[e.result]} />
                      <span className="text-sky-400">{Math.round(e.confidence * 100)}%</span>
                      <span className="text-orange-400">{e.risks}R</span>
                      <span className="text-zinc-500">{e.durationMs}ms</span>
                    </div>
                  );
                })}
          </div>
        )}

        {/* Metrics */}
        {tab === "metrics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total Executions" value={metrics.totalExecutions} />
              <Metric label="Success Rate"     value={metrics.successRate + "%"}             color="text-emerald-400" />
              <Metric label="Failure Rate"     value={metrics.failureRate + "%"}             color="text-red-400" />
              <Metric label="Avg Confidence"   value={Math.round(metrics.avgConfidence * 100) + "%"} color="text-sky-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Avg Duration"     value={metrics.avgDurationMs + "ms"}         color="text-zinc-400" />
              <Metric label="Avg Risks"        value={metrics.avgRisks}                     color="text-orange-400" />
              <Metric label="Fallback Usage"   value={metrics.fallbackUsage}                color="text-yellow-400" />
              <Metric label="Retry Usage"      value={metrics.retryUsage}                   color="text-violet-400" />
            </div>
            {Object.keys(metrics.resultBreakdown).length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">RESULT BREAKDOWN</div>
                {Object.entries(metrics.resultBreakdown).map(function([r, c]) {
                  return (
                    <div key={r} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <Badge label={r} style={RESULT_COLORS[r] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                      <span className="flex-1" />
                      <span className="text-violet-400 font-mono text-xs">{c}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {Object.keys(metrics.connectorBreakdown).length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">CONNECTOR BREAKDOWN</div>
                {Object.entries(metrics.connectorBreakdown).map(function([c, n]) {
                  return (
                    <div key={c} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <span className="text-zinc-300 text-sm flex-1">{c}</span>
                      <span className="text-violet-400 font-mono text-xs">{n}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {metrics.totalExecutions === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">Run demo requests to generate metrics.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}