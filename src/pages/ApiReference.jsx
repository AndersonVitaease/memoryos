import React, { useState, useMemo } from "react";
import { Search, Code, ChevronRight, Copy, Check, BookOpen, ExternalLink, Layers, Cpu, Shield, Zap, Database, GitBranch, Terminal } from "lucide-react";
import { Link } from "react-router-dom";

// ─── Data ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "core",       label: "Core API",       icon: Cpu,      color: "violet" },
  { id: "connector",  label: "Connector",      icon: Layers,   color: "blue"   },
  { id: "specialist", label: "Specialist",     icon: BookOpen, color: "cyan"   },
  { id: "knowledge",  label: "Knowledge",      icon: Database, color: "green"  },
  { id: "eventbus",   label: "Event Bus",      icon: Zap,      color: "yellow" },
  { id: "security",   label: "Security",       icon: Shield,   color: "red"    },
  { id: "journey",    label: "Journey",        icon: GitBranch,color: "orange" },
  { id: "audit",      label: "Audit",          icon: Terminal, color: "pink"   },
  { id: "sdk",        label: "SDK",            icon: Code,     color: "indigo" },
  { id: "errors",     label: "Error Model",    icon: Shield,   color: "rose"   },
];

const COLOR_MAP = {
  violet: { badge: "bg-violet-900/60 text-violet-300 border-violet-700", dot: "bg-violet-500", active: "bg-violet-700/30 text-violet-300" },
  blue:   { badge: "bg-blue-900/60 text-blue-300 border-blue-700",       dot: "bg-blue-500",   active: "bg-blue-700/30 text-blue-300"   },
  cyan:   { badge: "bg-cyan-900/60 text-cyan-300 border-cyan-700",       dot: "bg-cyan-500",   active: "bg-cyan-700/30 text-cyan-300"   },
  green:  { badge: "bg-green-900/60 text-green-300 border-green-700",    dot: "bg-green-500",  active: "bg-green-700/30 text-green-300" },
  yellow: { badge: "bg-yellow-900/60 text-yellow-300 border-yellow-700", dot: "bg-yellow-500", active: "bg-yellow-700/30 text-yellow-300"},
  red:    { badge: "bg-red-900/60 text-red-300 border-red-700",          dot: "bg-red-500",    active: "bg-red-700/30 text-red-300"    },
  orange: { badge: "bg-orange-900/60 text-orange-300 border-orange-700", dot: "bg-orange-500", active: "bg-orange-700/30 text-orange-300"},
  pink:   { badge: "bg-pink-900/60 text-pink-300 border-pink-700",       dot: "bg-pink-500",   active: "bg-pink-700/30 text-pink-300"  },
  indigo: { badge: "bg-indigo-900/60 text-indigo-300 border-indigo-700", dot: "bg-indigo-500", active: "bg-indigo-700/30 text-indigo-300"},
  rose:   { badge: "bg-rose-900/60 text-rose-300 border-rose-700",       dot: "bg-rose-500",   active: "bg-rose-700/30 text-rose-300"  },
};

const API_ENTRIES = [
  // ── Core ──────────────────────────────────────────────────────────────
  {
    id: "working-memory", category: "core", type: "interface", name: "IWorkingMemoryEngine",
    description: "Memória de trabalho de sessão com TTL e isolamento por identityContext.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "store(item)", returns: "Promise<void>",            desc: "Armazena item com TTL e isolamento" },
      { name: "get(key, ctx)", returns: "WorkingMemoryRecord | null", desc: "Recupera item por chave e contexto" },
      { name: "remove(key, ctx)", returns: "void",               desc: "Remove item explicitamente" },
      { name: "getByContext(ctx)", returns: "WorkingMemoryRecord[]", desc: "Lista todos os itens do contexto" },
      { name: "promote(key, ctx)", returns: "Promise<void>",     desc: "Promove para memória de longo prazo" },
    ],
    events: ["memory.item.stored", "memory.item.expired", "memory.item.promoted"],
    snippet: `await memory.store({
  key:             "user:prefs",
  value:           { theme: "dark" },
  ttl:             30 * 60 * 1000,
  identityContext: "pessoal",
  priority:        "HIGH",
});

const prefs = memory.get("user:prefs", "pessoal");`,
    refs: ["MRS", "ADR-003"],
  },
  {
    id: "execution-engine", category: "core", type: "interface", name: "IExecutionEngine",
    description: "Executa sequências de PlanStep com rollback, segurança e auditoria automáticos.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "registerConnector(c)", returns: "void",             desc: "Registra connector para uso nos planos" },
      { name: "execute(plan, ctx)",   returns: "Promise<ExecutionResult>", desc: "Executa plano completo de steps" },
      { name: "listConnectors()",     returns: "ConnectorMetadata[]",     desc: "Lista connectors disponíveis" },
    ],
    events: ["execution.started", "execution.step.completed", "execution.step.failed", "execution.completed", "execution.rolled_back"],
    snippet: `const result = await execution.execute({
  planId:    "plan-001",
  sessionId: ctx.sessionId,
  userId:    ctx.userId,
  steps: [
    { stepId: "s1", connectorId: "http-connector",
      input: { url: "https://api.example.com" },
      required: true, isReversible: false, timeout: 10_000 },
  ],
}, ctx);

console.log(result.status); // "success" | "failed"`,
    refs: ["MCS", "ADR-001"],
  },
  {
    id: "journey-manager", category: "core", type: "interface", name: "IJourneyManager",
    description: "Gerencia o ciclo de vida completo de Journeys — unidade primária de experiência.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "create(input)",        returns: "Promise<Journey>",  desc: "Cria nova Journey em status 'draft'" },
      { name: "get(journeyId)",       returns: "Journey | null",    desc: "Recupera Journey por ID" },
      { name: "list(userId)",         returns: "Journey[]",         desc: "Lista todas as Journeys do usuário" },
      { name: "pause(id, reason?)",   returns: "Promise<void>",     desc: "Pausa Journey para input externo" },
      { name: "resume(id)",           returns: "Promise<void>",     desc: "Retoma Journey pausada" },
      { name: "complete(id, summary?)", returns: "Promise<void>",   desc: "Marca Journey como concluída" },
      { name: "archive(id)",          returns: "Promise<void>",     desc: "Arquiva Journey (soft delete)" },
      { name: "addEvent(id, event)",  returns: "Promise<void>",     desc: "Adiciona evento imutável ao log" },
    ],
    events: ["journey.created", "journey.status.changed", "journey.completed", "journey.archived"],
    snippet: `const j = await journeyManager.create({
  userId:          "user-123",
  title:           "Consulta CPF",
  identityContext: "pessoal",
  initialData:     { cpf: "123.456.789-00" },
});

await journeyManager.pause(j.journeyId, "awaiting_document");
await journeyManager.resume(j.journeyId);
await journeyManager.complete(j.journeyId, "Concluído com sucesso");`,
    refs: ["MRS", "ADR-005"],
  },
  {
    id: "event-bus", category: "eventbus", type: "interface", name: "IEventBus",
    description: "Comunicação assíncrona entre engines via prioridade. CRITICAL > HIGH > NORMAL > LOW.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "publish(event)",       returns: "Promise<void>",    desc: "Publica evento no bus" },
      { name: "subscribe(pattern, fn)", returns: "Subscription",  desc: "Subscreve com suporte a wildcards" },
      { name: "unsubscribe(sub)",     returns: "void",             desc: "Cancela subscrição" },
      { name: "getHistory(filter?)",  returns: "BusEvent[]",       desc: "Consulta histórico de eventos" },
      { name: "getDLQ()",             returns: "BusEvent[]",       desc: "Retorna eventos na Dead Letter Queue" },
      { name: "replayDLQ()",          returns: "Promise<void>",    desc: "Re-processa eventos da DLQ" },
    ],
    events: [],
    snippet: `// Publicar
await eventBus.publish({
  eventId:      crypto.randomUUID(),
  type:         "execution.step.completed",
  sourceEngine: "ExecutionEngine",
  priority:     "NORMAL",
  payload:      { stepId, duration: 120 },
  timestamp:    Date.now(),
});

// Subscrever com wildcard
const sub = eventBus.subscribe("execution.*", (event) => {
  console.log(event.type, event.payload);
});
eventBus.unsubscribe(sub);`,
    refs: ["ADR-004", "RFC-004"],
  },
  {
    id: "audit-trail", category: "audit", type: "interface", name: "IAuditTrail",
    description: "Registro imutável append-only. Todo AuditRecord é Object.freeze() imediatamente.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "record(entry)",   returns: "Promise<AuditRecord>", desc: "Registra ação — retorno é imutável" },
      { name: "query(filter)",   returns: "AuditRecord[]",        desc: "Consulta com filtros e wildcards" },
      { name: "export(filter, fmt)", returns: "string",           desc: "Exporta como 'json' ou 'csv'" },
    ],
    events: [],
    snippet: `const record = await audit.record({
  action:    "connector.execute",
  userId:    ctx.userId,
  sessionId: ctx.sessionId,
  outcome:   "success",
  details:   { connectorId, duration: 120 },
});
// record.immutable === true

const records = audit.query({
  action: "connector.*",
  since:  Date.now() - 86_400_000,
});`,
    refs: ["ADR-006"],
  },
  {
    id: "security-gate", category: "security", type: "interface", name: "ISecurityGate",
    description: "Pipeline Permission → Risk → Policy antes de toda ação externa. Nunca bypassável.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "evaluate(request)", returns: "SecurityDecision", desc: "Avalia risco — OBRIGATÓRIO antes de ação externa" },
      { name: "addPolicy(policy)", returns: "void",             desc: "Registra política customizada" },
      { name: "removePolicy(id)",  returns: "void",             desc: "Remove política por ID" },
      { name: "listPolicies()",    returns: "PolicyMetadata[]", desc: "Lista políticas ativas" },
    ],
    events: ["security.action.blocked", "security.approval.required"],
    snippet: `const decision = security.evaluate({
  userId:          ctx.userId,
  sessionId:       ctx.sessionId,
  action:          "connector.execute",
  resource:        connectorId,
  estimatedImpact: "HIGH",
  isReversible:    false,
});

if (!decision.authorized) throw new Error(decision.reason);
if (decision.requiresApproval) {
  await journeyManager.pause(ctx.journeyId, "awaiting_approval");
  return { requiresApproval: true };
}`,
    refs: ["ADR-002", "MDIS"],
  },
  // ── Connector ─────────────────────────────────────────────────────────
  {
    id: "iconnector", category: "connector", type: "interface", name: "IConnector",
    description: "Interface base obrigatória para todos os Connectors. Isolamento total do Core.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "execute(input, ctx)",   returns: "Promise<ConnectorResult>", desc: "Execução principal — sempre retorna ConnectorResult" },
      { name: "rollback?(prev, ctx)",  returns: "Promise<void>",            desc: "Opcional — obrigatório se isReversible=true" },
      { name: "healthCheck()",         returns: "Promise<HealthCheckResult>",desc: "Estado do connector" },
      { name: "getMetadata()",         returns: "ConnectorMetadata",         desc: "Metadados estáticos" },
    ],
    events: [],
    snippet: `export class MyConnector implements IConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    if (!input) return {
      status: "failure", errorCode: "MISSING_FIELD",
      errorMsg: "input required", auditLog: [], resourceRef: ""
    };
    return {
      status:      "success",
      outputData:  { ok: true },
      auditLog:    [\`done at \${new Date().toISOString()}\`],
      resourceRef: \`ref:\${ctx.executionId}:\${ctx.stepId}\`,
    };
  }

  async healthCheck() { return { status: "healthy" as const, checkedAt: Date.now() }; }
  getMetadata() { return { connectorId: this.connectorId, version: this.version,
    capabilities: [], riskLevel: "LOW" as const, isReversible: true }; }
}`,
    refs: ["MCF", "ADR-001", "MDH Cap.8"],
  },
  // ── Specialist ────────────────────────────────────────────────────────
  {
    id: "ispecialist", category: "specialist", type: "interface", name: "ISpecialist",
    description: "Interface para Specialists de domínio. canHandle() deve ser determinístico e rápido.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "canHandle(query)", returns: "boolean",                 desc: "Determinístico, sem chamadas externas" },
      { name: "process(query, ctx)", returns: "Promise<SpecialistResult>", desc: "Processamento principal do domínio" },
      { name: "getMetadata()",    returns: "SpecialistMetadata",      desc: "Metadados do specialist" },
    ],
    events: [],
    snippet: `export class FinancialSpecialist implements ISpecialist {
  readonly specialistId = "financial-specialist";
  readonly domain       = "financial";
  readonly capabilities = ["tax", "investment"];

  canHandle(query: string): boolean {
    const kw = ["imposto", "investimento", "orçamento"];
    return kw.some(k => query.toLowerCase().includes(k));
  }

  async process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult> {
    const nodes = ctx.knowledgeProvider.getByDomain(this.domain);
    return {
      specialistId: this.specialistId,
      response:     "Análise financeira concluída",
      confidence:   0.90,
      reasoning:    ["Intent financeiro detectado"],
      sources:      nodes.map(n => n.nodeId),
      recommendations: [],
    };
  }

  getMetadata() { return { specialistId: this.specialistId, domain: this.domain,
    version: "1.0.0", languages: ["pt-BR"], expertise: { tax: 0.9 } }; }
}`,
    refs: ["MCIS", "MDH Cap.9"],
  },
  // ── Knowledge ─────────────────────────────────────────────────────────
  {
    id: "knowledge-provider", category: "knowledge", type: "interface", name: "IKnowledgeProvider",
    description: "Acesso aos Knowledge Packages registrados. Busca e ranking por relevância.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "getByDomain(domain, intent?)", returns: "KnowledgeNode[]", desc: "Nodes por domínio e intenção" },
      { name: "getByNodeId(nodeId)",          returns: "KnowledgeNode | null", desc: "Node específico" },
      { name: "search(query, opts?)",         returns: "KnowledgeNode[]", desc: "Busca semântica nos nodes" },
      { name: "rank(nodes, query)",           returns: "KnowledgeNode[]", desc: "Ordena nodes por relevância" },
    ],
    events: [],
    snippet: `// Busca por domínio
const nodes = ctx.knowledgeProvider.getByDomain("legal", "contrato");

// Busca semântica
const results = ctx.knowledgeProvider.search("multa rescisão", {
  domain:        "legal",
  minConfidence: 0.8,
  limit:         5,
});

// Ranking por relevância
const ranked = ctx.knowledgeProvider.rank(nodes, query);`,
    refs: ["MGIS"],
  },
  // ── SDK ───────────────────────────────────────────────────────────────
  {
    id: "sdk-init", category: "sdk", type: "function", name: "createMemoryOSRuntime()",
    description: "Ponto de entrada do Core SDK. Inicializa todos os engines com configuração.",
    stability: "stable", version: "1.0",
    methods: [
      { name: "createMemoryOSRuntime(config)", returns: "MemoryOSRuntime", desc: "Inicializa runtime com todos os engines" },
    ],
    events: [],
    snippet: `import { createMemoryOSRuntime } from "@memoryos/core-sdk";

const runtime = createMemoryOSRuntime({
  userId:          "user-123",
  identityContext: "pessoal",
  config: {
    memory:   { maxCapacity: 500 },
    security: { defaultRiskLevel: "MEDIUM" },
    audit:    { enabled: true },
  },
});

const { memory, execution, journey, eventBus, audit, security } = runtime;`,
    refs: ["MDPS"],
  },
  // ── Errors ────────────────────────────────────────────────────────────
  {
    id: "error-codes", category: "errors", type: "enum", name: "Error Codes",
    description: "Códigos de erro padronizados para ConnectorResult e exceções do sistema.",
    stability: "stable", version: "1.0",
    methods: [],
    events: [],
    snippet: `// Validation
"VALIDATION_ERROR"        // Input inválido
"TYPE_MISMATCH"           // Tipo incompatível
"MISSING_FIELD"           // Campo obrigatório ausente

// Permission
"PERMISSION_DENIED"       // SecurityGate bloqueou
"APPROVAL_REQUIRED"       // Aguardando aprovação humana
"IDENTITY_CONTEXT_MISMATCH" // Acesso a contexto não autorizado

// Execution
"CONNECTOR_NOT_FOUND"     // connectorId não registrado
"EXECUTION_TIMEOUT"       // Timeout excedido
"EXECUTION_FAILED"        // Step required falhou
"ROLLBACK_FAILED"         // Rollback não executou

// Connector
"CONNECTOR_UNAVAILABLE"   // healthCheck = "down"
"EXTERNAL_API_ERROR"      // Serviço externo retornou erro

// Timeout / Retry
"TIMEOUT"                 // timeoutMs excedido
"MAX_RETRIES_EXCEEDED"    // Máximo de tentativas atingido`,
    refs: ["MDH Cap.11"],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────

function CodeSnippet({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden mt-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <span className="text-xs text-zinc-500 font-mono">TypeScript</span>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <pre className="p-3 text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

function MethodRow({ m }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
      <code className="text-violet-400 text-xs font-mono shrink-0 mt-0.5">{m.name}</code>
      <div className="flex-1 min-w-0">
        <p className="text-zinc-400 text-xs">{m.desc}</p>
      </div>
      <code className="text-green-400 text-xs font-mono shrink-0">{m.returns}</code>
    </div>
  );
}

function ApiCard({ entry, expanded, onToggle, color }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.violet;
  const TypeBadge = { interface: "I", function: "fn", enum: "E", class: "C" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-start justify-between px-4 py-3.5 hover:bg-zinc-800/60 transition-colors text-left gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border ${c.badge}`}>
            {TypeBadge[entry.type] ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-mono font-semibold text-sm">{entry.name}</span>
              <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-1.5 py-0.5 rounded">v{entry.version} stable</span>
            </div>
            <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1">{entry.description}</p>
          </div>
        </div>
        <ChevronRight size={16} className={`text-zinc-500 shrink-0 mt-1 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          <p className="text-zinc-300 text-sm">{entry.description}</p>

          {entry.methods.length > 0 && (
            <div>
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Métodos Públicos</h4>
              <div className="bg-zinc-950 rounded-lg border border-zinc-800 px-3 divide-y divide-zinc-800">
                {entry.methods.map(m => <MethodRow key={m.name} m={m} />)}
              </div>
            </div>
          )}

          {entry.events.length > 0 && (
            <div>
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Eventos Publicados</h4>
              <div className="flex flex-wrap gap-1.5">
                {entry.events.map(ev => (
                  <span key={ev} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded font-mono border border-zinc-700">{ev}</span>
                ))}
              </div>
            </div>
          )}

          {entry.snippet && (
            <div>
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Exemplo</h4>
              <CodeSnippet code={entry.snippet} />
            </div>
          )}

          {entry.refs.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-zinc-600">Refs:</span>
              {entry.refs.map(r => (
                <span key={r} className={`text-xs border px-1.5 py-0.5 rounded font-mono ${c.badge}`}>{r}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function ApiReference() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    let list = API_ENTRIES;
    if (activeCategory !== "all") list = list.filter(e => e.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.methods.some(m => m.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCategory, search]);

  const getCategoryColor = (id) => CATEGORIES.find(c => c.id === id)?.color ?? "violet";

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Left Sidebar */}
      <div className="hidden md:flex flex-col w-56 bg-zinc-900 border-r border-zinc-800 shrink-0">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <Code size={15} className="text-violet-400" />
            <span className="text-sm font-bold text-white">API Reference</span>
          </div>
          <p className="text-xs text-zinc-500">MPAR v1.0 · Foundation v1.0</p>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          <button
            onClick={() => setActiveCategory("all")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium mb-1 transition-colors ${activeCategory === "all" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
            Todas as APIs
            <span className="ml-auto text-zinc-600">{API_ENTRIES.length}</span>
          </button>
          {CATEGORIES.map(cat => {
            const count = API_ENTRIES.filter(e => e.category === cat.id).length;
            const c = COLOR_MAP[cat.color];
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium mb-0.5 transition-colors ${activeCategory === cat.id ? `${c.active}` : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}
              >
                <Icon size={13} className="shrink-0" />
                {cat.label}
                {count > 0 && <span className="ml-auto text-zinc-600 text-xs">{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-zinc-800 space-y-1">
          <Link to="/developer-handbook" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-violet-400 transition-colors">
            <BookOpen size={11} /> Dev Handbook
          </Link>
          <Link to="/foundation" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-violet-400 transition-colors">
            <ExternalLink size={11} /> Foundation v1.0
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 relative max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar interface, método..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
            />
          </div>
          {/* Mobile category */}
          <select
            value={activeCategory}
            onChange={e => setActiveCategory(e.target.value)}
            className="md:hidden bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="all">Todas</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-1 rounded hidden sm:block">Official</span>
            <span className="text-xs text-zinc-600 hidden sm:block">MPAR v1.0</span>
          </div>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            {/* Category header */}
            {activeCategory !== "all" && (
              <div className="flex items-center gap-2 mb-4">
                {(() => { const cat = CATEGORIES.find(c => c.id === activeCategory); const Icon = cat?.icon ?? Code; return <Icon size={16} className="text-zinc-400" />; })()}
                <h2 className="text-white font-bold">{CATEGORIES.find(c => c.id === activeCategory)?.label}</h2>
                <span className="text-zinc-500 text-sm">— {filtered.length} {filtered.length === 1 ? "interface" : "interfaces"}</span>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="text-center text-zinc-500 py-20">
                <Search size={36} className="mx-auto mb-3 opacity-20" />
                <p>Nenhuma API encontrada para "{search}"</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(entry => (
                  <ApiCard
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    color={getCategoryColor(entry.category)}
                  />
                ))}
              </div>
            )}

            {/* Stability footer */}
            <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-xs text-zinc-500">
                Toda API documentada é <span className="text-green-400">estável</span> e parte da Foundation v1.0.
                Mudanças requerem RFC → ADR → MRI → MQCCS → Release.
              </p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <Link to="/developer-handbook" className="text-xs text-violet-400 hover:underline">Dev Handbook</Link>
                <span className="text-zinc-700">·</span>
                <Link to="/foundation" className="text-xs text-violet-400 hover:underline">Foundation</Link>
                <span className="text-zinc-700">·</span>
                <Link to="/mpegs" className="text-xs text-violet-400 hover:underline">MPEGS</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}