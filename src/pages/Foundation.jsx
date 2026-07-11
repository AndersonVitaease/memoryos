import React, { useState } from "react";
import { CheckCircle, BookOpen, FileText, Layers, Cpu, Shield, GitBranch, Map, ChevronRight, ExternalLink, Archive } from "lucide-react";

const FOUNDATION_DOCS = [
  {
    category: "Visão",
    color: "violet",
    icon: "👁",
    docs: [{ id: "MV", name: "Memory Vision", desc: "Visão estratégica da plataforma", path: "vision/MV.md" }],
  },
  {
    category: "Produto",
    color: "blue",
    icon: "📦",
    docs: [{ id: "MPS", name: "Memory Product Specification", desc: "Definição do produto", path: "product/MPS.md" }],
  },
  {
    category: "Arquitetura",
    color: "cyan",
    icon: "🏗",
    docs: [
      { id: "MAS", name: "Memory Architecture Specification", desc: "Arquitetura geral", path: "architecture/MAS.md" },
      { id: "MDS", name: "Memory Developer Specification", desc: "Manual de implementação (v1.6)", path: "architecture/MDS.md" },
      { id: "MRS", name: "Memory Runtime Specification", desc: "Ciclo de vida de execução", path: "architecture/MRS.md" },
      { id: "MCS", name: "Memory Core Specification", desc: "Limites permanentes do Core", path: "architecture/MCS.md" },
    ],
  },
  {
    category: "Inteligência",
    color: "purple",
    icon: "🧠",
    docs: [
      { id: "MDIS", name: "Memory Decision Intelligence Spec", desc: "Inteligência Decisória", path: "intelligence/MDIS.md" },
      { id: "MIES", name: "Memory Intelligence Evolution Spec", desc: "Evolução Cognitiva", path: "intelligence/MIES.md" },
    ],
  },
  {
    category: "Plataforma",
    color: "emerald",
    icon: "⚙️",
    docs: [
      { id: "MDPS", name: "Memory Developer Platform Spec", desc: "Plataforma para desenvolvedores", path: "platform/MDPS.md" },
      { id: "MGFS", name: "Memory Governance & Foundation Spec", desc: "Governança geral", path: "platform/MGFS.md" },
      { id: "MRI",  name: "Memory Reference Implementation", desc: "Implementação de referência", path: "platform/MRI.md" },
      { id: "MQCCS",name: "Memory Quality & Certification Spec", desc: "Qualidade e certificação", path: "platform/MQCCS.md" },
      { id: "MPEGS",name: "Memory Platform Evolution Governance", desc: "Governança da evolução", path: "platform/MPEGS.md" },
    ],
  },
];

const RFC_REGISTRY = [
  { id: "RFC-000", title: "Meta-RFC — Governance of Foundation Governance", status: "Accepted", date: "2026-07-08" },
  { id: "RFC-001", title: "Foundation v1.0 Baseline Declaration", status: "Accepted", date: "2026-07-08" },
  { id: "RFC-002", title: "Minimum Sufficient Context Principle (MSC)", status: "Accepted", date: "2026-07-11" },
  { id: "RFC-003", title: "Adaptive Communication Principle (ACP)", status: "Accepted", date: "2026-07-11" },
  { id: "RFC-004", title: "Gap Analysis Principle (GAP)", status: "Draft", date: "2026-07-11" },
];

const DEPENDENCY_CHAIN = ["MV","MPS","MAS","MDS","MRS","MCS","MDIS","MIES","MDPS","MGFS","MRI","MQCCS","MPEGS"];

const EVOLUTION_FLOW = ["RFC","Discussão","ADR","Implementação","MRI","MQCCS","Release","Monitoramento","Nova RFC"];

const ENGINEERING_PRIORITIES = [
  { n: 1, label: "Core Complete", status: "in_progress" },
  { n: 2, label: "Runtime", status: "in_progress" },
  { n: 3, label: "SDKs", status: "in_progress" },
  { n: 4, label: "Connectors Oficiais", status: "partial" },
  { n: 5, label: "Specialists Oficiais", status: "partial" },
  { n: 6, label: "Knowledge Packages", status: "planned" },
  { n: 7, label: "Marketplace", status: "planned" },
  { n: 8, label: "Developer Portal", status: "planned" },
  { n: 9, label: "Capability Registry", status: "planned" },
  { n: 10, label: "Beta", status: "planned" },
];

const statusStyle = {
  in_progress: "bg-blue-900/50 text-blue-300 border-blue-700",
  partial:     "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  planned:     "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const statusLabel = {
  in_progress: "Em Progresso",
  partial:     "Parcial",
  planned:     "Planejado",
};

const colorMap = {
  violet: "border-violet-800 bg-violet-950/30",
  blue:   "border-blue-800 bg-blue-950/30",
  cyan:   "border-cyan-800 bg-cyan-950/30",
  purple: "border-purple-800 bg-purple-950/30",
  emerald:"border-emerald-800 bg-emerald-950/30",
};

const badgeMap = {
  violet: "bg-violet-900/60 text-violet-300",
  blue:   "bg-blue-900/60 text-blue-300",
  cyan:   "bg-cyan-900/60 text-cyan-300",
  purple: "bg-purple-900/60 text-purple-300",
  emerald:"bg-emerald-900/60 text-emerald-300",
};

export default function Foundation() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview",    label: "Visão Geral",     icon: <Layers size={14} /> },
    { id: "library",     label: "Biblioteca",      icon: <BookOpen size={14} /> },
    { id: "rfcs",        label: "RFCs",            icon: <FileText size={14} /> },
    { id: "graph",       label: "Dep. Graph",      icon: <GitBranch size={14} /> },
    { id: "evolution",   label: "Evolução",        icon: <Map size={14} /> },
    { id: "engineering", label: "Eng. First",      icon: <Cpu size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950 to-blue-950 border border-violet-700 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Archive size={20} className="text-violet-400" />
                <span className="text-violet-300 text-sm font-mono">Foundation Repository</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">MemoryOS Foundation</h1>
              <p className="text-zinc-400 text-sm max-w-lg">
                Baseline arquitetural oficial da plataforma. 13 especificações aprovadas. Fase Engineering First iniciada.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-white font-mono">v1.0.0</div>
              <span className="inline-block mt-1 bg-green-900 text-green-400 text-xs font-bold px-3 py-1 rounded-full border border-green-700">
                FROZEN BASELINE
              </span>
              <div className="text-zinc-500 text-xs mt-1">2026-07-10</div>
            </div>
          </div>

          {/* Doc pills */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {DEPENDENCY_CHAIN.map(d => (
              <span key={d} className="text-xs bg-violet-900/50 text-violet-300 px-2 py-0.5 rounded font-mono border border-violet-800">
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? "bg-violet-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Especificações", value: "13", color: "text-violet-400" },
                { label: "Status",         value: "Frozen", color: "text-green-400" },
                { label: "Fase",           value: "Eng. First", color: "text-blue-400" },
                { label: "RFC Base",       value: "RFC-000", color: "text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Invariants */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Shield size={16} className="text-violet-400" />
                Invariantes Permanentes
              </h2>
              <div className="space-y-2">
                {[
                  "Nenhum documento da Foundation é alterado sem RFC aprovada",
                  "Toda evolução usa semver — MAJOR exige RFC crítica",
                  "Toda decisão é rastreável ao seu ADR de origem",
                  "Depreciações exigem período mínimo de 6 meses",
                  "O Core nunca conhece implementações concretas",
                  "Toda ação de alto risco exige aprovação humana",
                  "AuditTrail é imutável e append-only",
                  "A biblioteca só cresce; nunca diminui",
                  "O contexto deverá ser sempre o mínimo suficiente — nunca menor, nunca maior",
                  "O sistema adapta a comunicação, nunca a verdade — fatos e recomendações são invariantes",
                  "Toda evolução arquitetural da Foundation deverá ser sustentada por evidências de implementação prática",
                ].map((inv, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {inv}
                  </div>
                ))}
              </div>
            </div>

            {/* Traceability */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <GitBranch size={16} className="text-blue-400" />
                Rastreabilidade Oficial
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left pb-2">Origem</th>
                      <th className="text-left pb-2">Processo</th>
                      <th className="text-left pb-2">Artefato</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {[
                      ["Necessidade de negócio", "RFC", "Proposta formal"],
                      ["RFC aprovada", "ADR", "Decisão documentada"],
                      ["ADR aceito", "Implementação", "Código real"],
                      ["Implementação", "MRI", "Validação de referência"],
                      ["MRI passa", "MQCCS", "Certificação"],
                      ["MQCCS certifica", "Release", "Versão publicada"],
                      ["Release monitorada", "Feedback", "Nova RFC (se necessário)"],
                    ].map(([origem, proc, artefato], i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="py-1.5 text-zinc-400">{origem}</td>
                        <td className="py-1.5"><span className="text-violet-300 font-mono text-xs bg-violet-900/30 px-1.5 py-0.5 rounded">{proc}</span></td>
                        <td className="py-1.5 text-zinc-300">{artefato}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Library */}
        {activeTab === "library" && (
          <div className="space-y-4">
            {FOUNDATION_DOCS.map(group => (
              <div key={group.category} className={`border rounded-xl p-4 ${colorMap[group.color]}`}>
                <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <span>{group.icon}</span>
                  {group.category}
                </h2>
                <div className="space-y-2">
                  {group.docs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between bg-zinc-900/60 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${badgeMap[group.color]}`}>
                          {doc.id}
                        </span>
                        <div>
                          <div className="text-sm text-white font-medium">{doc.name}</div>
                          <div className="text-xs text-zinc-500">{doc.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded border border-green-800">Frozen</span>
                        <CheckCircle size={14} className="text-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RFCs */}
        {activeTab === "rfcs" && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
                <FileText size={14} className="text-violet-400" />
                <span className="text-sm font-semibold text-zinc-200">RFC Registry — Foundation v1.0</span>
              </div>
              <div className="p-4 space-y-2">
                {RFC_REGISTRY.map(rfc => (
                  <div key={rfc.id} className="bg-zinc-800/50 rounded-xl p-3 flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono font-bold bg-violet-900/60 text-violet-300 px-2 py-0.5 rounded">{rfc.id}</span>
                        <span className="text-xs bg-green-900/40 text-green-300 border border-green-800 px-2 py-0.5 rounded font-mono">{rfc.status}</span>
                      </div>
                      <p className="text-sm text-zinc-200 mt-1">{rfc.title}</p>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0">{rfc.date}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-emerald-950/20 border border-emerald-800 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-300 mb-1">RFC-004 — Gap Analysis Principle (GAP) <span className="text-xs text-yellow-400 font-mono ml-2">Draft</span></p>
              <p className="text-xs text-zinc-400 mb-2"><strong className="text-yellow-300">Hipótese arquitetural</strong> — aguardando validação durante Engineering First. Não promover para Accepted por mérito conceitual. Avaliar se surge naturalmente como responsabilidade do PIE.</p>
              <div className="flex flex-wrap gap-1.5">
                {["Validar no PIE","Validar no Goal Engine","Validar no Planner","Validar no SFE","Validar no Connector Runtime"].map(c => (
                  <span key={c} className="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-800/50 px-2 py-0.5 rounded font-mono">{c}</span>
                ))}
              </div>
            </div>

            <div className="bg-blue-950/20 border border-blue-800 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-300 mb-1">RFC-003 — Adaptive Communication Principle (ACP)</p>
              <p className="text-xs text-zinc-400 mb-2">Princípio oficial: <strong className="text-zinc-200">"O MemoryOS adapta a comunicação, nunca a verdade."</strong> Fatos, evidências e recomendações são invariantes. Somente forma, vocabulário, profundidade e formato são adaptáveis.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-2">
                {["Profundidade","Vocabulário","Nível de Detalhe","Exemplos","Ritmo","Formato"].map(c => (
                  <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{c}</span>
                ))}
              </div>
              <p className="text-xs text-zinc-500">Hipóteses de perfil baseadas em evidências observáveis · Nível de confiança obrigatório · Continuamente atualizáveis</p>
            </div>

            <div className="bg-violet-950/20 border border-violet-800 rounded-xl p-4">
              <p className="text-xs font-bold text-violet-300 mb-1">RFC-002 — Minimum Sufficient Context (MSC)</p>
              <p className="text-xs text-zinc-400 mb-2">Princípio oficial: o sistema deverá sempre construir o <strong className="text-zinc-200">menor contexto suficiente</strong> capaz de preservar precisão, segurança, explicabilidade e qualidade da decisão.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {["Goal Engine","Context Builder","Planner","PIE","Specialist Router","Strategy Fusion Engine","Working Memory","Connector Runtime"].map(c => (
                  <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{c}</span>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-violet-800/40">
                <p className="text-xs font-semibold text-zinc-400 mb-1">Semantic Context Compression</p>
                <p className="text-xs text-zinc-500">Transformar grandes volumes de conhecimento em um conjunto mínimo de fatos relevantes preservando o significado necessário para tomada de decisão.</p>
              </div>
            </div>
          </div>
        )}

        {/* Dependency Graph */}
        {activeTab === "graph" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
              <GitBranch size={16} className="text-violet-400" />
              Dependency Graph — Foundation v1.0
            </h2>
            <div className="flex flex-col items-center gap-0">
              {DEPENDENCY_CHAIN.map((doc, i) => (
                <React.Fragment key={doc}>
                  <div className="flex items-center gap-3">
                    <div className="w-24 text-right text-xs text-zinc-500 font-mono">
                      {["Visão","Produto","Arquitetura","Dev Spec","Runtime","Core","Decision","Evolution","DevPlatform","Governance","Ref Impl","Quality","Gov"][i]}
                    </div>
                    <div className={`px-5 py-2 rounded-lg font-mono font-bold text-sm border ${
                      i === 0 ? "bg-violet-900/60 text-violet-300 border-violet-700" :
                      i < 3   ? "bg-blue-900/60 text-blue-300 border-blue-700" :
                      i < 6   ? "bg-cyan-900/60 text-cyan-300 border-cyan-700" :
                      i < 8   ? "bg-purple-900/60 text-purple-300 border-purple-700" :
                      "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    }`}>
                      {doc}
                    </div>
                    <div className="w-32 text-xs text-zinc-600 font-mono">
                      {i < DEPENDENCY_CHAIN.length - 1 ? "depende de ↑" : "← raiz"}
                    </div>
                  </div>
                  {i < DEPENDENCY_CHAIN.length - 1 && (
                    <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>
                  )}
                </React.Fragment>
              ))}
              <div className="mt-4 flex items-center gap-2 text-zinc-500">
                <div className="h-px w-16 bg-zinc-700"></div>
                <span className="text-xs font-mono">RFC → ADR → Release</span>
                <div className="h-px w-16 bg-zinc-700"></div>
              </div>
            </div>
          </div>
        )}

        {/* Evolution Flow */}
        {activeTab === "evolution" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
                <Map size={16} className="text-blue-400" />
                Processo de Evolução Obrigatório
              </h2>
              <div className="flex flex-col items-center gap-0">
                {EVOLUTION_FLOW.map((step, i) => (
                  <React.Fragment key={step}>
                    <div className={`px-6 py-2.5 rounded-xl font-semibold text-sm border w-48 text-center ${
                      step === "RFC"    ? "bg-violet-900/60 text-violet-300 border-violet-700" :
                      step === "ADR"    ? "bg-blue-900/60 text-blue-300 border-blue-700" :
                      step === "MRI"    ? "bg-cyan-900/60 text-cyan-300 border-cyan-700" :
                      step === "MQCCS"  ? "bg-yellow-900/60 text-yellow-300 border-yellow-700" :
                      step === "Release"? "bg-green-900/60 text-green-300 border-green-700" :
                      "bg-zinc-800 text-zinc-300 border-zinc-700"
                    }`}>
                      {step}
                    </div>
                    {i < EVOLUTION_FLOW.length - 1 && (
                      <div className="text-zinc-600 text-lg leading-none my-1">↓</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Templates */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <FileText size={16} className="text-emerald-400" />
                Templates Oficiais
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { name: "RFC_TEMPLATE", desc: "Propor uma evolução" },
                  { name: "ADR_TEMPLATE", desc: "Documentar uma decisão" },
                  { name: "SDK_TEMPLATE", desc: "Criar um novo SDK" },
                  { name: "CONNECTOR_TEMPLATE", desc: "Criar um Connector" },
                  { name: "SPECIALIST_TEMPLATE", desc: "Criar um Specialist" },
                  { name: "POLICY_TEMPLATE", desc: "Definir uma Policy" },
                  { name: "KNOWLEDGE_PACKAGE_TEMPLATE", desc: "Criar um Knowledge Package" },
                ].map(t => (
                  <div key={t.name} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-2.5">
                    <FileText size={14} className="text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-sm text-white font-mono">{t.name}.md</div>
                      <div className="text-xs text-zinc-500">{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Engineering First */}
        {activeTab === "engineering" && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-950 to-cyan-950 border border-blue-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={18} className="text-blue-400" />
                <h2 className="text-white font-bold text-lg">Fase: Engineering First</h2>
              </div>
              <p className="text-blue-300 text-sm">
                A Foundation está congelada. O foco passa a ser implementação real, validada pelo MRI e certificada pelo MQCCS.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Prioridades de Implementação</h2>
              <div className="space-y-2">
                {ENGINEERING_PRIORITIES.map(p => (
                  <div key={p.n} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                      {p.n}
                    </div>
                    <div className="flex-1 text-sm text-zinc-200">{p.label}</div>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusStyle[p.status]}`}>
                      {statusLabel[p.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Milestones */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Milestones</h2>
              <div className="space-y-2">
                {[
                  { id: "M1", label: "Foundation v1.0",   date: "2026-07-10", done: true  },
                  { id: "M2", label: "Core Complete",      date: "Q3 2026",    done: false },
                  { id: "M3", label: "SDK v1.0",           date: "Q3 2026",    done: false },
                  { id: "M4", label: "First Connectors",   date: "Q4 2026",    done: false },
                  { id: "M5", label: "Beta",               date: "Q1 2027",    done: false },
                ].map(m => (
                  <div key={m.id} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-xs font-mono font-bold text-zinc-500 w-8">{m.id}</span>
                    <div className="flex-1 text-sm text-zinc-200">{m.label}</div>
                    <span className="text-xs text-zinc-500">{m.date}</span>
                    {m.done
                      ? <CheckCircle size={16} className="text-green-500 shrink-0" />
                      : <div className="w-4 h-4 rounded-full border-2 border-zinc-600 shrink-0" />
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}