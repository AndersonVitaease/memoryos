import React, { useState, useCallback } from "react";
import { runAllTests } from "@/lib/wme/tests/wme.test";
import { aggregate, runAggregatorTests } from "@/lib/review/ReviewAggregator";
import {
  SPRINT1_COMPLIANCE, SPRINT1_FINDINGS, SPRINT1_PLACEHOLDERS,
  SPRINT1_ABSTRACTIONS, SPRINT1_QUALITY,
} from "@/lib/review/sprint1Metadata";
import {
  CheckCircle, XCircle, AlertTriangle, Shield, BarChart2,
  FileText, Clock, Play, RotateCcw, ChevronDown, ChevronRight,
  Layers, Zap, Lock, TrendingUp, Box, AlertCircle, FlaskConical,
} from "lucide-react";

// ─── Pure UI primitives (no data logic) ───────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const cls = {
    green:  "bg-green-900/40 text-green-300 border-green-700",
    red:    "bg-red-900/40 text-red-300 border-red-700",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700",
    blue:   "bg-blue-900/40 text-blue-300 border-blue-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cls[color] ?? cls.zinc}`}>{label}</span>;
}

function Section({ title, icon: Icon, iconColor = "text-violet-400", children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Icon size={14} className={iconColor} />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
      {sub && <div className="text-xs text-zinc-600">{sub}</div>}
    </div>
  );
}

function GateCard({ label, icon: Icon, status, children }) {
  const approved = status === "APPROVED" || status === "CERTIFIED";
  const border   = approved ? "border-green-800" : status === "PENDING" ? "border-zinc-800" : "border-red-800";
  const badgeColor = approved ? "green" : status === "PENDING" ? "zinc" : "red";
  return (
    <div className={`bg-zinc-900 border ${border} rounded-xl overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-zinc-300">{label}</span>
        </div>
        <Badge label={status ?? "PENDING"} color={badgeColor} />
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ─── Tab panels — receive only report data ────────────────────────────────────

function PipelineTab({ report, running }) {
  if (running) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <RotateCcw size={28} className="text-violet-400 animate-spin mx-auto mb-3" />
      <p className="text-zinc-400 text-sm">Executando pipeline...</p>
    </div>
  );
  if (!report) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Play size={28} className="text-blue-400 mx-auto mb-3" />
      <p className="text-zinc-300 font-semibold">Pipeline não executado</p>
      <p className="text-zinc-500 text-sm mt-1">Clique em "Executar Revisão" para rodar MRI → MQCCS → MERS → MADS</p>
    </div>
  );

  const { mri, mqccs, mers, mads } = report;
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${report.status === "APPROVED" ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
        {report.status === "APPROVED"
          ? <CheckCircle size={22} className="text-green-400 shrink-0" />
          : <XCircle size={22} className="text-red-400 shrink-0" />}
        <div>
          <p className={`font-bold text-sm ${report.status === "APPROVED" ? "text-green-300" : "text-red-300"}`}>
            {report.status === "APPROVED" ? "Todos os gates aprovados ✓" : "Um ou mais gates reprovados"}
          </p>
          <p className="text-zinc-400 text-xs mt-0.5">
            {mri.passed}/{mri.total} testes · {mri.totalDurationMs.toFixed(1)}ms total · avg {mri.avgDurationMs.toFixed(2)}ms
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GateCard label="MRI — Reference Implementation" icon={Shield} status={mri.status}>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Passou" value={mri.passed} />
            <Metric label="Total"  value={mri.total} />
            <Metric label="Rate"   value={`${mri.passRate.toFixed(0)}%`} />
          </div>
        </GateCard>

        <GateCard label="MQCCS — Certification" icon={FileText} status={mqccs.status}>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Cobertura" value={`${mqccs.coverage.toFixed(0)}%`} />
            <Metric label="Nível"     value={mqccs.level} />
            <Metric label="Gate"      value={mqccs.status === "CERTIFIED" ? "✓" : "✗"} />
          </div>
        </GateCard>

        <GateCard label="MERS — Engineering Review" icon={BarChart2} status={mers.status}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label="Arq."    value={mers.architectureScore} />
            <Metric label="Seg."    value={mers.securityScore} />
            <Metric label="Perf."   value={mers.performanceScore} />
            <Metric label="Overall" value={mers.overallScore} />
          </div>
        </GateCard>

        <GateCard label="MADS — Drift & Sustainability" icon={Clock} status={mads.status}>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Critical" value={mads.criticalDrift} sub="drift" />
            <Metric label="High"     value={mads.highDrift}     sub="drift" />
            <Metric label="Dívida"   value={mads.technicalDebt} sub="itens" />
          </div>
        </GateCard>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
          <span className="text-xs font-semibold text-zinc-300">Resultados Individuais</span>
          <span className="text-xs text-zinc-500">{mri.passed}/{mri.total}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {mri.tests.map(t => (
            <div key={t.name} className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
              {t.passed ? <CheckCircle size={11} className="text-green-400 shrink-0" /> : <XCircle size={11} className="text-red-400 shrink-0" />}
              <span className="text-xs text-zinc-300 flex-1">{t.name}</span>
              <span className="text-xs text-zinc-600 font-mono">{t.durationMs.toFixed(2)}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FoundationTab({ report }) {
  if (!report) return <EmptyState />;
  const STATUS_ICON = {
    ok:   <CheckCircle size={13} className="text-green-400 shrink-0" />,
    warn: <AlertTriangle size={13} className="text-yellow-400 shrink-0" />,
    fail: <XCircle size={13} className="text-red-400 shrink-0" />,
  };
  const STATUS_LABEL = { ok: "✓ Pronto", warn: "⚠ Melhorar", fail: "✗ Bloqueador" };
  const STATUS_COLOR = { ok: "text-green-400", warn: "text-yellow-400", fail: "text-red-400" };
  const iconMap = { "Foundation v1.0 Compliance": Shield, "MREM — Runtime Execution Model": Zap, "MPAR — Public API Reference": FileText };
  const colorMap = { "Foundation v1.0 Compliance": "text-violet-400", "MREM — Runtime Execution Model": "text-orange-400", "MPAR — Public API Reference": "text-blue-400" };

  return (
    <div className="space-y-4">
      {report.compliance.map(section => (
        <Section key={section.title} title={section.title} icon={iconMap[section.title] ?? Shield} iconColor={colorMap[section.title] ?? "text-violet-400"}>
          {section.items.map(c => (
            <div key={c.item} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
              {STATUS_ICON[c.status]}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-200">{c.item}</span>
                {c.note && <span className="text-xs text-zinc-600 ml-2">— {c.note}</span>}
              </div>
              <span className={`text-xs shrink-0 ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

function ArchitectureTab({ report }) {
  const [open, setOpen] = useState({});
  if (!report) return <EmptyState />;
  const sev = { low: "text-zinc-500", medium: "text-yellow-400", high: "text-red-400", critical: "text-red-500" };
  return (
    <Section title="Análise de Arquitetura — Findings" icon={Layers} iconColor="text-yellow-400">
      <div className="mb-3 flex flex-wrap gap-2">
        {["low","medium","high"].map(s => {
          const count = report.findings.filter(f => f.severity === s).length;
          const colors = { low: "zinc", medium: "yellow", high: "red" };
          return <Badge key={s} label={`${count} ${s.toUpperCase()}`} color={colors[s]} />;
        })}
      </div>
      {report.findings.map(f => (
        <div key={f.title} className="border-b border-zinc-800/40 last:border-0">
          <button onClick={() => setOpen(o => ({ ...o, [f.title]: !o[f.title] }))}
            className="w-full flex items-start gap-2 py-2 hover:bg-zinc-800/20 text-left">
            <AlertCircle size={13} className={`mt-0.5 shrink-0 ${sev[f.severity]}`} />
            <span className="text-xs text-zinc-200 flex-1">{f.title}</span>
            <span className={`text-xs font-mono uppercase shrink-0 ${sev[f.severity]}`}>{f.severity}</span>
            {open[f.title] ? <ChevronDown size={10} className="text-zinc-600 mt-0.5" /> : <ChevronRight size={10} className="text-zinc-600 mt-0.5" />}
          </button>
          {open[f.title] && (
            <div className="pl-5 pb-2 space-y-1">
              <p className="text-xs text-zinc-400">{f.detail}</p>
              <p className="text-xs text-zinc-500">→ {f.recommendation}</p>
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

function PlaceholdersTab({ report }) {
  if (!report) return <EmptyState />;
  return (
    <div className="space-y-3">
      {report.placeholders.map(p => (
        <div key={p.item} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-200">{p.item}</span>
            <Badge label={p.targetSprint} color="violet" />
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-2 text-xs"><span className="text-zinc-500 shrink-0 w-20">Por que:</span><span className="text-zinc-300">{p.why}</span></div>
            <div className="flex gap-2 text-xs"><span className="text-zinc-500 shrink-0 w-20">Impacto:</span><span className="text-yellow-300">{p.impact}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AbstractionsTab({ report }) {
  if (!report) return <EmptyState />;
  return (
    <div className="space-y-3">
      {report.abstractions.map(a => (
        <div key={a.name} className={`bg-zinc-900 border rounded-xl p-4 ${a.recommended ? "border-violet-800/50" : "border-zinc-800"}`}>
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-200">{a.name}</span>
            <div className="flex gap-2">
              <Badge label={a.recommended ? "RECOMENDADO" : "NÃO AGORA"} color={a.recommended ? "violet" : "zinc"} />
              <Badge label={a.targetSprint} color="zinc" />
            </div>
          </div>
          <div className="text-xs font-mono text-zinc-500 bg-zinc-800/50 rounded px-3 py-1.5 mb-2">{a.interface}</div>
          <p className="text-xs text-zinc-400">{a.reason}</p>
        </div>
      ))}
    </div>
  );
}

function QualityTab({ report }) {
  if (!report) return <EmptyState />;
  const { quality } = report;
  const dimColor = { green: "text-green-400", yellow: "text-yellow-400", red: "text-red-400", blue: "text-blue-400", zinc: "text-zinc-400" };
  const riskColor = { LOW: "text-zinc-500", MEDIUM: "text-yellow-400", HIGH: "text-red-400", CRITICAL: "text-red-500" };
  return (
    <div className="space-y-4">
      <Section title="Pontos Fortes" icon={CheckCircle} iconColor="text-green-400">
        <ul className="space-y-1.5">{quality.strengths.map(s => (
          <li key={s} className="flex gap-2 text-xs text-zinc-300"><CheckCircle size={11} className="text-green-400 mt-0.5 shrink-0" />{s}</li>
        ))}</ul>
      </Section>
      <Section title="Pontos de Atenção" icon={AlertTriangle} iconColor="text-yellow-400">
        <ul className="space-y-1.5">{quality.concerns.map(c => (
          <li key={c} className="flex gap-2 text-xs text-zinc-300"><AlertTriangle size={11} className="text-yellow-400 mt-0.5 shrink-0" />{c}</li>
        ))}</ul>
      </Section>
      <Section title="Riscos Técnicos" icon={Lock} iconColor="text-orange-400">
        <div className="space-y-1.5">{quality.risks.map(r => (
          <div key={r.description} className="flex gap-3 text-xs">
            <span className={`font-mono shrink-0 w-16 ${riskColor[r.level]}`}>{r.level}</span>
            <span className="text-zinc-300">{r.description}</span>
          </div>
        ))}</div>
      </Section>
      <Section title="Dívida Técnica" icon={TrendingUp} iconColor="text-red-400">
        <ul className="space-y-1.5">{quality.techDebt.map(d => (
          <li key={d} className="flex gap-2 text-xs text-zinc-300"><Box size={11} className="text-zinc-500 mt-0.5 shrink-0" />{d}</li>
        ))}</ul>
      </Section>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {quality.dimensions.map(m => (
          <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className={`text-lg font-bold ${dimColor[m.color]}`}>{m.value}</div>
            <div className="text-xs text-zinc-400">{m.label}</div>
            <div className="text-xs text-zinc-600 mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerdictTab({ report }) {
  if (!report) return <EmptyState />;
  const { verdict } = report;
  return (
    <div className="space-y-4">
      <Section title="Critério de Conclusão — Checklist" icon={CheckCircle} iconColor="text-green-400">
        {verdict.items.map(c => (
          <div key={c.item} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
            {c.passed ? <CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />}
            <span className="text-xs text-zinc-200 flex-1">{c.item}</span>
            <span className="text-xs text-zinc-500 shrink-0">{c.note}</span>
          </div>
        ))}
      </Section>

      <Section title="Bloqueadores" icon={XCircle} iconColor="text-red-400">
        {verdict.blockers.length === 0
          ? <div className="text-center py-4">
              <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
              <p className="text-green-300 font-bold text-sm">Nenhum bloqueador identificado</p>
              <p className="text-zinc-500 text-xs mt-1">Todos os itens classificados como ✗ Bloqueador = 0</p>
            </div>
          : <ul className="space-y-1.5">{verdict.blockers.map(b => (
              <li key={b} className="flex gap-2 text-xs text-red-300"><XCircle size={11} className="shrink-0 mt-0.5" />{b}</li>
            ))}</ul>
        }
      </Section>

      <div className={`border-2 rounded-2xl p-6 text-center ${verdict.approved ? "bg-gradient-to-br from-green-950 to-emerald-950 border-green-700" : "bg-gradient-to-br from-red-950 to-zinc-950 border-red-700"}`}>
        {verdict.approved ? <CheckCircle size={40} className="text-green-400 mx-auto mb-3" /> : <XCircle size={40} className="text-red-400 mx-auto mb-3" />}
        <div className={`text-4xl font-black mb-4 ${verdict.approved ? "text-green-300" : "text-red-300"}`}>{verdict.approved ? "SIM" : "NÃO"}</div>
        {verdict.approved && (
          <div className="space-y-2 mb-4">
            {[
              { label: "Sprint 1 Approved", color: "green" },
              { label: "Foundation Compatible", color: "green" },
              { label: "Ready for Sprint 2", color: "blue" },
            ].map(({ label, color }) => (
              <div key={label} className="block">
                <div className={`inline-flex items-center gap-2 bg-${color}-900/40 border border-${color}-700 rounded-xl px-4 py-2`}>
                  <CheckCircle size={14} className={`text-${color}-400`} />
                  <span className={`text-${color}-200 font-bold text-sm`}>{label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-zinc-400 text-xs max-w-md mx-auto">{verdict.summary}</p>
        <p className="text-zinc-600 text-xs mt-2">
          {new Date(report.timestamp).toLocaleDateString("pt-BR")} · {report.foundation} · {report.reviewId}
        </p>
      </div>
    </div>
  );
}

function AggregatorTestsTab() {
  const [results, setResults] = useState(null);
  const run = () => setResults(runAggregatorTests());
  const passed = results?.filter(r => r.passed).length ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">Testes de integridade do ReviewAggregator e contrato ReviewReport</p>
        <button onClick={run} className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <FlaskConical size={12} />Testar Aggregator
        </button>
      </div>
      {results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
            <span className="text-xs font-semibold text-zinc-300">ReviewAggregator Tests</span>
            <span className="text-xs text-zinc-500">{passed}/{results.length}</span>
          </div>
          {results.map(r => (
            <div key={r.name} className="flex items-start gap-2 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
              {r.passed ? <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />}
              <span className="text-xs text-zinc-300 flex-1">{r.name}</span>
              {r.error && <span className="text-xs text-red-400 font-mono max-w-xs truncate">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Play size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Execute o pipeline para visualizar os dados</p>
    </div>
  );
}

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "pipeline",     label: "Pipeline" },
  { id: "foundation",   label: "Foundation" },
  { id: "architecture", label: "Arquitetura" },
  { id: "placeholders", label: "Placeholders" },
  { id: "abstractions", label: "Abstrações" },
  { id: "quality",      label: "Quality" },
  { id: "verdict",      label: "Veredicto" },
  { id: "tests",        label: "Testes" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Sprint1Review() {
  const [tab, setTab]       = useState("pipeline");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const runReview = useCallback(async () => {
    setRunning(true);
    setReport(null);
    const tests = await runAllTests();
    const r = aggregate({
      sprint:      "sprint-1",
      sprintLabel: "Sprint 1 — Working Memory Engine",
      foundation:  "v1.0",
      tests,
      compliance:   SPRINT1_COMPLIANCE,
      findings:     SPRINT1_FINDINGS,
      placeholders: SPRINT1_PLACEHOLDERS,
      abstractions: SPRINT1_ABSTRACTIONS,
      quality:      SPRINT1_QUALITY,
    });
    setReport(r);
    setRunning(false);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base md:text-lg">Sprint 1 — Readiness Review</h1>
                <p className="text-zinc-500 text-xs">
                  {report ? `${report.reviewId} · ${new Date(report.timestamp).toLocaleTimeString("pt-BR")}` : "Engineering Readiness · Foundation v1.0 · Working Memory Engine"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["ReviewReport","ReviewAggregator","MRI","MQCCS","MERS","MADS"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
          <button onClick={runReview} disabled={running}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
            {running ? <><RotateCcw size={14} className="animate-spin" />Executando...</> : <><Play size={14} />Executar Revisão</>}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — each panel receives only report */}
        {tab === "pipeline"     && <PipelineTab     report={report} running={running} />}
        {tab === "foundation"   && <FoundationTab   report={report} />}
        {tab === "architecture" && <ArchitectureTab report={report} />}
        {tab === "placeholders" && <PlaceholdersTab report={report} />}
        {tab === "abstractions" && <AbstractionsTab report={report} />}
        {tab === "quality"      && <QualityTab      report={report} />}
        {tab === "verdict"      && <VerdictTab      report={report} />}
        {tab === "tests"        && <AggregatorTestsTab />}

      </div>
    </div>
  );
}