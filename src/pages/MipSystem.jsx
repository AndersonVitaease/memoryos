import React, { useState } from "react";
import {
  Map, Layers, Package, Rocket, Flag, Play,
  CheckSquare, AlertTriangle, BarChart2, FileText,
  CheckCircle, ArrowRight, Circle, Zap
} from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",     label: "Fases" },
  { id: "deps",         label: "Dependências" },
  { id: "mvp",          label: "MVP" },
  { id: "beta",         label: "Public Beta" },
  { id: "milestones",   label: "Milestones" },
  { id: "demos",        label: "Demos" },
  { id: "readiness",    label: "Prontidão" },
  { id: "risks",        label: "Riscos" },
  { id: "roadmap",      label: "Roadmap" },
];

const PHASES = [
  { id: "F0", name: "Infraestrutura",      color: "bg-zinc-700",   text: "text-zinc-300",   items: ["PostgreSQL + Redis + Docker", "EventBus Universal", "AuditTrail", "CI/CD Pipeline"] },
  { id: "F1", name: "Core",                color: "bg-blue-700",   text: "text-blue-300",   items: ["IConnector / ISpecialist", "IMemoryProvider / IEventBus", "IAuditTrail / SecurityContracts", "MRI Baseline"] },
  { id: "F2", name: "Runtime",             color: "bg-violet-700", text: "text-violet-300", items: ["ExecutionEngine", "SecurityGate", "JourneyManager", "Journey Completa (M-B)"] },
  { id: "F3", name: "Memory",              color: "bg-indigo-700", text: "text-indigo-300", items: ["WorkingMemoryEngine (M-A)", "LongTermMemory", "SemanticRetrieval"] },
  { id: "F4", name: "Planner",             color: "bg-purple-700", text: "text-purple-300", items: ["CognitiveOrchestrator", "ReasoningEngine", "DecisionEngine", "PlanningEngine"] },
  { id: "F5", name: "Connectors",          color: "bg-cyan-700",   text: "text-cyan-300",   items: ["HttpConnector (M-C)", "GovConnector", "Integração gov.br (M-E)"] },
  { id: "F6", name: "Specialists",         color: "bg-teal-700",   text: "text-teal-300",   items: ["GeneralSpecialist (M-D)", "GovernmentSpecialist"] },
  { id: "F7", name: "Developer Platform",  color: "bg-green-700",  text: "text-green-300",  items: ["SDK v1 (M-F)", "CLI", "Docs públicas"] },
  { id: "F8", name: "Marketplace",         color: "bg-yellow-700", text: "text-yellow-300", items: ["Registry público (M-G)", "Discovery API", "3+ Connectors listados"] },
  { id: "F9", name: "Public Beta",         color: "bg-orange-700", text: "text-orange-300", items: ["Todos critérios do Cap.4", "Aprovação Foundation Committee (M-H)"] },
];

const DEPS = [
  { phase: "F0", deps: [],           parallel: [] },
  { phase: "F1", deps: ["F0"],       parallel: [] },
  { phase: "F2", deps: ["F1"],       parallel: [] },
  { phase: "F3", deps: ["F2"],       parallel: [] },
  { phase: "F4", deps: ["F3"],       parallel: [] },
  { phase: "F5", deps: ["F2"],       parallel: ["F3", "F4"] },
  { phase: "F6", deps: ["F5"],       parallel: [] },
  { phase: "F7", deps: ["F6"],       parallel: [] },
  { phase: "F8", deps: ["F7"],       parallel: [] },
  { phase: "F9", deps: ["F8"],       parallel: [] },
];

const MVP_IN = [
  { item: "Runtime funcional (F2)",          why: "Base de tudo" },
  { item: "Working Memory Engine",            why: "Memória de sessão necessária" },
  { item: "Journey básica",                   why: "Fluxo mínimo de execução" },
  { item: "Security Gate",                    why: "Obrigatório em qualquer release" },
  { item: "AuditTrail",                       why: "Obrigatório para compliance" },
  { item: "1 Connector oficial (HTTP)",       why: "Necessário para demonstrar valor" },
  { item: "1 Specialist oficial (General)",   why: "Demonstrar capacidade cognitiva" },
  { item: "API pública mínima",               why: "Necessária para integração" },
];

const MVP_OUT = [
  { item: "Marketplace",                      why: "Complexidade + ecossistema pequeno" },
  { item: "SDK público completo",             why: "Requer estabilidade da API primeiro" },
  { item: "Connectors avançados (gov.br/ERP)", why: "Alta complexidade, pós-MVP" },
  { item: "Learning Engine completo",          why: "Requer dados de uso real" },
  { item: "Multi-tenant enterprise",           why: "Escopo de fase posterior" },
  { item: "Mobile nativo",                     why: "Web first" },
];

const BETA_TECH = [
  { criterion: "MRI pass rate",        threshold: "100%" },
  { criterion: "MQCCS certification",  threshold: "GOLD ou superior" },
  { criterion: "Uptime (30 dias)",     threshold: "≥ 99.5%" },
  { criterion: "Latência Journey p95", threshold: "< 3s" },
  { criterion: "Latência API p95",     threshold: "< 500ms" },
  { criterion: "Cobertura de testes",  threshold: "≥ 85%" },
  { criterion: "Vuln. críticas",       threshold: "0" },
  { criterion: "Vuln. altas",          threshold: "0 (ou mitigadas)" },
];

const MILESTONES = [
  { id: "M-A", name: "Working Memory Funcional",  color: "text-indigo-400", bg: "border-indigo-800", criteria: "WME passa 100% MRI · TTL, prioridade e IdentityContext funcionais" },
  { id: "M-B", name: "Journey Completa",           color: "text-violet-400", bg: "border-violet-800", criteria: "Journey cria, executa e finaliza · Security Gate integrado" },
  { id: "M-C", name: "Primeiro Connector",         color: "text-cyan-400",   bg: "border-cyan-800",   criteria: "HttpConnector certificado · MCF compliance · AuditTrail integrado" },
  { id: "M-D", name: "Primeiro Specialist",        color: "text-teal-400",   bg: "border-teal-800",   criteria: "GeneralSpecialist certificado · MCIS compliance · Routing funcional" },
  { id: "M-E", name: "Integração gov.br",          color: "text-green-400",  bg: "border-green-800",  criteria: "GovConnector certificado · Journey gov.br executável end-to-end" },
  { id: "M-F", name: "Developer Platform",         color: "text-yellow-400", bg: "border-yellow-800", criteria: "SDK v1 publicado · MDPS compliance · Documentação completa" },
  { id: "M-G", name: "Marketplace Funcional",      color: "text-orange-400", bg: "border-orange-800", criteria: "Registry público · Discovery API · 3+ Connectors listados" },
  { id: "M-H", name: "Public Beta",                color: "text-red-400",    bg: "border-red-800",    criteria: "Todos os critérios do Cap.4 atendidos · Aprovação Foundation Committee" },
];

const DEMOS = [
  {
    milestone: "M-A", name: "Working Memory",
    steps: ["Criar IdentityContext (user_id, project_id)", "Armazenar 5 itens com prioridades diferentes", "Recuperar itens por prioridade", "Aguardar TTL de item expirar", "Confirmar que item expirado não retorna", "Promover item para Long-Term Memory"],
  },
  {
    milestone: "M-B", name: "Journey Completa",
    steps: ["Criar Journey 'ConsultaSimples'", "Executar com input do usuário", "Security Gate valida contexto", "Execution Engine processa etapas", "Resposta gerada e retornada", "AuditTrail registra toda execução"],
  },
  {
    milestone: "M-C", name: "Connector HTTP",
    steps: ["Registrar HttpConnector no MCF Registry", "Criar Journey que usa o Connector", "Executar chamada HTTP real", "Tratar resposta e erros", "AuditTrail registra conexão", "SecurityGate valida permissões"],
  },
  {
    milestone: "M-D", name: "Specialist respondendo",
    steps: ["Criar intent do usuário", "Router seleciona GeneralSpecialist", "Specialist acessa memória e Connectors", "Resposta gerada com contexto", "Resposta entregue ao usuário", "Memória atualizada com resultado"],
  },
  {
    milestone: "M-E", name: "Consulta gov.br",
    steps: ["Usuário solicita consulta de CPF", "Journey GovBrConsulta instanciada", "GovConnector autenticado", "Consulta realizada na API gov.br", "Resultado retornado e memorizado", "Resposta entregue ao usuário"],
  },
  {
    milestone: "M-F", name: "Dev cria Connector",
    steps: ["npm install @memoryos/sdk", "Scaffoldar Connector com CLI", "Implementar interface IConnector", "Executar suite de certificação local", "Publicar no Registry", "Connector disponível no Marketplace"],
  },
  {
    milestone: "M-G", name: "Descoberta no Marketplace",
    steps: ["Acessar Marketplace", "Buscar Connector por categoria", "Ver rating, documentação, exemplos", "Instalar Connector com 1 clique", "Usar Connector em Journey", "Avaliar Connector"],
  },
  {
    milestone: "M-H", name: "End-to-end Public Beta",
    steps: ["Desenvolvedor se cadastra", "Configura projeto via Dashboard", "Instala SDK", "Cria Journey customizada", "Usa 2 Connectors + 1 Specialist", "Monitora execução no Dashboard"],
  },
];

const READINESS = [
  { criterion: "MRI pass",                  req: "SIM", threshold: "100%" },
  { criterion: "MQCCS certificate",         req: "SIM", threshold: "Qualquer nível" },
  { criterion: "MERS aprovado",             req: "SIM", threshold: "Score ≥ 70" },
  { criterion: "MADS sem Critical",         req: "SIM", threshold: "0 itens Critical" },
  { criterion: "Testes unitários",           req: "SIM", threshold: "≥ 80% cobertura" },
  { criterion: "Testes integração",          req: "SIM", threshold: "Cenários principais" },
  { criterion: "JSDoc completo",             req: "SIM", threshold: "100% funções públicas" },
  { criterion: "README atualizado",          req: "SIM", threshold: "—" },
  { criterion: "Performance validada",       req: "SIM", threshold: "Dentro do SLA" },
  { criterion: "Security Gate integrado",    req: "SIM", threshold: "—" },
  { criterion: "AuditTrail integrado",       req: "SIM", threshold: "—" },
  { criterion: "PR aprovado",               req: "SIM", threshold: "≥ 1 reviewer" },
];

const RISKS = [
  { category: "Técnico",    item: "Complexidade do WME",         prob: "Alta",   impact: "Alto",    mit: "MRI coverage total + revisões frequentes" },
  { category: "Técnico",    item: "Latência da Cognitive Pipeline", prob: "Média", impact: "Alto",  mit: "Benchmarks contínuos + fast-path para queries simples" },
  { category: "Técnico",    item: "Inconsistência de IdentityContext", prob: "Média", impact: "Crítico", mit: "Validação obrigatória em todos os pontos de entrada" },
  { category: "Técnico",    item: "Drift arquitetural acumulado", prob: "Alta",   impact: "Alto",    mit: "MADS a cada Sprint + limite de dívida técnica" },
  { category: "Integração", item: "API gov.br instável",         prob: "Alta",   impact: "Alto",    mit: "Circuit breaker + fallback + retry com backoff" },
  { category: "Integração", item: "Rate limiting de APIs externas", prob: "Alta", impact: "Médio",  mit: "Cache agressivo + queue de requests" },
  { category: "Integração", item: "Versioning de Connectors incompatível", prob: "Média", impact: "Alto", mit: "Semantic versioning + compatibility matrix" },
  { category: "Operacional", item: "Perda de dados de memória",  prob: "Baixa",  impact: "Crítico", mit: "Backup automático + replicação" },
  { category: "Operacional", item: "Vazamento de dados de usuário", prob: "Baixa", impact: "Crítico", mit: "Security Gate + auditoria + LGPD compliance" },
  { category: "Operacional", item: "Scope creep nas Fases",      prob: "Alta",   impact: "Alto",    mit: "MIP como referência + change management formal" },
];

const PROB_COLOR = { Alta: "text-red-400", Média: "text-yellow-400", Baixa: "text-green-400" };
const IMP_COLOR  = { Crítico: "text-red-400", Alto: "text-orange-400", Médio: "text-yellow-400", Baixo: "text-green-400" };

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, text, color = "violet" }) {
  const bg = { violet: "bg-violet-700", blue: "bg-blue-700", green: "bg-green-700", red: "bg-red-700", yellow: "bg-yellow-700", orange: "bg-orange-700", cyan: "bg-cyan-700", zinc: "bg-zinc-700" };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bg[color] ?? "bg-zinc-700"} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-sm md:text-base">{text}</h2>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function MipSystem() {
  const [tab, setTab] = useState("overview");
  const [openDemo, setOpenDemo] = useState(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-orange-500 flex items-center justify-center shrink-0">
              <Map size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MIP — Master Implementation Plan</h1>
              <p className="text-zinc-500 text-xs">Engineering Execution · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0", "10 Fases", "8 Milestones", "MVP Definido", "Public Beta"].map(b => (
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

        {/* ── PHASES ──────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-4">
            <SectionTitle icon={Layers} text="Capítulo 1 — Visão Geral das Fases" color="violet" />
            <div className="space-y-2">
              {PHASES.map((phase, i) => (
                <div key={phase.id}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex gap-4 items-start">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${phase.color} text-white shrink-0 mt-0.5`}>{phase.id}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${phase.text}`}>{phase.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {phase.items.map(item => (
                          <span key={item} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {i < PHASES.length - 1 && <div className="flex justify-center py-0.5"><ArrowRight size={10} className="text-zinc-700 rotate-90" /></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEPS ────────────────────────────────────────────────────── */}
        {tab === "deps" && (
          <div className="space-y-4">
            <SectionTitle icon={Zap} text="Capítulo 2 — Mapa de Dependências" color="blue" />
            <div className="bg-yellow-950/20 border border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-300 font-medium">
              Nenhuma Fase pode iniciar sem que todas as suas dependências estejam com status DONE.
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Fase</th>
                    <th className="px-4 py-2 text-left">Depende de</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Paralelo com</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {DEPS.map(d => (
                    <tr key={d.phase}>
                      <td className="px-4 py-2.5 font-mono font-bold text-violet-400">{d.phase}</td>
                      <td className="px-4 py-2.5">
                        {d.deps.length === 0
                          ? <span className="text-zinc-600 text-xs">—</span>
                          : <div className="flex gap-1">{d.deps.map(dep => <span key={dep} className="text-xs bg-red-900/30 text-red-300 border border-red-800 px-1.5 py-0.5 rounded font-mono">{dep}</span>)}</div>
                        }
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {d.parallel.length === 0
                          ? <span className="text-zinc-600 text-xs">—</span>
                          : <div className="flex gap-1">{d.parallel.map(p => <span key={p} className="text-xs bg-blue-900/30 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-mono">{p}</span>)}</div>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MVP ─────────────────────────────────────────────────────── */}
        {tab === "mvp" && (
          <div className="space-y-4">
            <SectionTitle icon={Package} text="Capítulo 3 — MVP" color="green" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-green-400 font-semibold text-sm mb-2 flex items-center gap-2"><CheckCircle size={13} /> Dentro do MVP</h3>
                <div className="space-y-1.5">
                  {MVP_IN.map(item => (
                    <div key={item.item} className="bg-green-950/20 border border-green-900/50 rounded-xl px-3 py-2">
                      <p className="text-sm text-zinc-200">{item.item}</p>
                      <p className="text-xs text-zinc-500">{item.why}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-zinc-500 font-semibold text-sm mb-2 flex items-center gap-2"><Circle size={13} /> Fora do MVP</h3>
                <div className="space-y-1.5">
                  {MVP_OUT.map(item => (
                    <div key={item.item} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                      <p className="text-sm text-zinc-400">{item.item}</p>
                      <p className="text-xs text-zinc-600">{item.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── BETA ────────────────────────────────────────────────────── */}
        {tab === "beta" && (
          <div className="space-y-4">
            <SectionTitle icon={Rocket} text="Capítulo 4 — Public Beta" color="orange" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Critérios Técnicos</p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-800/50">
                  {BETA_TECH.map(b => (
                    <tr key={b.criterion}>
                      <td className="px-4 py-2.5 text-zinc-300">{b.criterion}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-violet-400 text-xs">{b.threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Critérios de Estabilidade</p>
              <div className="space-y-1">
                {["Zero regressões nos últimos 2 Sprints","MADS drift: nenhum Critical em aberto","Dívida técnica High: ≤ 3 itens em aberto","Todos os post-mortems SEV-1/SEV-2 concluídos"].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Critérios de Segurança</p>
              <div className="space-y-1">
                {["Security Gate ativo em todos os fluxos","Penetration test básico concluído","Política de privacidade e LGPD documentadas","Processo de rotação de secrets documentado"].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MILESTONES ──────────────────────────────────────────────── */}
        {tab === "milestones" && (
          <div className="space-y-4">
            <SectionTitle icon={Flag} text="Capítulo 5 — Milestones" color="violet" />
            <div className="space-y-2">
              {MILESTONES.map(m => (
                <div key={m.id} className={`bg-zinc-900 border rounded-xl px-4 py-3 flex gap-4 items-start ${m.bg}`}>
                  <span className={`font-mono font-bold text-sm shrink-0 ${m.color}`}>{m.id}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{m.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{m.criteria}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEMOS ───────────────────────────────────────────────────── */}
        {tab === "demos" && (
          <div className="space-y-4">
            <SectionTitle icon={Play} text="Capítulo 6 — Demonstrações" color="cyan" />
            <div className="space-y-2">
              {DEMOS.map(demo => (
                <div key={demo.milestone} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <button onClick={() => setOpenDemo(openDemo === demo.milestone ? null : demo.milestone)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-violet-400 font-bold shrink-0">{demo.milestone}</span>
                      <span className="text-sm font-semibold text-zinc-200">{demo.name}</span>
                    </div>
                    <ArrowRight size={12} className={`text-zinc-600 transition-transform ${openDemo === demo.milestone ? "rotate-90" : ""}`} />
                  </button>
                  {openDemo === demo.milestone && (
                    <div className="border-t border-zinc-800 px-4 py-3">
                      <div className="space-y-1">
                        {demo.steps.map((step, i) => (
                          <div key={step} className="flex gap-3 text-sm">
                            <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{i + 1}.</span>
                            <span className="text-zinc-300">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── READINESS ───────────────────────────────────────────────── */}
        {tab === "readiness" && (
          <div className="space-y-4">
            <SectionTitle icon={CheckSquare} text="Capítulo 7 — Critérios de Prontidão" color="green" />
            <div className="bg-green-950/20 border border-green-900/50 rounded-xl px-4 py-3 text-sm text-green-300 font-medium">
              Uma funcionalidade é considerada PRONTA apenas quando todos os critérios abaixo estão satisfeitos.
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Critério</th>
                    <th className="px-4 py-2 text-center">Obrigatório</th>
                    <th className="px-4 py-2 text-right hidden md:table-cell">Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {READINESS.map(r => (
                    <tr key={r.criterion}>
                      <td className="px-4 py-2.5 text-zinc-200">{r.criterion}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs bg-green-900/30 text-green-400 border border-green-800 px-1.5 py-0.5 rounded font-mono">{r.req}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-400 text-xs hidden md:table-cell font-mono">{r.threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RISKS ───────────────────────────────────────────────────── */}
        {tab === "risks" && (
          <div className="space-y-4">
            <SectionTitle icon={AlertTriangle} text="Capítulo 8 — Riscos" color="red" />
            {["Técnico", "Integração", "Operacional"].map(cat => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{cat}</h3>
                <div className="space-y-1.5">
                  {RISKS.filter(r => r.category === cat).map(r => (
                    <div key={r.item} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-sm font-semibold text-zinc-200 flex-1">{r.item}</p>
                        <span className={`text-xs font-mono ${PROB_COLOR[r.prob]}`}>P:{r.prob}</span>
                        <span className={`text-xs font-mono ${IMP_COLOR[r.impact]}`}>I:{r.impact}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">↳ {r.mit}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ROADMAP ─────────────────────────────────────────────────── */}
        {tab === "roadmap" && (
          <div className="space-y-4">
            <SectionTitle icon={BarChart2} text="Capítulo 9 — Roadmap Executivo" color="violet" />
            <div className="space-y-1">
              {PHASES.map((phase, i) => {
                const milestone = MILESTONES.find(m => {
                  const map = { F2: "M-B", F3: "M-A", F5: "M-C", F6: "M-D", F7: "M-F", F8: "M-G", F9: "M-H" };
                  return map[phase.id] === m.id;
                });
                return (
                  <div key={phase.id}>
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 rounded-xl px-4 py-3 border border-zinc-800 flex items-center justify-between gap-3 ${phase.color} bg-opacity-10 bg-zinc-900`}>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${phase.color} text-white shrink-0`}>{phase.id}</span>
                          <span className={`text-sm font-semibold ${phase.text}`}>{phase.name}</span>
                        </div>
                        {milestone && (
                          <span className={`text-xs font-mono font-bold shrink-0 ${milestone.color}`}>← {milestone.id}</span>
                        )}
                      </div>
                    </div>
                    {i < PHASES.length - 1 && <div className="flex justify-center py-0.5"><ArrowRight size={10} className="text-zinc-700 rotate-90" /></div>}
                  </div>
                );
              })}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Declaração Final</h3>
              <div className="space-y-1 text-sm">
                {[
                  ["Foundation", "define a plataforma"],
                  ["MEB",        "define as tasks"],
                  ["MEOM",       "define como a equipe trabalha"],
                  ["MIP",        "define o que construir, em que ordem e quando considerar pronto"],
                ].map(([name, desc]) => (
                  <div key={name} className="flex gap-2 text-zinc-400">
                    <span className="text-violet-400 font-semibold shrink-0">{name}</span>— {desc}
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