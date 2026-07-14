/**
 * Phase642aPage.jsx
 * Sprint 6.4.2A — Google Workspace Qualification & Platform Validation
 * Google Qualification Center Dashboard
 */

import React, { useState, useMemo } from "react";
import {
  Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Shield, Activity, RefreshCw, Zap, Globe, Award,
  BarChart2, Eye, GitBranch, Layers,
} from "lucide-react";
import { runCertificationEngine } from "@/lib/connectors/google-workspace/qualification/CertificationEngine";

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const map = {
    green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    red:    "bg-red-100 text-red-700 border-red-200",
    amber:  "bg-amber-100 text-amber-700 border-amber-200",
    blue:   "bg-blue-100 text-blue-700 border-blue-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    sky:    "bg-sky-100 text-sky-700 border-sky-200",
    zinc:   "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${map[color] ?? map.zinc}`}>{label}</span>;
}

function statusColor(status) {
  if (status === 'pass') return 'green';
  if (status === 'fail') return 'red';
  if (status === 'warn') return 'amber';
  return 'zinc';
}

function StatCard({ label, value, sub, icon: Icon, color = "zinc" }) {
  const b = { green: "border-emerald-200", red: "border-red-200", sky: "border-sky-200", violet: "border-violet-200", zinc: "border-zinc-200", amber: "border-amber-200" };
  return (
    <div className={`bg-white border rounded-xl p-4 ${b[color] ?? b.zinc}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400" />}
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900 font-heading">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TestRow({ result }) {
  const passed = result.status === 'pass';
  const warned  = result.status === 'warn';
  return (
    <div className={`flex items-start gap-2 py-2 px-3 rounded-lg text-sm border ${
      passed ? "bg-emerald-50/50 border-emerald-100" :
      warned  ? "bg-amber-50/50 border-amber-100" :
      "bg-red-50/50 border-red-100"
    }`}>
      {passed  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> :
       warned   ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> :
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-zinc-700">{result.name}</span>
        {result.error && <p className="text-xs text-red-600 mt-0.5">{result.error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge label={result.category} color="sky" />
        <span className="text-xs text-zinc-400">{result.durationMs}ms</span>
      </div>
    </div>
  );
}

function DomainBar({ domain }) {
  const pct = Math.round((domain.score / domain.maxScore) * 100);
  const col = pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 capitalize">{domain.domain}</span>
        <span className={`font-bold ${pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{domain.score}/{domain.maxScore}</span>
      </div>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${col}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-zinc-400">{domain.passed}/{domain.total} tests</div>
    </div>
  );
}

function SuiteCard({ suite }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((suite.passed / suite.total) * 100);
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50 transition">
        <div className={`w-2 h-2 rounded-full shrink-0 ${suite.failed > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-800 capitalize">{suite.name}</p>
          <p className="text-xs text-zinc-400">{suite.passed}/{suite.total} passed · {suite.durationMs}ms</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={`${pct}%`} color={pct === 100 ? 'green' : pct >= 80 ? 'amber' : 'red'} />
          <span className="text-xs text-zinc-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-100 p-3 space-y-1.5 max-h-72 overflow-y-auto">
          {suite.results.map((r, i) => <TestRow key={i} result={r} />)}
        </div>
      )}
    </div>
  );
}

// ─── Cert Badge ───────────────────────────────────────────────────────────────

function CertBadge({ report }) {
  if (!report) return null;
  return (
    <div className={`rounded-2xl p-6 text-center border-2 ${report.certified ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-300'}`}>
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${report.certified ? 'bg-emerald-500' : 'bg-red-400'}`}>
        {report.certified ? <Award className="w-8 h-8 text-white" /> : <XCircle className="w-8 h-8 text-white" />}
      </div>
      <p className={`text-lg font-bold font-heading ${report.certified ? 'text-emerald-700' : 'text-red-700'}`}>{report.badge}</p>
      <p className="text-xs text-zinc-500 mt-1">Google Workspace Reference Connector v{report.version}</p>
      <div className={`text-4xl font-black mt-3 ${report.certified ? 'text-emerald-600' : 'text-red-500'}`}>{report.overall}<span className="text-lg font-normal">/100</span></div>
      <p className="text-xs text-zinc-400 mt-1">Generated {new Date(report.generatedAt).toLocaleString()}</p>
    </div>
  );
}

// ─── Perf Table ──────────────────────────────────────────────────────────────

function PerfTable({ results }) {
  const stressResults = results.filter((r) => r.category === 'stress' && r.status === 'pass' && r.metadata);
  if (stressResults.length === 0) return <div className="text-center py-6 text-zinc-400 text-sm">Execute a qualificação para ver métricas.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left py-2 pr-3 text-zinc-400 font-medium">Test</th>
            <th className="text-right py-2 px-3 text-zinc-400 font-medium">Avg (ms)</th>
            <th className="text-right py-2 px-3 text-zinc-400 font-medium">P95 (ms)</th>
            <th className="text-right py-2 px-3 text-zinc-400 font-medium">P99 (ms)</th>
            <th className="text-right py-2 px-3 text-zinc-400 font-medium">Throughput</th>
            <th className="text-right py-2 px-3 text-zinc-400 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {stressResults.map((r, i) => (
            <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50">
              <td className="py-2 pr-3 font-medium text-zinc-700">{r.id}</td>
              <td className="text-right py-2 px-3 text-zinc-600">{r.metadata?.latencyMs ?? '—'}</td>
              <td className="text-right py-2 px-3 text-zinc-600">{r.metadata?.p95LatencyMs ?? '—'}</td>
              <td className="text-right py-2 px-3 text-zinc-600">{r.metadata?.p99LatencyMs ?? '—'}</td>
              <td className="text-right py-2 px-3 text-zinc-600">{r.metadata?.throughput ?? '—'} ops/s</td>
              <td className={`text-right py-2 px-3 font-medium ${(r.metadata?.errors ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{r.metadata?.errors ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ["overview", "certification", "domains", "suites", "performance", "audit"];
const TAB_LABEL = { overview: "Overview", certification: "Certificação", domains: "Domínios", suites: "Test Suites", performance: "Performance", audit: "Auditoria" };

export default function Phase642aPage() {
  const [tab, setTab]         = useState("overview");
  const [running, setRunning] = useState(false);
  const [report, setReport]   = useState(null);

  async function handleRun() {
    setRunning(true);
    setReport(null);
    try {
      const r = await runCertificationEngine();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }

  const allResults = report?.auditTrail ?? [];
  const totalPassed = allResults.filter((r) => r.status === 'pass').length;
  const totalFailed = allResults.filter((r) => r.status === 'fail').length;
  const totalWarn   = allResults.filter((r) => r.status === 'warn').length;
  const pct         = allResults.length > 0 ? Math.round((totalPassed / allResults.length) * 100) : 0;

  const CHECKLIST = [
    "3 contas Google funcionando simultaneamente",
    "Gmail, Calendar e Drive compartilham exatamente a mesma infraestrutura",
    "Refresh automático funcionando (OA-Q-05 / OA-Q-06)",
    "Recuperação automática funcionando (FI-Q-01 / OA-Q-09)",
    "Falhas simuladas recuperadas (FI-Q-01..05)",
    "Connector Runtime permanece íntegro após stress de 300 ops (ST-Q-06)",
    "Engineering Workflow registra todas as operações (ENG-Q-01..04)",
    "Engineering Memory registra todas as operações (ENG-Q-01..04)",
    "Audit registra todas as operações (ENG-Q-01..03)",
    "Operations Center exibe todas as métricas (ENG-Q-04)",
    "Fan-out paralelo em todos os serviços (MC-Q-03..08)",
    "Multi-tenant: org · workspace · account · connection isolados (ID-Q-03)",
    "Certification Engine emitiu score ≥ 90",
    `Badge: ${report?.badge ?? "(execute a qualificação)"}`,
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 6.4.2A — Google Workspace Qualification</h1>
            <p className="text-xs text-zinc-400">OAuth · Multi-Connection · Stress · Failure Injection · Certification Engine</p>
          </div>
        </div>
        <button onClick={handleRun} disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Qualificando..." : "Executar Qualificação"}
        </button>
      </div>

      {/* Loading */}
      {running && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-6 mb-4 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-sm font-medium text-sky-700">Executando qualificação completa...</p>
          <p className="text-xs text-sky-500">OAuth · Multi-Connection · Stress · Failure Injection · Runtime · Identity · Certification</p>
        </div>
      )}

      {/* Summary stats */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard label="Score"    value={`${report.overall}/100`} color={report.certified ? "green" : "amber"} icon={Award} />
          <StatCard label="Total"    value={allResults.length}     icon={Activity} />
          <StatCard label="Passou"   value={totalPassed}           icon={CheckCircle2} color="green" />
          <StatCard label="Falhou"   value={totalFailed}           icon={XCircle}     color={totalFailed > 0 ? "red" : "zinc"} />
          <StatCard label="Certif."  value={report.certified ? "SIM" : "NÃO"} color={report.certified ? "green" : "red"} icon={Shield} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-100 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${tab === t ? "border-emerald-500 text-emerald-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!report && !running && (
        <div className="text-center py-16 text-zinc-400">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Executar Qualificação" para iniciar a certificação completa do Google Workspace Connector.</p>
        </div>
      )}

      {report && (
        <>
          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CertBadge report={report} />
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-zinc-800 mb-3">Resumo</h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">{report.summary}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-zinc-400">Conector:</span> <span className="font-medium text-zinc-700">{report.connectorId}</span></div>
                    <div><span className="text-zinc-400">Versão:</span> <span className="font-medium text-zinc-700">{report.version}</span></div>
                    <div><span className="text-zinc-400">Score:</span> <span className={`font-bold ${report.certified ? 'text-emerald-600' : 'text-red-500'}`}>{report.overall}/100</span></div>
                    <div><span className="text-zinc-400">Badge:</span> <span className="font-medium text-zinc-700">{report.badge}</span></div>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />Checklist de Aprovação
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                  {CHECKLIST.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-zinc-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Certification ── */}
          {tab === "certification" && (
            <div className="space-y-4">
              <CertBadge report={report} />
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-4">Qualification Suite Summary</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {[
                    { label: "OAuth Qualification",           cat: "oauth",            icon: Shield },
                    { label: "Multi-Connection Qualification", cat: "multi-connection", icon: GitBranch },
                    { label: "Stress + Failure Injection",    cat: "stress",           icon: Zap },
                    { label: "Runtime + Identity + Eng.",     cat: "runtime",          icon: Activity },
                  ].map((s) => {
                    const r = allResults.filter((x) => x.category === s.cat);
                    const p = r.filter((x) => x.status === 'pass').length;
                    const pct2 = r.length > 0 ? Math.round((p / r.length) * 100) : 0;
                    const Icon = s.icon;
                    return (
                      <div key={s.cat} className={`flex items-center gap-3 p-3 rounded-xl border ${pct2 === 100 ? 'bg-emerald-50 border-emerald-200' : pct2 >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                        <Icon className={`w-5 h-5 shrink-0 ${pct2 === 100 ? 'text-emerald-500' : pct2 >= 80 ? 'text-amber-500' : 'text-red-500'}`} />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-zinc-800">{s.label}</p>
                          <p className="text-xs text-zinc-400">{p}/{r.length} tests · {pct2}%</p>
                        </div>
                        <Badge label={pct2 === 100 ? 'PASS' : pct2 >= 80 ? 'WARN' : 'FAIL'} color={pct2 === 100 ? 'green' : pct2 >= 80 ? 'amber' : 'red'} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Domains ── */}
          {tab === "domains" && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-5">
              <h3 className="text-sm font-semibold text-zinc-800">Domain Scores</h3>
              {report.domains.map((d) => <DomainBar key={d.domain} domain={d} />)}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Overall score</span>
                <span className={`text-lg font-bold ${report.certified ? 'text-emerald-600' : 'text-amber-600'}`}>{report.overall}/100</span>
              </div>
            </div>
          )}

          {/* ── Test Suites ── */}
          {tab === "suites" && (
            <div className="space-y-3">
              {report.suites.map((s, i) => <SuiteCard key={i} suite={s} />)}
            </div>
          )}

          {/* ── Performance ── */}
          {tab === "performance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: "100 Gmail Reads",    id: "ST-Q-01" },
                  { label: "100 Drive Searches", id: "ST-Q-02" },
                  { label: "100 Calendar Queries",id: "ST-Q-03" },
                  { label: "50 Drive Uploads",   id: "ST-Q-04" },
                  { label: "50 Drive Downloads", id: "ST-Q-05" },
                  { label: "300 Mixed Ops",      id: "ST-Q-06" },
                ].map((item) => {
                  const r = allResults.find((x) => x.id === item.id);
                  return (
                    <div key={item.id} className={`bg-white border rounded-xl p-3 ${r?.status === 'pass' ? 'border-zinc-200' : 'border-red-200'}`}>
                      <p className="text-xs font-semibold text-zinc-700">{item.label}</p>
                      <p className="text-xs text-zinc-400">{item.id}</p>
                      {r?.metadata && (
                        <div className="mt-2 space-y-0.5 text-xs text-zinc-500">
                          <div>avg: <span className="font-medium text-zinc-700">{r.metadata.latencyMs}ms</span></div>
                          <div>p95: <span className="font-medium">{r.metadata.p95LatencyMs}ms</span></div>
                          <div>errors: <span className={r.metadata.errors > 0 ? "text-red-500 font-medium" : "text-emerald-500 font-medium"}>{r.metadata.errors}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Performance Detail</h3>
                <PerfTable results={allResults} />
              </div>
            </div>
          )}

          {/* ── Audit ── */}
          {tab === "audit" && (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {allResults.map((r, i) => <TestRow key={i} result={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}