import React, { useState } from "react";
import { GitBranch, Zap, Shield, Database, Terminal, Bug, CheckSquare, ChevronRight, ArrowDown, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";

// ─── Data ─────────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { n: 1,  label: "Input Receiver",      color: "violet", desc: "Recebe texto, voz, arquivo, link. Normaliza para InputPayload. Gera correlationId." },
  { n: 2,  label: "Context Builder",     color: "violet", desc: "Recupera sessão ativa e histórico recente. Constrói SessionContext." },
  { n: 3,  label: "Identity Context",    color: "blue",   desc: "Resolve identityContext (pessoal, empresa, projeto). Garante isolamento total." },
  { n: 4,  label: "Journey Manager",     color: "blue",   desc: "Verifica Journey existente ou cria nova. Carrega contexto acumulado. draft → active." },
  { n: 5,  label: "Planner",             color: "cyan",   desc: "Analisa intenção. Seleciona Specialists. Gera ExecutionPlan com PlanStep[]." },
  { n: 6,  label: "Capability Registry", color: "cyan",   desc: "Verifica Connectors disponíveis e saudáveis. Valida capabilities necessárias." },
  { n: 7,  label: "Security Gate",       color: "red",    desc: "Pipeline: Permission → Risk → Policy. Decide: authorized | requiresApproval | blocked." },
  { n: 8,  label: "Execution Engine",    color: "orange", desc: "Executa PlanStep[] com timeout, retry, rollback. Publica eventos no EventBus." },
  { n: 9,  label: "Event Bus",           color: "yellow", desc: "Propaga eventos por prioridade CRITICAL→HIGH→NORMAL→LOW. Gerencia DLQ." },
  { n: 10, label: "Working Memory",      color: "green",  desc: "Armazena resultados intermediários com TTL. Isolado por identityContext." },
  { n: 11, label: "Audit Trail",         color: "pink",   desc: "Registra AuditRecord imutável. Inclui correlationId em cada entrada." },
  { n: 12, label: "Long Term Memory",    color: "green",  desc: "Persiste e indexa conhecimento para recuperação futura." },
  { n: 13, label: "Response Builder",    color: "violet", desc: "Agrega resultados, formata resposta contextualizada. Atualiza Journey." },
];

const LIFECYCLE_STATES = [
  { id: "Created",   color: "zinc",   next: ["Queued"],               desc: "Input Receiver criou a requisição" },
  { id: "Queued",    color: "blue",   next: ["Planning"],             desc: "Runtime enfileirou para execução" },
  { id: "Planning",  color: "cyan",   next: ["Executing"],            desc: "Planner analisando intenção" },
  { id: "Executing", color: "violet", next: ["Completed","Waiting","Retrying","Failed"], desc: "ExecutionEngine executando steps" },
  { id: "Waiting",   color: "yellow", next: ["Executing","Cancelled"],desc: "Journey aguardando input externo" },
  { id: "Paused",    color: "orange", next: ["Executing","Cancelled"],desc: "Aguardando Human Approval" },
  { id: "Retrying",  color: "blue",   next: ["Executing","Failed"],   desc: "Re-tentando step com backoff" },
  { id: "Completed", color: "green",  next: ["Archived"],             desc: "Todos os steps concluídos" },
  { id: "Failed",    color: "red",    next: ["Archived"],             desc: "Step required falhou definitivamente" },
  { id: "Cancelled", color: "zinc",   next: ["Archived"],             desc: "Usuário ou timeout cancelou" },
  { id: "Archived",  color: "zinc",   next: [],                       desc: "Finalizado — read-only" },
];

const EVENTS = [
  { event: "request.created",          origin: "Input Receiver",    consumers: "ContextBuilder, AuditTrail",       priority: "HIGH" },
  { event: "journey.created",          origin: "JourneyManager",    consumers: "Planner, AuditTrail",              priority: "HIGH" },
  { event: "journey.status.changed",   origin: "JourneyManager",    consumers: "AuditTrail, EventBus",             priority: "HIGH" },
  { event: "planner.completed",        origin: "Planner",           consumers: "ExecutionEngine",                  priority: "NORMAL" },
  { event: "security.evaluated",       origin: "SecurityGate",      consumers: "ExecutionEngine, AuditTrail",      priority: "CRITICAL" },
  { event: "security.action.blocked",  origin: "SecurityGate",      consumers: "JourneyManager, AuditTrail",       priority: "CRITICAL" },
  { event: "security.approval.required", origin: "SecurityGate",    consumers: "JourneyManager",                   priority: "CRITICAL" },
  { event: "execution.started",        origin: "ExecutionEngine",   consumers: "AuditTrail, WorkingMemory",        priority: "HIGH" },
  { event: "execution.step.completed", origin: "ExecutionEngine",   consumers: "WorkingMemory, AuditTrail",        priority: "NORMAL" },
  { event: "execution.step.failed",    origin: "ExecutionEngine",   consumers: "AuditTrail, JourneyManager",       priority: "HIGH" },
  { event: "execution.completed",      origin: "ExecutionEngine",   consumers: "JourneyManager, LongTermMemory",   priority: "HIGH" },
  { event: "execution.rolled_back",    origin: "ExecutionEngine",   consumers: "JourneyManager, AuditTrail",       priority: "HIGH" },
  { event: "memory.updated",           origin: "WorkingMemory",     consumers: "AuditTrail",                       priority: "LOW" },
  { event: "memory.promoted",          origin: "WorkingMemory",     consumers: "LongTermMemory",                   priority: "LOW" },
  { event: "journey.completed",        origin: "JourneyManager",    consumers: "LongTermMemory, AuditTrail",       priority: "HIGH" },
  { event: "response.generated",       origin: "ResponseBuilder",   consumers: "JourneyManager",                   priority: "HIGH" },
];

const SCENARIOS = [
  {
    id: "cpf", title: "Consulta CPF", complexity: "Simples",
    steps: [
      "Input: 'Qual a situação do CPF 123.456.789-00?'",
      "Context: sessionId, userId, identityContext='pessoal'",
      "Journey criada: 'Consulta CPF 123.456.789-00'",
      "Planner: intent='gov.cpf.query' → GovernmentSpecialist",
      "Security: riskLevel=LOW → authorized=true",
      "step-1: GovernmentConnector.execute({ cpf }) → { status: 'regular' }",
      "WorkingMemory.store('cpf:status', { status: 'regular' })",
      "AuditTrail: action='connector.execute', outcome='success'",
      "Response: 'CPF 123.456.789-00 — Situação: Regular'",
      "Journey: completed",
    ],
  },
  {
    id: "booking", title: "Reserva Aérea", complexity: "Complexa",
    steps: [
      "Input: 'Quero viajar para Lisboa em outubro'",
      "Journey criada: 'Reserva Lisboa Outubro'",
      "Planner: multi-step — TravelSpecialist + FinancialSpecialist (paralelo)",
      "step-1 ✓: 3 voos encontrados [parallel=true]",
      "step-2 ✓: cotação EUR/BRL = 6.20 [parallel=true]",
      "Journey: paused — aguarda seleção do usuário",
      "[ Usuário seleciona voo ]",
      "Journey: resumed",
      "Security: riskLevel=HIGH (compra irreversível) → requiresApproval=true",
      "Journey: paused — Human Approval Gate",
      "[ Usuário confirma ]",
      "step-5: BookingConnector.execute() [isReversible=true]",
      "Audit: action='booking.execute', outcome='success'",
      "Journey: completed — 'Voo Lisboa confirmado: TP1234'",
    ],
  },
  {
    id: "contract", title: "Análise de Contrato", complexity: "Multi-Specialist",
    steps: [
      "Input: [PDF] 'Analise este contrato de prestação de serviços'",
      "step-1: DocumentConnector.extract(pdf) → texto extraído",
      "step-2: LegalSpecialist.process(texto) → cláusulas [parallel]",
      "step-3: FinancialSpecialist.process(texto) → valores [parallel]",
      "LegalSpecialist confidence: 0.92 ✓",
      "FinancialSpecialist confidence: 0.88 ✓",
      "Aggregator: combina por confiança",
      "LongTermMemory: KnowledgeNode criado",
      "Response: análise com cláusulas, riscos e valores",
    ],
  },
  {
    id: "rollback", title: "Envio com Falha + Rollback", complexity: "Error Flow",
    steps: [
      "Input: 'Enviar proposta para cliente@empresa.com'",
      "Security: riskLevel=HIGH → requiresApproval=true",
      "Journey: paused — aguarda aprovação",
      "[ Usuário aprova ]",
      "step-1: EmailConnector.execute() — tenta 1/3 → falha",
      "retry backoff: 100ms → tenta 2/3 → falha",
      "retry backoff: 200ms → tenta 3/3 → falha",
      "MAX_RETRIES_EXCEEDED — rollback não necessário (envio falhou)",
      "Journey: paused(reason='email_service_unavailable')",
      "Notificação: 'Falha no envio. Tente novamente em 30 minutos.'",
    ],
  },
];

const PRINCIPLES = [
  { n: 1, rule: "Nenhuma execução sem Journey",          icon: GitBranch },
  { n: 2, rule: "Nenhuma ação externa sem Security Gate", icon: Shield },
  { n: 3, rule: "Nenhuma mutação sem Audit",              icon: Terminal },
  { n: 4, rule: "Nenhuma memória sem Identity Context",   icon: Database },
  { n: 5, rule: "Nenhuma evolução sem Evento",            icon: Zap },
  { n: 6, rule: "Nenhuma resposta sem rastreabilidade",   icon: GitBranch },
  { n: 7, rule: "Nenhum Connector sem healthCheck",       icon: Shield },
  { n: 8, rule: "Nenhum rollback silencioso",             icon: Terminal },
];

const TABS = ["Pipeline", "Lifecycle", "Eventos", "Cenários", "Princípios", "Checklist"];

const COLOR_DOT = {
  violet: "bg-violet-500", blue: "bg-blue-500", cyan: "bg-cyan-500",
  red: "bg-red-500", orange: "bg-orange-500", yellow: "bg-yellow-500",
  green: "bg-green-500", pink: "bg-pink-500", zinc: "bg-zinc-500",
};
const COLOR_BADGE = {
  violet: "bg-violet-900/50 text-violet-300 border-violet-700",
  blue:   "bg-blue-900/50 text-blue-300 border-blue-700",
  cyan:   "bg-cyan-900/50 text-cyan-300 border-cyan-700",
  red:    "bg-red-900/50 text-red-300 border-red-700",
  orange: "bg-orange-900/50 text-orange-300 border-orange-700",
  yellow: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  green:  "bg-green-900/50 text-green-300 border-green-700",
  pink:   "bg-pink-900/50 text-pink-300 border-pink-700",
  zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
};
const PRIORITY_COLOR = {
  CRITICAL: "text-red-400", HIGH: "text-orange-400", NORMAL: "text-yellow-400", LOW: "text-zinc-500",
};
const COMPLEXITY_COLOR = {
  "Simples": "bg-green-900/40 text-green-400 border-green-800",
  "Complexa": "bg-orange-900/40 text-orange-400 border-orange-800",
  "Multi-Specialist": "bg-blue-900/40 text-blue-400 border-blue-800",
  "Error Flow": "bg-red-900/40 text-red-400 border-red-800",
};

// ─── Panels ───────────────────────────────────────────────────────────────

function PipelinePanel() {
  const [active, setActive] = useState(null);
  return (
    <div className="space-y-1">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 text-sm text-zinc-400">
        <Info size={14} className="inline mr-2 text-violet-400" />
        Pipeline oficial de 13 etapas. Toda requisição percorre este fluxo determinístico. Clique em uma etapa para detalhes.
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-3">
          <div className="w-2 h-2 rounded-full bg-violet-500" />
        </div>
        <div className="bg-zinc-900 border border-violet-700 rounded-lg px-4 py-2 text-sm text-violet-300 font-medium">Usuário</div>
      </div>
      {PIPELINE_STEPS.map((step, i) => (
        <div key={step.n} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-zinc-700" />
            <div className={`w-2 h-2 rounded-full ${COLOR_DOT[step.color]}`} />
          </div>
          <button
            onClick={() => setActive(active === step.n ? null : step.n)}
            className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
              active === step.n ? `${COLOR_BADGE[step.color]} border` : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono w-5 ${active === step.n ? "" : "text-zinc-600"}`}>{step.n}</span>
              {step.label}
            </div>
            <ChevronRight size={14} className={`shrink-0 transition-transform ${active === step.n ? "rotate-90" : ""}`} />
          </button>
        </div>
      ))}
      {/* Inline expand */}
      {active && (
        <div className="ml-5 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-300 -mt-1">
          <p className="font-semibold text-white mb-1">{PIPELINE_STEPS[active - 1]?.label}</p>
          {PIPELINE_STEPS[active - 1]?.desc}
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-zinc-700" />
          <div className="w-2 h-2 rounded-full bg-violet-500" />
        </div>
        <div className="bg-zinc-900 border border-violet-700 rounded-lg px-4 py-2 text-sm text-violet-300 font-medium">Usuário</div>
      </div>
    </div>
  );
}

function LifecyclePanel() {
  const [active, setActive] = useState(null);
  return (
    <div className="space-y-2">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-2 text-xs text-zinc-500">
        Transições proibidas: Completed→Executing, Archived→Executing, Failed→Completed
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {LIFECYCLE_STATES.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(active === s.id ? null : s.id)}
            className={`text-left p-3 rounded-xl border transition-all ${
              active === s.id ? `${COLOR_BADGE[s.color]} border` : "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${COLOR_DOT[s.color]}`} />
              <span className="text-white text-xs font-semibold">{s.id}</span>
            </div>
            <p className="text-zinc-500 text-xs">{s.desc}</p>
            {active === s.id && s.next.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-zinc-600">→</span>
                {s.next.map(n => <span key={n} className="text-xs bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">{n}</span>)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function EventsPanel() {
  const [filter, setFilter] = useState("All");
  const priorities = ["All", "CRITICAL", "HIGH", "NORMAL", "LOW"];
  const filtered = filter === "All" ? EVENTS : EVENTS.filter(e => e.priority === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {priorities.map(p => (
          <button key={p} onClick={() => setFilter(p)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === p ? "border-violet-500 text-violet-300 bg-violet-950" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}>{p}</button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-600 font-semibold uppercase tracking-wider">
          <div className="col-span-4">Evento</div>
          <div className="col-span-3 hidden md:block">Origem</div>
          <div className="col-span-4 hidden md:block">Consumidores</div>
          <div className="col-span-1">Prio.</div>
        </div>
        {filtered.map((ev, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
            <div className="col-span-5 md:col-span-4">
              <code className="text-violet-300 text-xs font-mono">{ev.event}</code>
            </div>
            <div className="col-span-3 hidden md:block text-zinc-400 text-xs">{ev.origin}</div>
            <div className="col-span-4 hidden md:block text-zinc-500 text-xs truncate">{ev.consumers}</div>
            <div className="col-span-7 md:col-span-1">
              <span className={`text-xs font-bold ${PRIORITY_COLOR[ev.priority]}`}>{ev.priority.slice(0, 1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenariosPanel() {
  const [active, setActive] = useState("cpf");
  const current = SCENARIOS.find(s => s.id === active);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              active === s.id ? "border-violet-500 text-violet-300 bg-violet-950" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}>
            {s.title}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded border ${COMPLEXITY_COLOR[s.complexity]}`}>{s.complexity}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-white font-bold mb-4 text-sm">{current.title}</h3>
          <div className="space-y-0">
            {current.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  {i > 0 && <div className="w-px h-3 bg-zinc-700" />}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    step.startsWith("[ ") ? "bg-yellow-900 text-yellow-300" : "bg-zinc-800 text-zinc-400"
                  }`}>{i + 1}</div>
                </div>
                <div className={`pb-1 pt-0.5 text-sm flex-1 ${
                  step.startsWith("[ ") ? "text-yellow-300" :
                  step.includes("✓") ? "text-green-400" :
                  step.includes("falha") || step.includes("fail") || step.includes("Falha") ? "text-red-400" :
                  "text-zinc-300"
                }`}>{step}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PrinciplesPanel() {
  return (
    <div className="space-y-2">
      {PRINCIPLES.map(p => {
        const Icon = p.icon;
        return (
          <div key={p.n} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-violet-900/40 border border-violet-700 flex items-center justify-center shrink-0">
              <Icon size={14} className="text-violet-400" />
            </div>
            <div>
              <span className="text-zinc-600 text-xs font-mono mr-2">#{p.n}</span>
              <span className="text-white text-sm font-medium">{p.rule}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CHECKLIST_GROUPS = [
  { label: "Pipeline",        items: ["O fluxo segue o pipeline oficial das 13 etapas?", "Existe Journey para esta execução?", "O correlationId é propagado por todos os componentes?"] },
  { label: "Eventos",         items: ["Todos os eventos do catálogo são publicados?", "As prioridades estão corretas (CRITICAL/HIGH/NORMAL/LOW)?", "O DLQ está sendo monitorado?"] },
  { label: "Segurança",       items: ["SecurityGate.evaluate() é chamado antes de toda ação externa?", "Human Approval Gate configurado para risco HIGH/CRITICAL?", "Identity Context está sendo respeitado?"] },
  { label: "Auditoria",       items: ["AuditTrail.record() para toda mutação?", "correlationId no AuditRecord?", "outcome registrado (success/failure/blocked)?"] },
  { label: "Resiliência",     items: ["Existe rollback para steps isReversible=true?", "Existe timeout em toda chamada externa?", "Existe retry com backoff exponencial?", "Existe healthCheck no Connector?"] },
  { label: "Observabilidade", items: ["Logs estruturados com correlationId?", "Métricas sendo publicadas?", "Health check endpoint disponível?"] },
  { label: "Memória",         items: ["WorkingMemory isolado por identityContext?", "TTL configurado apropriadamente?", "Promoção para LongTermMemory nos casos relevantes?"] },
  { label: "Performance",     items: ["Steps independentes estão em paralelo?", "Cache via WorkingMemory antes de chamar Connectors?", "Timeouts configurados por tipo de operação?"] },
];

function ChecklistPanel() {
  const [checked, setChecked] = useState({});
  const total = CHECKLIST_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const done  = Object.values(checked).filter(Boolean).length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-300 font-medium">Progresso do Checklist</span>
            <span className={`text-sm font-bold ${pct === 100 ? "text-green-400" : pct > 50 ? "text-yellow-400" : "text-red-400"}`}>{done}/{total}</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct > 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button onClick={() => setChecked({})} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Reset</button>
      </div>
      {CHECKLIST_GROUPS.map(g => (
        <div key={g.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3">{g.label}</h4>
          <div className="space-y-2">
            {g.items.map((item, i) => {
              const key = `${g.label}:${i}`;
              return (
                <label key={i} className="flex items-start gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    checked[key] ? "bg-green-600 border-green-600" : "border-zinc-600 group-hover:border-zinc-400"
                  }`} onClick={() => setChecked(p => ({ ...p, [key]: !p[key] }))}>
                    {checked[key] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                  </div>
                  <span className={`text-sm transition-colors ${checked[key] ? "text-zinc-600 line-through" : "text-zinc-300"}`}>{item}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function ExecutionModel() {
  const [tab, setTab] = useState("Pipeline");
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 md:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={18} className="text-violet-400" />
              <h1 className="text-white font-bold text-base md:text-lg">MREM — Reference Execution Model</h1>
            </div>
            <p className="text-zinc-500 text-xs">Official Runtime Execution Flow · Foundation v1.0</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-1 rounded">Official</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-4xl mx-auto mt-4 flex gap-1 flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                tab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {tab === "Pipeline"   && <PipelinePanel />}
        {tab === "Lifecycle"  && <LifecyclePanel />}
        {tab === "Eventos"    && <EventsPanel />}
        {tab === "Cenários"   && <ScenariosPanel />}
        {tab === "Princípios" && <PrinciplesPanel />}
        {tab === "Checklist"  && <ChecklistPanel />}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 border-t border-zinc-800">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span>Refs:</span>
          {["MAS","MRS","MCS","MPAR","MDH","MQCCS"].map(r => (
            <span key={r} className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono border border-zinc-700">{r}</span>
          ))}
          <span className="ml-auto flex gap-3">
            <Link to="/developer-handbook" className="text-violet-400 hover:underline">Dev Handbook</Link>
            <Link to="/api-reference" className="text-violet-400 hover:underline">API Reference</Link>
            <Link to="/foundation" className="text-violet-400 hover:underline">Foundation</Link>
          </span>
        </div>
      </div>
    </div>
  );
}