import React, { useState } from "react";
import { Zap, CheckCircle, XCircle, ArrowRight, Shield, Package, RotateCcw, AlertTriangle, FileText } from "lucide-react";

const APPROVED_ARTIFACTS = [
  "Foundation v1.0", "MV", "MPS", "MAS", "MDS", "MRS", "MCS",
  "MDIS", "MIES", "MDPS", "MGFS", "MRI", "MQCCS", "MPEGS",
  "MPAR", "MREM", "MEB", "MERS", "MADS", "MEOM", "MDOK", "MIP", "RFC-001",
];

const DIRECTIVES_NO = [
  "Criar novos documentos estruturais",
  "Expandir a Foundation",
  "Criar novos motores sem necessidade comprovada",
  "Alterar a arquitetura sem RFC aprovada",
];

const SPRINT_STEPS = [
  { n: 1,  label: "Analisar dependências" },
  { n: 2,  label: "Planejar a implementação" },
  { n: 3,  label: "Implementar código de produção" },
  { n: 4,  label: "Executar MRI" },
  { n: 5,  label: "Executar MQCCS" },
  { n: 6,  label: "Executar MERS" },
  { n: 7,  label: "Executar MADS" },
  { n: 8,  label: "Corrigir todos os problemas encontrados" },
  { n: 9,  label: "Reexecutar todas as validações" },
  { n: 10, label: "Sprint concluída ✓" },
];

const CYCLE = [
  "Backlog", "Sprint", "Planejamento", "Implementação",
  "MRI", "MQCCS", "MERS", "MADS", "Correções",
  "Nova Validação", "Merge", "Release", "Monitoramento", "Próxima Sprint",
];

const BLOCKERS = [
  "MRI reprovado",
  "MQCCS reprovado",
  "MERS abaixo do mínimo",
  "MADS com Critical aberto",
  "Vulnerabilidades críticas",
  "Quebra de compatibilidade",
  "Documentação desatualizada",
];

const DELIVERABLES = [
  "Código implementado",
  "Estrutura de arquivos criada",
  "Testes automatizados",
  "Cobertura obtida",
  "Resultado do MRI",
  "Resultado do MQCCS",
  "Resultado do MERS",
  "Resultado do MADS",
  "Performance validada",
  "Auditoria registrada",
  "Documentação atualizada",
  "CHANGELOG atualizado",
  "Lições aprendidas",
];

const RESPONSIBILITIES = {
  before: [
    "Verificar dependências",
    "Verificar impacto arquitetural",
    "Verificar compatibilidade",
    "Verificar interfaces",
    "Verificar segurança",
  ],
  after: [
    "Gerar testes",
    "Atualizar documentação",
    "Validar performance",
    "Validar segurança",
    "Validar observabilidade",
  ],
};

export default function MeemSystem() {
  const [activeTab, setActiveTab] = useState("declaration");

  const tabs = [
    { id: "declaration", label: "Declaração" },
    { id: "directives",  label: "Diretrizes" },
    { id: "cycle",       label: "Ciclo" },
    { id: "sprint",      label: "Sprint" },
    { id: "quality",     label: "Qualidade" },
    { id: "decision",    label: "Decisão" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shrink-0">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MEEM — Engineering Execution Mode</h1>
              <p className="text-zinc-500 text-xs">Transição Oficial · Foundation v1.0 Estável · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0", "Foundation ESTÁVEL", "23 Artefatos Aprovados", "Modo Engenharia ATIVO"].map(b => (
              <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
            ))}
          </div>
        </div>

        {/* Status Banner */}
        <div className="bg-gradient-to-r from-orange-950 to-red-950 border border-orange-700 rounded-xl p-4 mb-6 flex items-center gap-4">
          <Zap size={20} className="text-orange-400 shrink-0" />
          <div>
            <p className="text-orange-200 font-bold text-sm">Engineering Execution Mode — ATIVO</p>
            <p className="text-zinc-400 text-xs mt-0.5">Foundation v1.0 consolidada. Foco: implementação incremental, validação contínua e entrega de software de produção.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 mb-6 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${activeTab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── DECLARATION ────────────────────────────────────────────── */}
        {activeTab === "declaration" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-700 flex items-center justify-center shrink-0">
                <FileText size={15} className="text-white" />
              </div>
              <h2 className="text-white font-bold text-sm">Artefatos Oficialmente Aprovados</h2>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Os seguintes artefatos compõem oficialmente a Foundation do MemoryOS:</p>
              <div className="flex flex-wrap gap-2">
                {APPROVED_ARTIFACTS.map(a => (
                  <span key={a} className="flex items-center gap-1 text-xs bg-orange-950/40 text-orange-300 border border-orange-800/50 px-2 py-1 rounded font-mono">
                    <CheckCircle size={9} className="text-orange-400" />{a}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-5">
              <p className="text-zinc-200 font-semibold text-sm mb-1">Declaração Final</p>
              <p className="text-zinc-400 text-sm leading-relaxed">
                A Foundation v1.0 é estável. O foco do projeto passa oficialmente da <span className="text-zinc-200 font-semibold">especificação</span> para a <span className="text-orange-300 font-semibold">engenharia</span>. O sucesso do MemoryOS será medido pela qualidade do software entregue, estabilidade da plataforma, satisfação dos usuários e capacidade de evoluir continuamente sem comprometer os princípios da Foundation.
              </p>
            </div>
          </div>
        )}

        {/* ── DIRECTIVES ─────────────────────────────────────────────── */}
        {activeTab === "directives" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Proibido a partir de agora</p>
              {DIRECTIVES_NO.map(d => (
                <div key={d} className="bg-red-950/20 border border-red-900/50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <XCircle size={14} className="text-red-400 shrink-0" />
                  <span className="text-sm text-zinc-300">{d}</span>
                </div>
              ))}
            </div>
            <div className="bg-green-950/20 border border-green-900/50 rounded-xl px-4 py-3 flex items-center gap-3">
              <CheckCircle size={14} className="text-green-400 shrink-0" />
              <span className="text-sm text-zinc-300">Toda evolução ocorrerá através da <strong className="text-green-300">implementação do produto</strong></span>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Antes de implementar</p>
              <div className="space-y-1.5">
                {RESPONSIBILITIES.before.map(r => (
                  <div key={r} className="flex gap-2 text-sm text-zinc-300">
                    <ArrowRight size={12} className="text-violet-400 mt-0.5 shrink-0" />{r}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Após implementar</p>
              <div className="space-y-1.5">
                {RESPONSIBILITIES.after.map(r => (
                  <div key={r} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{r}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CYCLE ──────────────────────────────────────────────────── */}
        {activeTab === "cycle" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-700 flex items-center justify-center shrink-0">
                <RotateCcw size={15} className="text-white" />
              </div>
              <h2 className="text-white font-bold text-sm">Ciclo Oficial de Desenvolvimento</h2>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {CYCLE.map((step, i) => {
                const isQuality = ["MRI","MQCCS","MERS","MADS"].includes(step);
                const isMerge   = ["Merge","Release"].includes(step);
                return (
                  <React.Fragment key={step}>
                    <span className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                      isQuality ? "bg-violet-900/50 text-violet-300 border border-violet-700" :
                      isMerge   ? "bg-green-900/50 text-green-300 border border-green-700" :
                      "bg-zinc-800 text-zinc-300"
                    }`}>{step}</span>
                    {i < CYCLE.length - 1 && <ArrowRight size={10} className="text-zinc-700 shrink-0" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SPRINT ─────────────────────────────────────────────────── */}
        {activeTab === "sprint" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-green-700 flex items-center justify-center shrink-0">
                <Package size={15} className="text-white" />
              </div>
              <h2 className="text-white font-bold text-sm">Modo de Operação por Sprint</h2>
            </div>

            <div className="space-y-1.5">
              {SPRINT_STEPS.map((s, i) => {
                const isValidation = [4,5,6,7].includes(s.n);
                const isDone = s.n === 10;
                return (
                  <div key={s.n}>
                    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                      isDone       ? "bg-green-950/30 border-green-800" :
                      isValidation ? "bg-violet-950/30 border-violet-800" :
                      "bg-zinc-900 border-zinc-800"
                    }`}>
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        isDone       ? "bg-green-600 text-white" :
                        isValidation ? "bg-violet-700 text-white" :
                        "bg-zinc-700 text-zinc-300"
                      }`}>{s.n}</span>
                      <span className={`text-sm ${isDone ? "text-green-300 font-semibold" : isValidation ? "text-violet-300" : "text-zinc-200"}`}>{s.label}</span>
                    </div>
                    {i < SPRINT_STEPS.length - 1 && <div className="flex justify-center py-0.5"><ArrowRight size={10} className="text-zinc-700 rotate-90" /></div>}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Entregáveis Obrigatórios por Sprint</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {DELIVERABLES.map((d, i) => (
                  <div key={d} className="flex gap-2 text-sm text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                    <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{String(i+1).padStart(2,"0")}</span>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── QUALITY ────────────────────────────────────────────────── */}
        {activeTab === "quality" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-700 flex items-center justify-center shrink-0">
                <Shield size={15} className="text-white" />
              </div>
              <h2 className="text-white font-bold text-sm">Critérios de Bloqueio de Sprint</h2>
            </div>
            <div className="bg-red-950/20 border border-red-900/50 rounded-xl px-4 py-3 mb-2">
              <p className="text-red-300 font-semibold text-sm">Nenhuma Sprint pode ser concluída com qualquer item abaixo presente:</p>
            </div>
            <div className="space-y-2">
              {BLOCKERS.map(b => (
                <div key={b} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <XCircle size={14} className="text-red-400 shrink-0" />
                  <span className="text-sm text-zinc-200">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DECISION ───────────────────────────────────────────────── */}
        {activeTab === "decision" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-yellow-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={15} className="text-white" />
              </div>
              <h2 className="text-white font-bold text-sm">Modo de Decisão — Limitações Encontradas</h2>
            </div>
            <div className="space-y-3">
              <div className="bg-red-950/20 border border-red-900/50 rounded-xl px-4 py-3 flex gap-3">
                <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">NÃO modificar automaticamente a arquitetura</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Mesmo que a limitação pareça óbvia de corrigir</p>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-zinc-200">Gerar recomendação técnica contendo:</p>
                {["Problema identificado", "Impacto na plataforma", "Alternativas consideradas", "Justificativa da recomendação"].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <ArrowRight size={12} className="text-yellow-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
              <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl px-4 py-3 flex gap-3">
                <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-300">Se a mudança for estrutural → Abrir RFC</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Seguir o processo MPEGS: RFC → ADR → Implementação</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}