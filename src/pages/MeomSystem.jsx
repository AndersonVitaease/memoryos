import React, { useState } from "react";
import {
  BookOpen, Users, GitBranch, RefreshCw, BarChart2,
  Shield, Layers, FileText, CheckSquare, ArrowRight,
  AlertTriangle, CheckCircle, Clock, Package, Zap
} from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",      label: "Visão Geral" },
  { id: "lifecycle",     label: "Ciclo de Vida" },
  { id: "roles",         label: "Papéis" },
  { id: "workflow",      label: "Workflow" },
  { id: "sprints",       label: "Sprints" },
  { id: "quality",       label: "Qualidade" },
  { id: "incidents",     label: "Incidentes" },
  { id: "debt",          label: "Dívida Técnica" },
  { id: "rfc",           label: "RFC & ADR" },
  { id: "release",       label: "Release" },
  { id: "metrics",       label: "Métricas" },
  { id: "checklist",     label: "Checklist" },
];

const ROLES = [
  {
    name: "Tech Lead",
    icon: GitBranch,
    color: "text-violet-400",
    resp: ["Coordenar o time técnico", "Aprovar merges", "Garantir aderência à Foundation", "Resolver conflitos arquiteturais"],
    limits: "Não implementa features sem revisar impacto na arquitetura",
    approves: "PR merge, Sprint Goal, decisões de rollback",
  },
  {
    name: "Arquiteto",
    icon: Layers,
    color: "text-blue-400",
    resp: ["Manter integridade arquitetural", "Produzir RFCs", "Revisar ADRs", "Conduzir auditorias"],
    limits: "Não implementa código de produção diretamente",
    approves: "RFCs, ADRs, changes em interfaces públicas",
  },
  {
    name: "Desenvolvedor",
    icon: FileText,
    color: "text-green-400",
    resp: ["Implementar Tasks", "Escrever testes", "Manter documentação", "Seguir convenções"],
    limits: "Não faz merge sem aprovação do Tech Lead",
    approves: "Próprias Tasks após MRI + MQCCS pass",
  },
  {
    name: "QA",
    icon: CheckCircle,
    color: "text-emerald-400",
    resp: ["Executar MRI e MQCCS", "Validar critérios de aceitação", "Relatório de bugs"],
    limits: "Não aprova código sem execução completa dos pipelines",
    approves: "MRI Report, MQCCS Certificate",
  },
  {
    name: "Engineering Review Specialist",
    icon: Shield,
    color: "text-orange-400",
    resp: ["Executar MERS e MADS", "Emitir MESR", "Detectar regressões", "Recomendar refatorações"],
    limits: "Não bloqueia sem evidência técnica documentada",
    approves: "MESR, MADS Drift Report, Quality Gate final",
  },
  {
    name: "Product Owner",
    icon: BookOpen,
    color: "text-pink-400",
    resp: ["Priorizar backlog", "Definir critérios de aceitação", "Validar entrega de valor"],
    limits: "Não aprova merges técnicos",
    approves: "Sprint Goal, Definition of Done de produto",
  },
  {
    name: "Release Manager",
    icon: Package,
    color: "text-cyan-400",
    resp: ["Coordenar releases", "CHANGELOG", "Versionamento", "Comunicação de mudanças"],
    limits: "Não libera release sem MERS aprovado",
    approves: "Tag de versão, release notes",
  },
  {
    name: "AI Specialist",
    icon: Zap,
    color: "text-yellow-400",
    resp: ["Integrar capacidades de LLM", "Validar prompts", "Garantir determinismo cognitivo"],
    limits: "Não introduz não-determinismo em fluxos críticos sem aprovação do Arquiteto",
    approves: "Integrações de IA, mudanças em pipelines cognitivos",
  },
];

const LIFECYCLE_STEPS = [
  { step: "Backlog",          resp: "Product Owner",                artefact: "MEB atualizado" },
  { step: "Sprint Planning",  resp: "Tech Lead + PO",               artefact: "Sprint Goal, Task List" },
  { step: "Task",             resp: "Desenvolvedor",                 artefact: "Branch criado" },
  { step: "Implementação",    resp: "Desenvolvedor",                 artefact: "Código + Testes + JSDoc" },
  { step: "MRI",              resp: "QA + Dev",                      artefact: "MRI Report" },
  { step: "MQCCS",            resp: "QA",                            artefact: "MQCCS Certificate" },
  { step: "MERS",             resp: "Eng. Review Specialist",        artefact: "MESR Report" },
  { step: "Correções",        resp: "Desenvolvedor",                  artefact: "Fixes aplicados" },
  { step: "MADS",             resp: "Eng. Review Specialist",        artefact: "Drift Report" },
  { step: "Merge",            resp: "Tech Lead",                     artefact: "PR aprovado" },
  { step: "Release",          resp: "Release Manager",               artefact: "CHANGELOG + Tag" },
  { step: "Monitoramento",    resp: "Tech Lead",                     artefact: "Alertas configurados" },
  { step: "Lessons Learned",  resp: "Time completo",                 artefact: "LL registrado no MEB" },
];

const QUALITY_PIPELINE = [
  { name: "MRI",   when: "Após implementação, antes do PR",  blocker: true,  desc: "Valida que a implementação segue os cenários da referência" },
  { name: "MQCCS", when: "Após MRI pass",                    blocker: true,  desc: "Certifica compliance, qualidade e cobertura" },
  { name: "MERS",  when: "Ao final do Sprint",               blocker: true,  desc: "Revisa arquitetura, segurança, performance, engineering score" },
  { name: "MADS",  when: "Após MERS, antes do merge",        blocker: true,  desc: "Verifica drift arquitetural e dívida técnica acumulada" },
];

const INCIDENT_LEVELS = [
  { sev: "SEV-1", criteria: "Sistema indisponível / breach de segurança", sla: "< 15 min",   color: "text-red-400",    bg: "border-red-800" },
  { sev: "SEV-2", criteria: "Funcionalidade crítica degradada",           sla: "< 1 hora",   color: "text-orange-400", bg: "border-orange-800" },
  { sev: "SEV-3", criteria: "Funcionalidade não-crítica afetada",         sla: "< 4 horas",  color: "text-yellow-400", bg: "border-yellow-800" },
  { sev: "SEV-4", criteria: "Bug menor sem impacto ao usuário",           sla: "Próximo Sprint", color: "text-zinc-400",   bg: "border-zinc-700" },
];

const METRICS = [
  { metric: "Lead Time",       def: "Criação da task até produção",         target: "< 5 dias" },
  { metric: "Cycle Time",      def: "Início da implementação até merge",    target: "< 3 dias" },
  { metric: "Throughput",      def: "Tasks concluídas por Sprint",          target: "Crescente" },
  { metric: "Bugs por Sprint", def: "Bugs abertos no Sprint",               target: "↓ trend" },
  { metric: "Retrabalho",      def: "% de tasks reabertas",                 target: "< 10%" },
  { metric: "Dívida Técnica",  def: "Pontos acumulados (MADS)",             target: "↓ trend" },
  { metric: "Estabilidade",    def: "% uptime / incidentes por mês",        target: "≥ 99.5%" },
  { metric: "MERS Pass Rate",  def: "% de Sprints aprovados sem ressalvas", target: "↑ trend" },
];

const CHECKLIST = [
  "Todas as Tasks do Sprint concluídas?",
  "MRI aprovado (zero falhas)?",
  "MQCCS aprovado (certificação emitida)?",
  "MERS aprovado (MESR gerado)?",
  "MADS aprovado (drift report sem Critical)?",
  "Documentação atualizada (JSDoc + README)?",
  "RFCs abertas quando necessário?",
  "ADRs criados para decisões relevantes?",
  "CHANGELOG atualizado?",
  "Lessons Learned registrados no MEB?",
  "Dívida técnica Critical zerada?",
  "Release preparada (se aplicável)?",
];

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, text, color = "violet" }) {
  const bg = { violet: "bg-violet-700", blue: "bg-blue-700", green: "bg-green-700", red: "bg-red-700", yellow: "bg-yellow-700", orange: "bg-orange-700", cyan: "bg-cyan-700" };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bg[color] ?? "bg-zinc-700"} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-sm md:text-base">{text}</h2>
    </div>
  );
}

function RoleCard({ role }) {
  const [open, setOpen] = useState(false);
  const Icon = role.icon;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <Icon size={14} className={role.color} />
          <span className="text-sm font-semibold text-zinc-200">{role.name}</span>
        </div>
        <ArrowRight size={12} className={`text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3 text-sm">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Responsabilidades</p>
            <ul className="space-y-0.5">
              {role.resp.map(r => (
                <li key={r} className="flex gap-2 text-zinc-300 text-xs">
                  <CheckCircle size={10} className="text-green-500 mt-0.5 shrink-0" />{r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Limites de atuação</p>
            <p className="text-zinc-400 text-xs">{role.limits}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Aprovações necessárias</p>
            <p className="text-zinc-400 text-xs">{role.approves}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function MeomSystem() {
  const [tab, setTab] = useState("overview");
  const [checkedItems, setCheckedItems] = useState({});

  const toggleCheck = (i) => setCheckedItems(prev => ({ ...prev, [i]: !prev[i] }));
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MEOM — Engineering Operations Manual</h1>
              <p className="text-zinc-500 text-xs">Official Engineering Operations · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0", "12 Capítulos", "8 Papéis", "4 Pipelines de Qualidade", "Checklist Operacional"].map(b => (
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
            <SectionTitle icon={BookOpen} text="Capítulo 1 — Filosofia Operacional" color="blue" />
            <div className="bg-gradient-to-br from-blue-950 to-zinc-900 border border-blue-800 rounded-xl p-5">
              <p className="text-blue-100 font-semibold text-sm mb-2">"O MEOM garante que pessoas e ferramentas trabalhem de forma coordenada para transformar a arquitetura em software de produção."</p>
              <p className="text-zinc-400 text-sm">Manual oficial de operações da equipe de engenharia. Complementa a Foundation, MEB, MRI, MQCCS, MERS e MADS.</p>
            </div>
            <div className="space-y-2">
              {[
                { principle: "Orientado por evidências", desc: "Toda decisão técnica suportada por dados, métricas ou referência à Foundation" },
                { principle: "Implementação incremental", desc: "Entregas pequenas, frequentes e testáveis a cada Sprint" },
                { principle: "Qualidade contínua", desc: "MRI + MQCCS + MERS + MADS executados em todo ciclo" },
                { principle: "Automação", desc: "Scripts, pipelines e validações automatizadas sempre que possível" },
                { principle: "Revisão técnica obrigatória", desc: "Nenhum merge sem Engineering Review aprovado" },
                { principle: "Transparência", desc: "Status, blockers e decisões visíveis para toda a equipe" },
                { principle: "Melhoria contínua", desc: "Retrospectivas formais e Lessons Learned registrados permanentemente" },
              ].map(item => (
                <div key={item.principle} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex gap-4">
                  <CheckCircle size={13} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{item.principle}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Declaração Final</h3>
              <div className="space-y-1 text-sm text-zinc-400">
                {[
                  ["Foundation", "define a plataforma"],
                  ["MEB", "define o trabalho"],
                  ["MRI + MQCCS + MERS + MADS", "garantem qualidade"],
                  ["MEOM", "garante coordenação entre pessoas e ferramentas"],
                ].map(([name, desc]) => (
                  <div key={name} className="flex gap-2">
                    <span className="text-blue-400 font-semibold shrink-0">{name}</span>
                    <span>— {desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LIFECYCLE ────────────────────────────────────────────────── */}
        {tab === "lifecycle" && (
          <div className="space-y-4">
            <SectionTitle icon={RefreshCw} text="Capítulo 2 — Ciclo de Vida de uma Task" color="violet" />
            <div className="space-y-1">
              {LIFECYCLE_STEPS.map((item, i) => {
                const isQuality = ["MRI", "MQCCS", "MERS", "MADS"].includes(item.step);
                const isMerge   = item.step === "Merge" || item.step === "Release";
                return (
                  <div key={item.step}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isQuality ? "bg-violet-700 text-white" :
                        isMerge   ? "bg-green-700 text-white" :
                        "bg-zinc-800 text-zinc-400"
                      }`}>{i + 1}</div>
                      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 flex items-center justify-between gap-2">
                        <p className={`text-sm font-semibold ${isQuality ? "text-violet-300" : isMerge ? "text-green-300" : "text-zinc-200"}`}>{item.step}</p>
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-zinc-500">{item.resp}</p>
                          <p className="text-xs text-zinc-600 font-mono">{item.artefact}</p>
                        </div>
                      </div>
                    </div>
                    {i < LIFECYCLE_STEPS.length - 1 && <div className="ml-3.5 w-px h-2 bg-zinc-800" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ROLES ────────────────────────────────────────────────────── */}
        {tab === "roles" && (
          <div className="space-y-4">
            <SectionTitle icon={Users} text="Capítulo 3 — Papéis e Responsabilidades" color="blue" />
            <div className="space-y-2">
              {ROLES.map(role => <RoleCard key={role.name} role={role} />)}
            </div>
          </div>
        )}

        {/* ── WORKFLOW ─────────────────────────────────────────────────── */}
        {tab === "workflow" && (
          <div className="space-y-4">
            <SectionTitle icon={GitBranch} text="Capítulo 4 — Workflow de Desenvolvimento" color="green" />

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Branches</h3>
              <div className="space-y-1.5">
                {[
                  ["main",          "branch estável, somente via PR aprovado"],
                  ["develop",       "branch de integração do Sprint"],
                  ["feature/XXX",   "branch de feature"],
                  ["fix/XXX",       "branch de correção"],
                  ["release/vX.Y",  "branch de release candidate"],
                  ["hotfix/XXX",    "branch de hotfix urgente"],
                ].map(([branch, desc]) => (
                  <div key={branch} className="flex gap-3 text-sm">
                    <span className="font-mono text-violet-400 text-xs w-28 shrink-0">{branch}</span>
                    <span className="text-zinc-400 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Convenção de Commits</h3>
              <div className="space-y-1.5">
                {[
                  ["feat(scope):",     "nova feature"],
                  ["fix(scope):",      "correção"],
                  ["refactor(scope):", "refatoração sem mudança de comportamento"],
                  ["test(scope):",     "adição ou correção de testes"],
                  ["docs(scope):",     "atualização de documentação"],
                  ["chore(scope):",    "manutenção técnica"],
                ].map(([prefix, desc]) => (
                  <div key={prefix} className="flex gap-3 text-sm">
                    <span className="font-mono text-green-400 text-xs w-36 shrink-0">{prefix}</span>
                    <span className="text-zinc-400 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Critérios de Merge</h3>
              <div className="space-y-1.5">
                {["Todos os testes passando", "MRI aprovado", "MQCCS aprovado", "MERS aprovado (Sprint Review)", "Reviewer aprovado", "Sem conflitos"].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
              <h3 className="text-red-300 font-semibold text-sm mb-1">Rollback</h3>
              <p className="text-zinc-400 text-sm">Critério: bug crítico em produção ou security incident. Executor: Release Manager + Tech Lead. Post-mortem obrigatório em 48h.</p>
            </div>
          </div>
        )}

        {/* ── SPRINTS ──────────────────────────────────────────────────── */}
        {tab === "sprints" && (
          <div className="space-y-4">
            <SectionTitle icon={RefreshCw} text="Capítulo 5 — Gestão de Sprints" color="violet" />
            <div className="space-y-3">
              {[
                { phase: "Planejamento", items: ["Input: MEB priorizado pelo PO", "Output: Sprint Goal + Task List estimada", "Artefato: Sprint Planning Doc no MEB"] },
                { phase: "Execução",     items: ["Daily standups: blockers, progresso, próximos passos", "Branch por feature, commits frequentes e atômicos", "Testes escritos junto com o código (não depois)"] },
                { phase: "Acompanhamento", items: ["Burndown atualizado diariamente", "Blockers escalonados imediatamente ao Tech Lead", "MERS mid-sprint opcional para Sprints > 2 semanas"] },
                { phase: "Sprint Review", items: ["Demo das funcionalidades entregues", "MESR apresentado pelo Engineering Review Specialist", "Critérios de aceitação validados pelo PO"] },
                { phase: "Retrospectiva", items: ["O que funcionou bem?", "O que precisa melhorar?", "Ações concretas para o próximo Sprint", "Lessons Learned registrados no MEB"] },
              ].map(s => (
                <div key={s.phase} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-2">{s.phase}</h3>
                  <ul className="space-y-1">
                    {s.items.map(item => (
                      <li key={item} className="flex gap-2 text-xs text-zinc-400">
                        <ArrowRight size={10} className="text-violet-400 mt-0.5 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Artefatos Obrigatórios por Sprint</h3>
              <div className="space-y-1.5">
                {[
                  ["MRI Report",          "QA"],
                  ["MQCCS Certificate",   "QA"],
                  ["MESR (MERS Report)",  "Eng. Review Specialist"],
                  ["MADS Drift Report",   "Eng. Review Specialist"],
                  ["Sprint Planning Doc", "Tech Lead"],
                  ["Lessons Learned",     "Time completo"],
                  ["CHANGELOG atualizado","Release Manager"],
                ].map(([art, resp]) => (
                  <div key={art} className="flex justify-between text-sm">
                    <span className="text-zinc-300">{art}</span>
                    <span className="text-zinc-500 text-xs">{resp}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── QUALITY ──────────────────────────────────────────────────── */}
        {tab === "quality" && (
          <div className="space-y-4">
            <SectionTitle icon={Shield} text="Capítulo 6 — Qualidade Contínua" color="orange" />
            <div className="space-y-2">
              {QUALITY_PIPELINE.map((item, i) => (
                <div key={item.name}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                    <span className="font-mono text-violet-400 font-bold text-sm w-14 shrink-0">{item.name}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{item.desc}</p>
                      <p className="text-xs text-zinc-500">{item.when}</p>
                    </div>
                    <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono shrink-0">Bloqueador</span>
                  </div>
                  {i < QUALITY_PIPELINE.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight size={12} className="text-zinc-700 rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INCIDENTS ────────────────────────────────────────────────── */}
        {tab === "incidents" && (
          <div className="space-y-4">
            <SectionTitle icon={AlertTriangle} text="Capítulo 7 — Gestão de Incidentes" color="red" />
            <div className="space-y-2">
              {INCIDENT_LEVELS.map(item => (
                <div key={item.sev} className={`bg-zinc-900 border rounded-xl px-4 py-3 flex items-center gap-4 ${item.bg}`}>
                  <span className={`font-mono font-bold text-sm w-14 shrink-0 ${item.color}`}>{item.sev}</span>
                  <span className="text-zinc-300 text-sm flex-1">{item.criteria}</span>
                  <span className={`font-mono text-xs shrink-0 ${item.color}`}>{item.sla}</span>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Fluxo de Incidente</h3>
              <div className="flex flex-wrap gap-1 items-center">
                {["Detecção","Classificação","Priorização","Investigação","Correção","Post-mortem","Prevenção"].map((step, i, arr) => (
                  <React.Fragment key={step}>
                    <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{step}</span>
                    {i < arr.length - 1 && <ArrowRight size={10} className="text-zinc-600 shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
              <h3 className="text-red-300 font-semibold text-sm mb-1">Post-mortem (obrigatório SEV-1/SEV-2)</h3>
              <ul className="space-y-0.5 text-zinc-400 text-xs">
                {["Timeline do incidente","Root cause","Impacto","Ações de correção tomadas","Ações de prevenção (com responsável + prazo)"].map(item => (
                  <li key={item} className="flex gap-2"><ArrowRight size={10} className="text-red-400 mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── DEBT ─────────────────────────────────────────────────────── */}
        {tab === "debt" && (
          <div className="space-y-4">
            <SectionTitle icon={Layers} text="Capítulo 8 — Gestão de Dívida Técnica" color="yellow" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Priorização e Ação</h3>
              <div className="space-y-2">
                {[
                  { level: "Critical",      action: "Resolve no Sprint atual antes de novas features",   color: "text-red-400" },
                  { level: "High",          action: "Entra obrigatoriamente no próximo Sprint Planning",  color: "text-orange-400" },
                  { level: "Medium",        action: "Priorizado nos próximos 2 Sprints",                 color: "text-yellow-400" },
                  { level: "Low",           action: "Backlog priorizado",                                color: "text-green-400" },
                  { level: "Informational", action: "Backlog livre",                                     color: "text-zinc-400" },
                ].map(item => (
                  <div key={item.level} className="flex gap-4 text-sm">
                    <span className={`font-mono font-bold text-xs w-24 shrink-0 ${item.color}`}>{item.level}</span>
                    <span className="text-zinc-400 text-xs">{item.action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-4">
              <p className="text-yellow-300 font-semibold text-sm mb-1">Capacidade reservada</p>
              <p className="text-zinc-400 text-sm">Reservar <strong className="text-yellow-300">≥ 20%</strong> da capacidade do Sprint para pagamento de dívida técnica. Itens Critical nunca podem ser adiados.</p>
            </div>
          </div>
        )}

        {/* ── RFC ──────────────────────────────────────────────────────── */}
        {tab === "rfc" && (
          <div className="space-y-4">
            <SectionTitle icon={FileText} text="Capítulo 9 — Gestão de RFCs e ADRs" color="blue" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-violet-300 mb-2">Quando abrir uma RFC</h3>
                <ul className="space-y-1">
                  {["Nova feature com impacto arquitetural","Breaking change em interface pública","Adição de novo módulo ou serviço","Mudança em protocolo ou contrato","Qualquer alteração nos documentos da Foundation"].map(item => (
                    <li key={item} className="flex gap-2 text-xs text-zinc-400">
                      <ArrowRight size={10} className="text-violet-400 mt-0.5 shrink-0" />{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-300 mb-2">Quando criar um ADR</h3>
                <ul className="space-y-1">
                  {["Toda RFC aprovada gera um ADR","Decisões técnicas relevantes tomadas durante implementação","Quando uma abordagem alternativa foi considerada e descartada"].map(item => (
                    <li key={item} className="flex gap-2 text-xs text-zinc-400">
                      <ArrowRight size={10} className="text-blue-400 mt-0.5 shrink-0" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Aprovação</h3>
              <div className="space-y-2">
                {[
                  ["RFC menor", "Tech Lead + Arquiteto"],
                  ["RFC maior (impacto em Core)", "Tech Lead + Arquiteto + Foundation Committee"],
                  ["ADR", "Arquiteto"],
                ].map(([type, who]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-zinc-300">{type}</span>
                    <span className="text-zinc-500 text-xs">{who}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RELEASE ──────────────────────────────────────────────────── */}
        {tab === "release" && (
          <div className="space-y-4">
            <SectionTitle icon={Package} text="Capítulo 10 — Release Management" color="cyan" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Versionamento</h3>
              <pre className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded-lg p-3">{`MAJOR.MINOR.PATCH
MAJOR — breaking changes
MINOR — novas features retrocompatíveis
PATCH — bugfixes e correções menores`}</pre>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Fluxo de Release</h3>
              <div className="space-y-1">
                {[
                  ["1", "Feature Freeze",    "branch release/vX.Y criado"],
                  ["2", "Release Candidate", "testes de homologação"],
                  ["3", "MERS Final",        "Engineering Review do release"],
                  ["4", "Homologação",       "validação pelo PO e QA"],
                  ["5", "Produção",          "tag + deploy + monitoring"],
                  ["6", "Comunicação",       "CHANGELOG publicado"],
                ].map(([num, step, desc]) => (
                  <div key={step} className="flex gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-xs flex items-center justify-center shrink-0">{num}</span>
                    <span className="text-zinc-200 font-medium w-32 shrink-0">{step}</span>
                    <span className="text-zinc-500 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── METRICS ──────────────────────────────────────────────────── */}
        {tab === "metrics" && (
          <div className="space-y-4">
            <SectionTitle icon={BarChart2} text="Capítulo 11 — Métricas Operacionais" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Métrica</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Definição</th>
                    <th className="px-4 py-2 text-right">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {METRICS.map(m => (
                    <tr key={m.metric}>
                      <td className="px-4 py-2.5 font-semibold text-zinc-200">{m.metric}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden md:table-cell">{m.def}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-violet-400 text-xs">{m.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CHECKLIST ────────────────────────────────────────────────── */}
        {tab === "checklist" && (
          <div className="space-y-4">
            <SectionTitle icon={CheckSquare} text="Capítulo 12 — Checklist Operacional" color="green" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-2 flex items-center justify-between">
              <p className="text-zinc-300 text-sm">Sprint Checklist</p>
              <span className={`font-mono text-sm font-bold ${checkedCount === CHECKLIST.length ? "text-green-400" : "text-zinc-400"}`}>
                {checkedCount}/{CHECKLIST.length}
              </span>
            </div>
            <div className="space-y-2">
              {CHECKLIST.map((item, i) => (
                <button key={item} onClick={() => toggleCheck(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    checkedItems[i]
                      ? "bg-green-950/20 border-green-800 text-green-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${
                    checkedItems[i] ? "bg-green-600 border-green-500" : "border-zinc-600"
                  }`}>
                    {checkedItems[i] && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <span className="text-sm">{item}</span>
                </button>
              ))}
            </div>
            {checkedCount === CHECKLIST.length && (
              <div className="bg-green-950/30 border border-green-700 rounded-xl p-4 text-center">
                <CheckCircle size={24} className="text-green-400 mx-auto mb-1" />
                <p className="text-green-300 font-bold text-sm">Sprint pronto para fechar!</p>
                <p className="text-zinc-400 text-xs mt-0.5">Todos os critérios operacionais atendidos.</p>
              </div>
            )}
            <p className="text-zinc-600 text-xs text-center">Qualquer NÃO bloqueia o fechamento do Sprint</p>
          </div>
        )}

      </div>
    </div>
  );
}