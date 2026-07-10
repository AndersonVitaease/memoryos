import React, { useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, XCircle,
  CheckCircle, ArrowRight, BarChart2, GitBranch, Shield,
  Layers, BookOpen, Zap, Target, Clock, Activity
} from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",      label: "Visão Geral" },
  { id: "drift",         label: "Drift" },
  { id: "debt",          label: "Eng. Debt" },
  { id: "trends",        label: "Tendências" },
  { id: "baseline",      label: "Foundation" },
  { id: "quality",       label: "Qualidade" },
  { id: "dashboard",     label: "Dashboard" },
  { id: "health",        label: "Health Score" },
  { id: "refactoring",   label: "Refatorações" },
  { id: "sustainability", label: "Sustentabilidade" },
];

const DRIFT_TYPES = [
  { type: "Violação de bounded contexts",        severity: "CRITICAL", desc: "Domínio A acessando dados do domínio B diretamente" },
  { type: "Responsabilidades deslocadas",         severity: "HIGH",     desc: "Módulo com lógica de outro domínio" },
  { type: "Dependências inesperadas",             severity: "HIGH",     desc: "Import de módulo não autorizado pelo contrato" },
  { type: "Aumento de acoplamento",               severity: "HIGH",     desc: "Eferente cresce Sprint-a-Sprint" },
  { type: "Implementações sem contrato",          severity: "HIGH",     desc: "Concrete sem interface de abstração" },
  { type: "Componentes excessivamente grandes",   severity: "MEDIUM",   desc: "Classe > 200 linhas / função > 30 linhas" },
  { type: "Perda de coesão",                      severity: "MEDIUM",   desc: "LCOM decresce Sprint-a-Sprint" },
  { type: "Interfaces abandonadas",               severity: "MEDIUM",   desc: "Interface sem implementação há > 2 Sprints" },
  { type: "Abstrações sem implementação",         severity: "LOW",      desc: "Interface definida sem uso" },
];

const DEBT_LEVELS = [
  { level: "Critical",      color: "text-red-400",    bg: "bg-red-900/30 border-red-800",    deadline: "Sprint atual",    points: 0 },
  { level: "High",          color: "text-orange-400", bg: "bg-orange-900/20 border-orange-800", deadline: "Próximo Sprint", points: 0 },
  { level: "Medium",        color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800", deadline: "2 Sprints",    points: 0 },
  { level: "Low",           color: "text-green-400",  bg: "bg-zinc-900 border-zinc-800",     deadline: "Backlog prioritizado", points: 0 },
  { level: "Informational", color: "text-zinc-400",   bg: "bg-zinc-900 border-zinc-700",     deadline: "Backlog livre",   points: 0 },
];

const SPRINT_TRENDS = [
  {
    sprint: "Sprint 1",
    coupling: 3.2, cohesion: 0.72, coverage: 78, complexity: 8.4,
    latency: 4.2, vulnerabilities: 0, duplication: 3.1,
    docCoverage: 62, debtPoints: 14,
  },
];

const QUALITY_HISTORY = [
  { sprint: "Sprint 1", arch: 86, security: 90, perf: 88, testing: 84, docs: 68, maintain: 82, foundation: 87, overall: 88.5 },
];

const HEALTH_COMPONENTS = [
  { name: "Arquitetura (MERS)",      weight: 20, value: 86 },
  { name: "Segurança (MERS)",        weight: 20, value: 90 },
  { name: "Qualidade de código",     weight: 15, value: 82 },
  { name: "Testes",                  weight: 15, value: 84 },
  { name: "Observabilidade",         weight: 10, value: 88 },
  { name: "Documentação",            weight: 10, value: 68 },
  { name: "Dívida técnica (inv.)",   weight: 5,  value: 74 },
  { name: "Aderência à Foundation",  weight: 5,  value: 87 },
];

const REFACTORING_CATEGORIES = [
  { cat: "Simplificação",              example: "Reduzir complexidade ciclomática de funções com branches aninhados" },
  { cat: "Divisão de responsabilidades", example: "Extrair lógica de auditoria de WorkingMemoryEngine para AuditLogger isolado" },
  { cat: "Eliminação de duplicação",   example: "Consolidar validadores de IdentityContext em utilitário compartilhado" },
  { cat: "Melhoria de interfaces",     example: "Segregar IWorkingMemoryEngine em interfaces de leitura e escrita" },
  { cat: "Redução de acoplamento",     example: "Introduzir interface entre Engine e Store (IWorkingMemoryStore)" },
  { cat: "Melhoria de performance",    example: "Substituir Array.find() por Map em hot paths de lookup" },
  { cat: "Fortalecimento de segurança", example: "Adicionar Object.freeze() em todos os payloads de eventos emitidos" },
];

const SUSTAINABILITY_PRINCIPLES = [
  { principle: "Estabilidade",            criterion: "Interfaces públicas não quebram sem RFC aprovada" },
  { principle: "Retrocompatibilidade",    criterion: "Breaking changes documentados e versionados no CHANGELOG" },
  { principle: "Clareza arquitetural",    criterion: "Diagrama C4 atualizado a cada Sprint" },
  { principle: "Baixo acoplamento",       criterion: "Eferente médio não cresce Sprint-a-Sprint" },
  { principle: "Alta coesão",             criterion: "LCOM não decresce Sprint-a-Sprint" },
  { principle: "Documentação atualizada", criterion: "JSDoc + README sincronizados com o código" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const SEV_STYLE = {
  CRITICAL:      "bg-red-900/30 text-red-400 border border-red-800",
  HIGH:          "bg-orange-900/20 text-orange-400 border border-orange-800",
  MEDIUM:        "bg-yellow-900/20 text-yellow-400 border border-yellow-800",
  LOW:           "bg-zinc-800 text-zinc-400 border border-zinc-700",
  Informational: "bg-zinc-800 text-zinc-500 border border-zinc-700",
};

function TrendIcon({ val, idealDir }) {
  if (val === "up")   return idealDir === "up"   ? <TrendingUp size={12} className="text-green-400" /> : <TrendingUp size={12} className="text-red-400" />;
  if (val === "down") return idealDir === "down" ? <TrendingDown size={12} className="text-green-400" /> : <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-zinc-500" />;
}

function SectionTitle({ icon: Icon, text, color = "violet" }) {
  const bg = { violet: "bg-violet-700", blue: "bg-blue-700", green: "bg-green-700", red: "bg-red-700", yellow: "bg-yellow-700", orange: "bg-orange-700" };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bg[color] ?? "bg-zinc-700"} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-sm md:text-base">{text}</h2>
    </div>
  );
}

function ScoreBar({ label, value, min, weight }) {
  const ok = value >= min;
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-xs w-44 shrink-0">{label}</span>
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${ok ? "bg-violet-500" : "bg-red-500"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`font-mono text-xs w-8 text-right ${ok ? "text-zinc-300" : "text-red-400"}`}>{value}</span>
      {weight && <span className="text-zinc-600 text-xs w-10 text-right">{weight}%</span>}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function MadsSystem() {
  const [tab, setTab] = useState("overview");

  const healthScore = Math.round(
    HEALTH_COMPONENTS.reduce((acc, c) => acc + (c.value * c.weight) / 100, 0)
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center shrink-0">
              <Activity size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MADS — Architecture Drift & Sustainability</h1>
              <p className="text-zinc-500 text-xs">Official Engineering Process · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0", "Complementa MERS", "Drift Detection", "Debt Tracking", "Health Score", "10 Capítulos"].map(b => (
              <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto mb-6">
          <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-4">
            <SectionTitle icon={Activity} text="Filosofia MADS" color="orange" />
            <div className="bg-gradient-to-br from-orange-950 to-zinc-900 border border-orange-800 rounded-xl p-5">
              <p className="text-orange-100 font-semibold text-sm mb-2">
                "Toda arquitetura sofre desgaste com o tempo. O MADS detecta esse desgaste antes que se torne um problema."
              </p>
              <p className="text-zinc-400 text-sm">Complementa o MERS definindo como o MemoryOS detectará deriva arquitetural, crescimento de dívida técnica e perda gradual de qualidade ao longo da evolução da plataforma.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Tipos de Drift",        value: "9",   color: "text-orange-400" },
                { label: "Níveis de Dívida",      value: "5",   color: "text-yellow-400" },
                { label: "Indicadores de Trend",  value: "9",   color: "text-blue-400" },
                { label: "Health Score Mínimo",   value: "≥85", color: "text-green-400" },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">O que o MADS preserva</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {["Simplicidade", "Modularidade", "Clareza", "Rastreabilidade", "Manutenibilidade", "Desempenho"].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-orange-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Escopo (NÃO altera)</h3>
              <div className="flex flex-wrap gap-2">
                {["Foundation", "Core", "Runtime", "SDKs", "APIs", "Roadmap", "MERS"].map(item => (
                  <span key={item} className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">{item}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DRIFT ────────────────────────────────────────────────────── */}
        {tab === "drift" && (
          <div className="space-y-4">
            <SectionTitle icon={AlertTriangle} text="Capítulo 2 — Architectural Drift" color="orange" />
            <p className="text-zinc-400 text-sm">Cada ocorrência detectada gera: <strong className="text-zinc-200">evidência + severidade + recomendação</strong>.</p>
            <div className="space-y-2">
              {DRIFT_TYPES.map(item => (
                <div key={item.type} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  {item.severity === "CRITICAL"
                    ? <XCircle size={14} className="text-red-400 shrink-0" />
                    : item.severity === "HIGH"
                      ? <AlertTriangle size={14} className="text-orange-400 shrink-0" />
                      : <Minus size={14} className="text-yellow-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{item.type}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono shrink-0 ${SEV_STYLE[item.severity]}`}>{item.severity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEBT ─────────────────────────────────────────────────────── */}
        {tab === "debt" && (
          <div className="space-y-4">
            <SectionTitle icon={Layers} text="Capítulo 3 — Engineering Debt" color="yellow" />
            <div className="space-y-2">
              {DEBT_LEVELS.map(d => (
                <div key={d.level} className={`border rounded-xl px-4 py-3 ${d.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${d.color}`}>{d.level}</span>
                    <span className="text-zinc-500 text-xs">Prazo: {d.deadline}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Campos obrigatórios por item de dívida</h3>
              <div className="space-y-1.5">
                {[
                  ["origem",         "Arquivo, método e Sprint onde surgiu"],
                  ["impacto",        "O que é afetado na plataforma"],
                  ["risco",          "Probabilidade e severidade de degradação"],
                  ["esforço",        "Estimativa em horas ou pontos"],
                  ["recomendação",   "Ação concreta e justificada"],
                  ["sprint_origin",  "Sprint onde foi identificado"],
                ].map(([field, desc]) => (
                  <div key={field} className="flex gap-3 text-sm">
                    <span className="font-mono text-violet-400 text-xs w-28 shrink-0">{field}</span>
                    <span className="text-zinc-400 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRENDS ───────────────────────────────────────────────────── */}
        {tab === "trends" && (
          <div className="space-y-4">
            <SectionTitle icon={TrendingUp} text="Capítulo 4 — Engineering Trends" color="blue" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Indicador</th>
                    <th className="px-4 py-2 text-center">Unidade</th>
                    <th className="px-4 py-2 text-center">Sprint 1</th>
                    <th className="px-4 py-2 text-center">Ideal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {[
                    { name: "Acoplamento eferente médio", unit: "módulos/classe", val: SPRINT_TRENDS[0].coupling,       ideal: "↓", dir: "down" },
                    { name: "Coesão LCOM médio",          unit: "0–1",            val: SPRINT_TRENDS[0].cohesion,       ideal: "↑", dir: "up"   },
                    { name: "Cobertura de testes",         unit: "%",              val: SPRINT_TRENDS[0].coverage,       ideal: "↑", dir: "up"   },
                    { name: "Complexidade ciclomática",    unit: "paths/função",   val: SPRINT_TRENDS[0].complexity,     ideal: "↓", dir: "down" },
                    { name: "Latência p95 crítica",        unit: "ms",             val: SPRINT_TRENDS[0].latency,        ideal: "↓", dir: "down" },
                    { name: "Vulnerabilidades abertas",    unit: "count",          val: SPRINT_TRENDS[0].vulnerabilities, ideal: "↓", dir: "down" },
                    { name: "Duplicação",                  unit: "%",              val: SPRINT_TRENDS[0].duplication,    ideal: "↓", dir: "down" },
                    { name: "Cobertura de documentação",   unit: "%",              val: SPRINT_TRENDS[0].docCoverage,    ideal: "↑", dir: "up"   },
                    { name: "Dívida técnica acumulada",    unit: "pontos",         val: SPRINT_TRENDS[0].debtPoints,     ideal: "↓", dir: "down" },
                  ].map(row => (
                    <tr key={row.name}>
                      <td className="px-4 py-2.5 text-zinc-200">{row.name}</td>
                      <td className="px-4 py-2.5 text-center text-zinc-500 text-xs font-mono">{row.unit}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-violet-300 text-sm">{row.val}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-lg">{row.ideal}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Legenda de Tendência</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2"><TrendingUp size={14} className="text-green-400" /><span className="text-zinc-300">↑ Melhorando — variação ≥ 5% positiva</span></div>
                <div className="flex items-center gap-2"><Minus size={14} className="text-zinc-500" /><span className="text-zinc-300">→ Estável — variação &lt; 5%</span></div>
                <div className="flex items-center gap-2"><TrendingDown size={14} className="text-red-400" /><span className="text-zinc-300">↓ Piorando — variação ≥ 5% negativa</span></div>
              </div>
              <p className="text-zinc-500 text-xs mt-2">Alerta obrigatório gerado quando qualquer dimensão piora por 2 Sprints consecutivos.</p>
            </div>
          </div>
        )}

        {/* ── BASELINE ─────────────────────────────────────────────────── */}
        {tab === "baseline" && (
          <div className="space-y-4">
            <SectionTitle icon={BookOpen} text="Capítulo 5 — Foundation Baseline Comparison" color="blue" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="space-y-3">
                {[
                  "Implementação Atual",
                  "Foundation v1.0",
                  "Diferenças identificadas",
                  "Impacto técnico avaliado",
                  "Justificativa documentada",
                  "RFC correspondente (quando existir)",
                ].map((step, i) => (
                  <div key={step}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        step === "Foundation v1.0" ? "bg-blue-700 text-white" : "bg-zinc-800 text-zinc-400"
                      }`}>{i + 1}</div>
                      <p className={`text-sm font-medium ${step === "Foundation v1.0" ? "text-blue-300" : "text-zinc-200"}`}>{step}</p>
                    </div>
                    {i < 5 && <div className="ml-3.5 w-px h-3 bg-zinc-800 my-0.5" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-950/20 border border-blue-900/50 rounded-xl p-4">
              <p className="text-blue-300 text-sm font-semibold mb-1">Resultado esperado</p>
              <p className="text-zinc-400 text-sm">Lista de desvios com justificativa técnica e rastreabilidade para RFC/ADR correspondente. Desvios sem RFC aprovada são tratados como dívida técnica de nível HIGH.</p>
            </div>
          </div>
        )}

        {/* ── QUALITY ──────────────────────────────────────────────────── */}
        {tab === "quality" && (
          <div className="space-y-4">
            <SectionTitle icon={BarChart2} text="Capítulo 6 — Quality Evolution" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Sprint 1 — Scores</h3>
              <div className="space-y-2.5">
                <ScoreBar label="Architecture Score"     value={QUALITY_HISTORY[0].arch}       min={90} />
                <ScoreBar label="Security Score"         value={QUALITY_HISTORY[0].security}    min={95} />
                <ScoreBar label="Performance Score"      value={QUALITY_HISTORY[0].perf}        min={85} />
                <ScoreBar label="Testing Score"          value={QUALITY_HISTORY[0].testing}     min={90} />
                <ScoreBar label="Documentation Score"    value={QUALITY_HISTORY[0].docs}        min={75} />
                <ScoreBar label="Maintainability Score"  value={QUALITY_HISTORY[0].maintain}    min={80} />
                <ScoreBar label="Foundation Compliance"  value={QUALITY_HISTORY[0].foundation}  min={100} />
                <div className="border-t border-zinc-800 pt-2 mt-2">
                  <ScoreBar label="Overall Engineering" value={QUALITY_HISTORY[0].overall} min={87} />
                </div>
              </div>
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-3">
              <p className="text-yellow-300 text-xs font-semibold">⚠ Alerta de tendência</p>
              <p className="text-zinc-400 text-xs mt-0.5">Qualquer dimensão com tendência <strong className="text-red-400">↓ Piorando</strong> por 2 Sprints consecutivos gera alerta obrigatório antes do próximo Engineering Review.</p>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <div className="space-y-4">
            <SectionTitle icon={Layers} text="Capítulo 7 — Technical Debt Dashboard" color="yellow" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Dívida Total",         value: "14 pts", color: "text-yellow-400" },
                { label: "Itens Críticos",        value: "0",      color: "text-green-400" },
                { label: "Itens High",            value: "3",      color: "text-orange-400" },
                { label: "Itens Medium",          value: "6",      color: "text-yellow-400" },
                { label: "Itens Low",             value: "5",      color: "text-zinc-400" },
                { label: "MTTR médio",            value: "—",      color: "text-zinc-500" },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Componentes do Dashboard</h3>
              <div className="space-y-1.5 text-sm text-zinc-400">
                {[
                  "Dívida total acumulada — pontos por classificação",
                  "Dívida por módulo — concentração por área da plataforma",
                  "Dívida por Sprint — introduzida vs resolvida no Sprint",
                  "Dívida acumulada — histórico cumulativo Sprint-a-Sprint",
                  "Itens críticos — com prazo vencido ou em risco",
                  "Tempo médio de resolução (MTTR) por nível",
                  "Tendência histórica — gráfico Sprint-a-Sprint",
                ].map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <ArrowRight size={11} className="text-yellow-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── HEALTH ───────────────────────────────────────────────────── */}
        {tab === "health" && (
          <div className="space-y-4">
            <SectionTitle icon={Activity} text="Capítulo 8 — Architecture Health Score" color="orange" />
            <div className={`rounded-xl p-5 text-center border ${healthScore >= 85 ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
              <p className="text-zinc-500 text-xs mb-1">Sprint 1 — Health Score</p>
              <p className={`text-5xl font-bold ${healthScore >= 85 ? "text-green-400" : "text-red-400"}`}>{healthScore}</p>
              <p className="text-zinc-400 text-sm mt-1">Threshold mínimo: <span className="text-zinc-200 font-semibold">≥ 85</span></p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Componentes e Pesos</h3>
              <div className="space-y-2.5">
                {HEALTH_COMPONENTS.map(c => (
                  <ScoreBar key={c.name} label={c.name} value={c.value} min={70} weight={c.weight} />
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Fórmula</h3>
              <pre className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded-lg p-3 overflow-x-auto">{`Health Score = Σ(componente × peso) − penalidade_drift
penalidade_drift = (qtd_critical × 5) + (qtd_high × 2)`}</pre>
            </div>
          </div>
        )}

        {/* ── REFACTORING ──────────────────────────────────────────────── */}
        {tab === "refactoring" && (
          <div className="space-y-4">
            <SectionTitle icon={GitBranch} text="Capítulo 9 — Refactoring Recommendations" color="violet" />
            <div className="space-y-2">
              {REFACTORING_CATEGORIES.map(item => (
                <div key={item.cat} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-zinc-200">{item.cat}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{item.example}</p>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Campos obrigatórios por recomendação</h3>
              <div className="space-y-1.5">
                {[
                  ["justificativa", "Por que esta refatoração é necessária"],
                  ["benefício",     "Impacto esperado na saúde arquitetural"],
                  ["esforço",       "Estimativa em horas ou pontos"],
                  ["prioridade",    "Critical / High / Medium / Low"],
                ].map(([field, desc]) => (
                  <div key={field} className="flex gap-3">
                    <span className="font-mono text-violet-400 text-xs w-28 shrink-0">{field}</span>
                    <span className="text-zinc-400 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SUSTAINABILITY ───────────────────────────────────────────── */}
        {tab === "sustainability" && (
          <div className="space-y-4">
            <SectionTitle icon={Shield} text="Capítulo 10 — Sustainability Principles" color="green" />
            <div className="space-y-2">
              {SUSTAINABILITY_PRINCIPLES.map(item => (
                <div key={item.principle} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <CheckCircle size={14} className="text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{item.principle}</p>
                    <p className="text-xs text-zinc-400">{item.criterion}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gradient-to-br from-green-950 to-zinc-900 border border-green-700 rounded-xl p-4">
              <h3 className="text-green-300 font-bold text-sm mb-2">Declaração Final</h3>
              <p className="text-zinc-300 text-sm">O MADS oficializa a preservação contínua da arquitetura do MemoryOS. A plataforma deverá crescer continuamente sem acumular degradação estrutural, garantindo que o MemoryOS permaneça sustentável, auditável e evolutivo durante muitos anos.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}