import React, { useState } from "react";
import { Shield, CheckCircle, AlertTriangle, XCircle, ArrowRight, BarChart2, Code, BookOpen, Zap, Target, GitBranch, Cpu, FileText, Clock, ChevronDown, ChevronRight } from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",       label: "Visão Geral" },
  { id: "engines",        label: "Engines" },
  { id: "architecture",   label: "Arquitetura" },
  { id: "foundation",     label: "Foundation" },
  { id: "dependencies",   label: "Dependências" },
  { id: "quality",        label: "Code Quality" },
  { id: "security",       label: "Segurança" },
  { id: "performance",    label: "Performance" },
  { id: "testing",        label: "Testes" },
  { id: "documentation",  label: "Docs" },
  { id: "score",          label: "Score" },
  { id: "gates",          label: "Quality Gates" },
  { id: "specialist",     label: "Specialist" },
  { id: "evolution",      label: "Evolução" },
  { id: "cycle",          label: "Dev Cycle" },
];

const REVIEW_ENGINES = [
  { name: "Architecture Review",    icon: GitBranch, color: "text-violet-400",  desc: "SOLID, Clean Arch, DDD, Hexagonal, Event-Driven" },
  { name: "Foundation Compliance",  icon: BookOpen,  color: "text-blue-400",    desc: "15 documentos oficiais verificados" },
  { name: "Code Quality",           icon: Code,      color: "text-green-400",   desc: "Complexidade, coesão, acoplamento, imutabilidade" },
  { name: "Dependency Analysis",    icon: GitBranch, color: "text-yellow-400",  desc: "Circulares, concretizações, duplicação, dead code" },
  { name: "Performance Review",     icon: Zap,       color: "text-orange-400",  desc: "Latência p95, complexidade O(), throughput" },
  { name: "Security Review",        icon: Shield,    color: "text-red-400",     desc: "Isolation, injection, audit integrity, memory leaks" },
  { name: "API Review",             icon: Code,      color: "text-cyan-400",    desc: "Assinaturas MPAR, contrato público, breaking changes" },
  { name: "Documentation Review",   icon: FileText,  color: "text-indigo-400",  desc: "JSDoc, Foundation refs, @throws, exemplos" },
  { name: "Testing Review",         icon: CheckCircle, color: "text-emerald-400", desc: "Cobertura, unitários, integração, stress, chaos" },
  { name: "Observability Review",   icon: BarChart2, color: "text-pink-400",    desc: "AuditTrail, events, metrics, correlationId" },
  { name: "Engineering Score",      icon: Target,    color: "text-amber-400",   desc: "Score final ponderado com histórico por Sprint" },
];

const ARCH_PRINCIPLES = [
  { name: "SOLID",                  target: "5/5",  evidence: "Classes com SRP, interfaces segregadas, dependências injetadas" },
  { name: "Clean Architecture",     target: "3/3",  evidence: "Sem import de infra em domínio. Camadas respeitadas." },
  { name: "DDD",                    target: "Alto", evidence: "IdentityContext como VO, AuditRecord como Domain Event" },
  { name: "Event Driven",           target: "100%", evidence: "MemoryEvent publicado em toda mutação" },
  { name: "Hexagonal",              target: "Alto", evidence: "Interfaces como Ports, implementações como Adapters" },
  { name: "CQRS",                   target: "Quando aplicável", evidence: "Queries separadas de Commands" },
  { name: "Separation of Concerns", target: "Alto", evidence: "1 responsabilidade por módulo" },
  { name: "Dependency Inversion",   target: "100%", evidence: "Engine depende de interfaces, não de concretizações" },
  { name: "Interface Segregation",  target: "100%", evidence: "Nenhum implementador forçado a métodos desnecessários" },
  { name: "Modularidade",           target: "Alta", evidence: "Imports apenas de contratos públicos" },
];

const FOUNDATION_DOCS = [
  { doc: "MV",    desc: "Vision", criterion: "Implementação alinha com memória permanente e contínua" },
  { doc: "MPS",   desc: "Product Spec", criterion: "Feature coberta pelo roadmap oficial" },
  { doc: "MAS",   desc: "Architecture Spec", criterion: "Camadas arquiteturais respeitadas" },
  { doc: "MDS",   desc: "Developer Spec", criterion: "Princípios arquiteturais aplicados" },
  { doc: "MRS",   desc: "Runtime Spec", criterion: "Tipos e contratos Runtime implementados" },
  { doc: "MCS",   desc: "Core Spec", criterion: "Fronteiras do Core respeitadas, IoC aplicado" },
  { doc: "MDIS",  desc: "Decision Intelligence", criterion: "Lógica determinística, sem ambiguidade" },
  { doc: "MIES",  desc: "Intelligence Evolution", criterion: "Abstrações para learning preparadas" },
  { doc: "MDPS",  desc: "Developer Platform", criterion: "SDK público conforme contrato" },
  { doc: "MGFS",  desc: "Governance Foundation", criterion: "RFC → ADR → Implementation seguido" },
  { doc: "MRI",   desc: "Reference Implementation", criterion: "Todos os cenários MRI passam" },
  { doc: "MQCCS", desc: "Quality Compliance", criterion: "Imutabilidade, validação, cobertura atingida" },
  { doc: "MPAR",  desc: "Public API Reference", criterion: "Assinaturas públicas conformes" },
  { doc: "MREM",  desc: "Reference Execution Model", criterion: "Eventos e audit trail conforme catálogo" },
  { doc: "MEB",   desc: "Engineering Backlog", criterion: "Todos os itens do sprint entregues" },
];

const QUALITY_DIMENSIONS = [
  { dim: "Architecture",           weight: 15, min: 90 },
  { dim: "Foundation Compliance",  weight: 20, min: 100 },
  { dim: "Security",               weight: 20, min: 95 },
  { dim: "Code Quality",           weight: 10, min: 80 },
  { dim: "Performance",            weight: 10, min: 85 },
  { dim: "Testing",                weight: 10, min: 90 },
  { dim: "Maintainability",        weight: 5,  min: 80 },
  { dim: "Documentation",          weight: 5,  min: 75 },
  { dim: "Observability",          weight: 5,  min: 85 },
];

const SPRINT_HISTORY = [
  { sprint: "Sprint 1", overall: 88.5, arch: 86, foundation: 87, security: 90, status: "APROVADO*" },
];

const ABSOLUTE_GATES = [
  "Architecture Score < 90",
  "Security Score < 95",
  "Foundation Compliance < 100",
  "MRI Test Suite falha",
  "MQCCS Certification falha",
  "Cobertura unitária < 100% nos métodos públicos",
  "Vulnerabilidade crítica detectada",
  "Memory Leak detectado",
  "Cross Context Access detectado",
  "Dependência circular detectada",
];

const PERF_TARGETS = [
  { op: "store()",       p50: "< 1ms",  p95: "< 10ms",  p99: "< 50ms" },
  { op: "get()",         p50: "< 1ms",  p95: "< 10ms",  p99: "< 50ms" },
  { op: "remove()",      p50: "< 1ms",  p95: "< 10ms",  p99: "< 50ms" },
  { op: "findByKey()",   p50: "< 2ms",  p95: "< 20ms",  p99: "< 100ms" },
  { op: "touch()",       p50: "< 1ms",  p95: "< 10ms",  p99: "< 50ms" },
  { op: "promote()",     p50: "< 2ms",  p95: "< 20ms",  p99: "< 100ms" },
  { op: "runEviction()", p50: "< 10ms", p95: "< 100ms", p99: "< 500ms" },
  { op: "stats()",       p50: "< 2ms",  p95: "< 20ms",  p99: "< 100ms" },
];

const TEST_COVERAGE = [
  { type: "Unitários (100% métodos públicos)", min: "100%", blocker: true },
  { type: "Integração (Audit + Eventos)", min: "100%", blocker: true },
  { type: "Performance (p95 conforme MPAR)", min: "PASS", blocker: true },
  { type: "Concorrência (50+ ops simultâneas)", min: "PASS", blocker: true },
  { type: "Identity Isolation (4+ cenários)", min: "PASS", blocker: true },
  { type: "TTL (expiração e extensão)", min: "PASS", blocker: true },
  { type: "Eviction (capacidade e prioridade)", min: "PASS", blocker: true },
  { type: "Validação de entrada (todos os campos)", min: "PASS", blocker: true },
  { type: "Stress Test (10.000+ ops)", min: "PASS", blocker: false },
  { type: "Chaos Test (fault injection)", min: "PASS", blocker: false },
  { type: "Fuzz Test (inputs aleatórios)", min: "PASS", blocker: false },
  { type: "Memory Leak Test (heap após destroy)", min: "PASS", blocker: false },
  { type: "Long Running (60+ min)", min: "PASS", blocker: false },
  { type: "Mutation Testing (kill rate > 80%)", min: "80%", blocker: false },
];

const SECURITY_VECTORS = [
  { vector: "Identity Context", criterion: "Isolamento total por partitionKey", blocker: true },
  { vector: "Cross Context Access", criterion: "Zero itens de ctxA visíveis em ctxB", blocker: true },
  { vector: "Race Conditions", criterion: "Async operations seguras no event loop", blocker: true },
  { vector: "Memory Leaks", criterion: "Timers, listeners e stores com destroy()", blocker: true },
  { vector: "Thread Safety", criterion: "Análise do modelo de concorrência do runtime", blocker: true },
  { vector: "Input Validation", criterion: "Todo input público validado com erro tipado", blocker: true },
  { vector: "Injection", criterion: "Sem execução de strings de input", blocker: true },
  { vector: "Escalada de privilégios", criterion: "Operações restritas ao próprio contexto", blocker: true },
  { vector: "Audit Trail", criterion: "Toda mutação auditada com correlationId", blocker: true },
  { vector: "Integridade de eventos", criterion: "Object.freeze() em todos os eventos", blocker: true },
];

const DEV_CYCLE = [
  { step: "Implementação",      desc: "Código escrito seguindo MDS, MRS, MCS" },
  { step: "MRI",                desc: "Reference Implementation Tests — todos os cenários" },
  { step: "MQCCS",              desc: "Quality & Compliance Certification" },
  { step: "MERS",               desc: "Engineering Review — todos os 10 engines" },
  { step: "Correções",          desc: "Endereçar bloqueadores e ressalvas obrigatórias" },
  { step: "Nova Validação",     desc: "Re-executar MRI + MQCCS + MERS" },
  { step: "Aprovação",          desc: "Engineering Review Specialist emite parecer" },
  { step: "Merge",              desc: "Integração ao branch principal" },
  { step: "Release",            desc: "Publicação com CHANGELOG e rastreabilidade" },
];

// ─── Components ────────────────────────────────────────────────────────────

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
      </button>
      {open && <div className="border-t border-zinc-800 px-4 py-3">{children}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, text, color = "violet" }) {
  const bg = { violet: "bg-violet-700", blue: "bg-blue-700", green: "bg-green-700", red: "bg-red-700", yellow: "bg-yellow-700", zinc: "bg-zinc-700" };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bg[color]} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-sm md:text-base">{text}</h2>
    </div>
  );
}

function BlockerBadge({ blocker }) {
  return blocker
    ? <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono">Bloqueador</span>
    : <span className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded font-mono">Recomendado</span>;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function MersSystem() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shrink-0">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MERS — Engineering Review System</h1>
              <p className="text-zinc-500 text-xs">Official Quality Gate · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0","Official Foundation Process","Quality Gate Obrigatório","Engineering Review Specialist","15 Engines"].map(b => (
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
            <SectionTitle icon={Shield} text="Filosofia MERS" color="violet" />
            <div className="bg-gradient-to-br from-violet-950 to-blue-950 border border-violet-700 rounded-xl p-5">
              <p className="text-violet-100 font-semibold text-sm mb-3">
                "Nenhuma implementação deverá ser considerada concluída apenas porque compila."
              </p>
              <p className="text-zinc-400 text-sm">O MERS é o Quality Gate obrigatório que garante que toda implementação demonstre correção, qualidade, segurança, performance, conformidade arquitetural, testabilidade, observabilidade e manutenibilidade antes de integrar a plataforma.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Engines de Revisão", value: "11", color: "text-violet-400" },
                { label: "Documentos Foundation", value: "15", color: "text-blue-400" },
                { label: "Gates Absolutos", value: "10", color: "text-red-400" },
                { label: "Dimensões de Score", value: "9", color: "text-green-400" },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">O que o MERS garante</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  "Processo oficial e reproduzível de revisão",
                  "Toda Sprint gera relatório técnico automático (MESR)",
                  "Engineering Review Specialist formalmente definido",
                  "Quality Gates obrigatórios e auditáveis",
                  "Histórico permanente de revisões no MEB",
                  "Toda aprovação rastreável e justificada",
                  "Detecção de regressões entre Sprints",
                  "Integração obrigatória no ciclo de desenvolvimento",
                ].map((item, i) => (
                  <div key={i} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Escopo MERS (o que NÃO altera)</h3>
              <div className="flex flex-wrap gap-2">
                {["Foundation","Core","Runtime","SDKs","Connectors","Specialists","Roadmap"].map(item => (
                  <span key={item} className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">{item}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ENGINES ──────────────────────────────────────────────────── */}
        {tab === "engines" && (
          <div className="space-y-4">
            <SectionTitle icon={Cpu} text="Capítulo 2 — Engines de Revisão" color="violet" />
            <div className="space-y-2">
              {REVIEW_ENGINES.map((engine, i) => {
                const Icon = engine.icon;
                return (
                  <div key={engine.name} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                    <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                      <Icon size={13} className={engine.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 text-sm font-semibold">{engine.name}</p>
                      <p className="text-zinc-500 text-xs">{engine.desc}</p>
                    </div>
                    {i < REVIEW_ENGINES.length - 1 && (
                      <ArrowRight size={12} className="text-zinc-700 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ARCHITECTURE ─────────────────────────────────────────────── */}
        {tab === "architecture" && (
          <div className="space-y-4">
            <SectionTitle icon={GitBranch} text="Capítulo 3 — Architecture Review" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Princípio</th>
                    <th className="px-4 py-2 text-left">Target</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Evidência Esperada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {ARCH_PRINCIPLES.map(p => (
                    <tr key={p.name}>
                      <td className="px-4 py-2.5 font-semibold text-zinc-200">{p.name}</td>
                      <td className="px-4 py-2.5 text-violet-400 font-mono text-xs">{p.target}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden md:table-cell">{p.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-4">
              <p className="text-yellow-300 text-sm font-semibold mb-1">⚠ Nota sobre Evidências</p>
              <p className="text-zinc-400 text-sm">A revisão arquitetural deve apresentar <strong className="text-zinc-200">evidências objetivas</strong> (trechos de código, testes, diagrama), não apenas notas. Uma declaração sem evidência é considerada inválida pelo Engineering Review Specialist.</p>
            </div>
          </div>
        )}

        {/* ── FOUNDATION ───────────────────────────────────────────────── */}
        {tab === "foundation" && (
          <div className="space-y-4">
            <SectionTitle icon={BookOpen} text="Capítulo 4 — Foundation Compliance" color="blue" />
            <div className="grid grid-cols-3 gap-3 mb-2">
              {[
                { label: "✓ Conforme",    desc: "Evidência objetiva de aderência", color: "border-green-800 text-green-400" },
                { label: "⚠ Parcial",    desc: "Gap identificado com plano", color: "border-yellow-800 text-yellow-400" },
                { label: "✗ Não Conforme", desc: "Violação — bloqueador de aprovação", color: "border-red-800 text-red-400" },
              ].map(s => (
                <div key={s.label} className={`bg-zinc-900 border rounded-xl p-3 text-center ${s.color}`}>
                  <div className="font-mono font-bold text-sm">{s.label}</div>
                  <div className="text-zinc-500 text-xs mt-1">{s.desc}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {FOUNDATION_DOCS.map(f => (
                <div key={f.doc} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <span className="font-mono text-violet-400 font-bold text-sm w-12 shrink-0">{f.doc}</span>
                  <span className="text-zinc-500 text-xs w-32 shrink-0 hidden md:block">{f.desc}</span>
                  <span className="text-zinc-300 text-sm flex-1">{f.criterion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEPENDENCIES ─────────────────────────────────────────────── */}
        {tab === "dependencies" && (
          <div className="space-y-4">
            <SectionTitle icon={GitBranch} text="Capítulo 5 — Dependency Analysis" color="yellow" />
            <div className="space-y-2">
              {[
                { name: "Acoplamento desnecessário", impact: "Dificulta substituição e extensão", zero: false, note: "Se dependência concreta pode ser interface → refatorar" },
                { name: "Dependência circular",      impact: "Risco de deadlock, build errors",  zero: true,  note: "Zero tolerância — bloqueador absoluto" },
                { name: "Concretizações diretas",    impact: "Impede mocking e extensão",         zero: true,  note: "Toda dependência externa deve ser interface" },
                { name: "Violação de interfaces",    impact: "LSP, ISP quebrados",               zero: true,  note: "Zero tolerância" },
                { name: "Duplicação",                impact: "Manutenção multiplicada",           zero: false, note: "> 5% de duplicação = bloqueador" },
                { name: "Código morto",              impact: "Ruído e risco de bugs",            zero: true,  note: "Zero tolerância em código novo" },
                { name: "Interfaces redundantes",    impact: "Sobrecarga desnecessária",          zero: false, note: "Interfaces sem implementação devem ter roadmap" },
                { name: "Dependências ocultas",      impact: "Globals, singletons",              zero: true,  note: "Zero tolerância" },
              ].map(item => (
                <div key={item.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-start gap-3">
                  {item.zero
                    ? <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    : <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.impact}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{item.note}</p>
                  </div>
                  {item.zero && <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono shrink-0">Zero Tolerância</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── QUALITY ──────────────────────────────────────────────────── */}
        {tab === "quality" && (
          <div className="space-y-4">
            <SectionTitle icon={Code} text="Capítulo 6 — Code Quality" color="green" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Indicador</th>
                    <th className="px-4 py-2 text-center">Target</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Critério</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {[
                    { name: "Complexidade ciclomática", target: "≤ 10",   criterion: "Caminhos lógicos independentes por função" },
                    { name: "Acoplamento eferente",     target: "≤ 5",    criterion: "Número de módulos importados por classe" },
                    { name: "Coesão (LCOM)",            target: "≥ 0.8",  criterion: "Métodos que compartilham campos internos" },
                    { name: "Duplicação",               target: "≤ 5%",   criterion: "Blocos de ≥ 6 linhas idênticos" },
                    { name: "Tamanho de métodos",       target: "≤ 30",   criterion: "Linhas de código executável" },
                    { name: "Tamanho de classes",       target: "≤ 200",  criterion: "Linhas totais excluindo comentários" },
                    { name: "Responsabilidade única",   target: "1/classe",criterion: "Razões para mudar por classe" },
                    { name: "Imutabilidade",            target: "≥ 80%",  criterion: "readonly / Object.freeze() nos tipos" },
                    { name: "Testabilidade",            target: "Alta",   criterion: "Dependências injetáveis via interfaces" },
                    { name: "Legibilidade",             target: "Alta",   criterion: "Names, JSDoc, sem abreviações" },
                  ].map(r => (
                    <tr key={r.name}>
                      <td className="px-4 py-2.5 text-zinc-200">{r.name}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-violet-400 text-xs">{r.target}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden md:table-cell">{r.criterion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SECURITY ─────────────────────────────────────────────────── */}
        {tab === "security" && (
          <div className="space-y-4">
            <SectionTitle icon={Shield} text="Capítulo 7 — Security Review" color="red" />
            <div className="space-y-2">
              {SECURITY_VECTORS.map(item => (
                <div key={item.vector} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <Shield size={13} className="text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{item.vector}</p>
                    <p className="text-xs text-zinc-400">{item.criterion}</p>
                  </div>
                  <BlockerBadge blocker={item.blocker} />
                </div>
              ))}
            </div>
            <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
              <p className="text-red-300 text-sm font-semibold mb-1">⚠ Security Score Mínimo: 95</p>
              <p className="text-zinc-400 text-sm">Qualquer falha em vetor de segurança marcado como Bloqueador resultará em REPROVAÇÃO imediata, independente do score geral.</p>
            </div>
          </div>
        )}

        {/* ── PERFORMANCE ──────────────────────────────────────────────── */}
        {tab === "performance" && (
          <div className="space-y-4">
            <SectionTitle icon={Zap} text="Capítulo 8 — Performance Review" color="yellow" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Operação</th>
                    <th className="px-4 py-2 text-center">p50</th>
                    <th className="px-4 py-2 text-center">p95</th>
                    <th className="px-4 py-2 text-center">p99</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {PERF_TARGETS.map(r => (
                    <tr key={r.op}>
                      <td className="px-4 py-2.5 font-mono text-zinc-200 text-xs">{r.op}</td>
                      <td className="px-4 py-2.5 text-center text-green-400 font-mono text-xs">{r.p50}</td>
                      <td className="px-4 py-2.5 text-center text-yellow-400 font-mono text-xs">{r.p95}</td>
                      <td className="px-4 py-2.5 text-center text-orange-400 font-mono text-xs">{r.p99}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Gargalos avaliados</h3>
              <div className="space-y-1.5 text-sm text-zinc-400">
                {[
                  "Complexidade algorítmica (notação O) de cada operação",
                  "Uso de heap por partição — estimado e medido",
                  "Impacto de eviction na latência do store()",
                  "Throughput máximo (ops/segundo) sob carga",
                  "Degradação de performance com aumento do número de partições",
                ].map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <BarChart2 size={11} className="text-yellow-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TESTING ──────────────────────────────────────────────────── */}
        {tab === "testing" && (
          <div className="space-y-4">
            <SectionTitle icon={CheckCircle} text="Capítulo 9 — Test Review" color="green" />
            <div className="space-y-2">
              {TEST_COVERAGE.map(item => (
                <div key={item.type} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{item.type}</p>
                    <p className="text-xs text-zinc-500 font-mono">Mínimo: {item.min}</p>
                  </div>
                  <BlockerBadge blocker={item.blocker} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DOCUMENTATION ────────────────────────────────────────────── */}
        {tab === "documentation" && (
          <div className="space-y-4">
            <SectionTitle icon={FileText} text="Capítulo 10 — Documentation Review" color="blue" />
            <div className="space-y-2">
              {[
                { art: "JSDoc nos métodos públicos", criterion: "100% dos métodos", req: true },
                { art: "Referências à Foundation", criterion: "Ex: 'MRS Cap.3' em comentários", req: true },
                { art: "@throws documentado", criterion: "Para todo erro que pode ser lançado", req: true },
                { art: "@returns documentado", criterion: "Para todo retorno não óbvio", req: true },
                { art: "CHANGELOG de breaking changes", criterion: "Para cada alteração de interface", req: true },
                { art: "README do módulo", criterion: "Descrição, responsabilidades, uso", req: false },
                { art: "Exemplos de uso", criterion: "Pelo menos 1 por interface pública", req: false },
              ].map(item => (
                <div key={item.art} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{item.art}</p>
                    <p className="text-xs text-zinc-500">{item.criterion}</p>
                  </div>
                  <BlockerBadge blocker={item.req} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SCORE ────────────────────────────────────────────────────── */}
        {tab === "score" && (
          <div className="space-y-4">
            <SectionTitle icon={Target} text="Capítulo 11 — Engineering Score" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Dimensões e Pesos</h3>
              <div className="space-y-2">
                {QUALITY_DIMENSIONS.map(d => (
                  <div key={d.dim} className="flex items-center gap-3">
                    <span className="text-zinc-400 text-sm w-48 shrink-0">{d.dim}</span>
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${d.weight * 5}%` }} />
                    </div>
                    <span className="text-violet-400 font-mono text-xs w-8 text-right">{d.weight}%</span>
                    <span className="text-zinc-600 font-mono text-xs w-12 text-right">min {d.min}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Fórmula</h3>
              <div className="bg-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1">
                <p>Overall Score = Σ (dimensão_score × peso)</p>
                <p className="text-zinc-500">Sprint Gate PASS = ALL(score ≥ mínimo) AND Overall ≥ 87</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Histórico por Sprint</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="pb-2 text-left">Sprint</th>
                    <th className="pb-2 text-center">Overall</th>
                    <th className="pb-2 text-center">Arch</th>
                    <th className="pb-2 text-center">Foundation</th>
                    <th className="pb-2 text-center">Security</th>
                    <th className="pb-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SPRINT_HISTORY.map(s => (
                    <tr key={s.sprint}>
                      <td className="py-2 text-zinc-300">{s.sprint}</td>
                      <td className="py-2 text-center font-bold text-violet-400">{s.overall}</td>
                      <td className="py-2 text-center text-zinc-400 font-mono text-xs">{s.arch}</td>
                      <td className="py-2 text-center text-zinc-400 font-mono text-xs">{s.foundation}</td>
                      <td className="py-2 text-center text-zinc-400 font-mono text-xs">{s.security}</td>
                      <td className="py-2 text-yellow-400 text-xs font-mono">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-zinc-600 mt-2">* Aprovado com ressalvas — Foundation e Architecture abaixo do mínimo no Sprint 1. Refatorações obrigatórias antes do Sprint 2.</p>
            </div>
          </div>
        )}

        {/* ── GATES ────────────────────────────────────────────────────── */}
        {tab === "gates" && (
          <div className="space-y-4">
            <SectionTitle icon={Shield} text="Capítulo 12 — Quality Gates" color="red" />
            <div className="bg-red-950/20 border border-red-800 rounded-xl p-4">
              <h3 className="text-red-300 font-bold text-sm mb-3">Gates Absolutos — Qualquer falha = REPROVADO</h3>
              <div className="space-y-2">
                {ABSOLUTE_GATES.map((gate, i) => (
                  <div key={i} className="flex gap-2 text-sm text-red-200">
                    <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                    <span className="font-mono">{gate}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-4">
              <h3 className="text-yellow-300 font-bold text-sm mb-3">Aprovação com Ressalvas</h3>
              <div className="space-y-1 text-sm text-zinc-300">
                {[
                  "Todos os Gates Absolutos passam",
                  "Existem melhorias classificadas como ALTA (não CRÍTICA)",
                  "Existe plano de resolução com Sprint target definido",
                  "Overall Score ≥ 85",
                ].map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <CheckCircle size={12} className="text-yellow-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SPECIALIST ───────────────────────────────────────────────── */}
        {tab === "specialist" && (
          <div className="space-y-4">
            <SectionTitle icon={Target} text="Capítulo 13 — Engineering Review Specialist" color="violet" />
            <div className="bg-gradient-to-br from-violet-950 to-zinc-900 border border-violet-700 rounded-xl p-5">
              <p className="text-xs text-violet-400 font-mono mb-0.5">Specialist Oficial — MERS v1.0</p>
              <h2 className="text-white font-bold text-lg">Engineering Review Specialist</h2>
              <p className="text-zinc-400 text-sm mt-1">Internal Specialist · Platform-wide · Quality Gate Authority</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Responsabilidades</h3>
              <div className="space-y-2">
                {[
                  ["Revisar implementações", "Análise técnica completa contra todos os critérios MERS"],
                  ["Executar MERS",           "Todos os 11 engines de revisão em cada Sprint"],
                  ["Emitir parecer técnico",  "Justificativa objetiva com evidências, não apenas scores"],
                  ["Gerar recomendações",     "Classificadas: Crítica / Alta / Média / Baixa"],
                  ["Detectar regressões",     "Comparar dimensões com Sprint anterior"],
                  ["Comparar versões",        "Identificar degradações de qualidade entre Sprints"],
                  ["Produzir MESR",           "MemoryOS Engineering Sprint Review formal"],
                ].map(([resp, desc], i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-violet-400 font-semibold w-48 shrink-0">{resp}</span>
                    <span className="text-zinc-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Formato do Parecer (template)</h3>
              <pre className="text-xs text-zinc-400 font-mono bg-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre">{`MERS Review — Sprint N
========================
Overall Score: XX.X/100
Status: APROVADO | APROVADO COM RESSALVAS | REPROVADO

Gates Absolutos:    PASS | FAIL
Architecture:       XX  (≥90)
Foundation:         XX  (=100)
Security:           XX  (≥95)
Quality:            XX  (≥80)
Performance:        XX  (≥85)
Testing:            XX  (≥90)
Observability:      XX  (≥85)
Documentation:      XX  (≥75)
Maintainability:    XX  (≥80)

Bloqueadores:  [lista ou "nenhum"]
Ressalvas:     [lista ou "nenhum"]
Regressões:    [lista ou "nenhum"]`}</pre>
            </div>
          </div>
        )}

        {/* ── EVOLUTION ────────────────────────────────────────────────── */}
        {tab === "evolution" && (
          <div className="space-y-4">
            <SectionTitle icon={Clock} text="Capítulo 14 — Evolução Contínua" color="blue" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Output de cada Sprint</h3>
              <div className="space-y-2">
                {[
                  ["Engineering Review Report (MESR)", "Documento técnico completo gerado automaticamente"],
                  ["Comparação com Sprint anterior",   "Delta de scores em todas as dimensões"],
                  ["Engineering Score",                 "Todas as 9 dimensões pontuadas"],
                  ["Refatorações sugeridas",            "Classificadas Critical/High/Medium/Low"],
                  ["Itens obrigatórios",                "Pré-condições para o próximo Sprint"],
                  ["Itens opcionais",                   "Melhoria contínua sem bloqueio"],
                  ["Lessons Learned",                   "Positivos, negativos, padrões, anti-padrões"],
                  ["Histórico permanente",              "Registrado no MEB para rastreabilidade"],
                ].map(([title, desc], i) => (
                  <div key={i} className="flex gap-3 text-sm border-l-2 border-violet-800 pl-3">
                    <div>
                      <p className="text-zinc-200 font-medium">{title}</p>
                      <p className="text-zinc-500 text-xs">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CYCLE ────────────────────────────────────────────────────── */}
        {tab === "cycle" && (
          <div className="space-y-4">
            <SectionTitle icon={ArrowRight} text="Capítulo 15 — Ciclo de Desenvolvimento" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-sm mb-4">Todo desenvolvimento segue obrigatoriamente este ciclo. <strong className="text-red-400">Nenhuma etapa pode ser ignorada.</strong></p>
              <div className="space-y-2">
                {DEV_CYCLE.map((step, i) => (
                  <div key={step.step}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        step.step === "MERS" ? "bg-violet-700 text-white" :
                        step.step === "Aprovação" ? "bg-green-700 text-white" :
                        "bg-zinc-800 text-zinc-400"
                      }`}>{i + 1}</div>
                      <div>
                        <p className={`text-sm font-semibold ${step.step === "MERS" ? "text-violet-300" : step.step === "Aprovação" ? "text-green-300" : "text-zinc-200"}`}>{step.step}</p>
                        <p className="text-xs text-zinc-500">{step.desc}</p>
                      </div>
                    </div>
                    {i < DEV_CYCLE.length - 1 && (
                      <div className="ml-3.5 w-px h-4 bg-zinc-800 my-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-950 to-zinc-900 border border-green-700 rounded-xl p-4">
              <h3 className="text-green-300 font-bold text-sm mb-2">Declaração Final</h3>
              <p className="text-zinc-300 text-sm">O MERS oficializa a revisão de engenharia como parte integrante do ciclo de desenvolvimento do MemoryOS. A partir desta especificação, nenhuma implementação poderá ser considerada concluída apenas por funcionar. Ela deverá demonstrar, de forma objetiva e auditável, conformidade arquitetural, qualidade técnica, segurança, desempenho, testabilidade e aderência integral à Foundation v1.0.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}