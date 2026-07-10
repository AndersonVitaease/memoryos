import React, { useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, Shield, Zap, BarChart2, Code, BookOpen, GitBranch, Target, Lightbulb, AlertCircle, ArrowRight } from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const GENERAL_REVIEW = [
  { aspect: "Arquitetura",      score: 9.2, note: "Excelente separação em camadas: interfaces → tipos → core → engine. Dependency Inversion aplicado. Único ponto de melhoria: WorkingMemoryStore não é injetado via interface." },
  { aspect: "Organização",      score: 9.5, note: "Estrutura de pastas clara e convencional. Cada arquivo tem responsabilidade única. Nomes de módulos são autoexplicativos." },
  { aspect: "Legibilidade",     score: 9.3, note: "JSDoc completo em todos os métodos públicos. Comentários com referências à Foundation (ex: 'MRS Cap.3'). Código denso mas legível." },
  { aspect: "Coesão",           score: 9.0, note: "Alta coesão em todos os componentes. WorkingMemoryStore faz apenas store. AuditLogger apenas audit. Nenhuma classe tem mais de uma responsabilidade central." },
  { aspect: "Acoplamento",      score: 7.5, note: "Baixo acoplamento entre camadas, mas WorkingMemoryEngine instancia WorkingMemoryStore, MemoryAuditLogger e MemoryEventEmitter diretamente (new). Não há injeção de dependências — dificulta substituição em testes e extensão futura." },
  { aspect: "Escalabilidade",   score: 7.0, note: "Estrutura em memória (Map) não escala além de um processo. Particionamento por contexto é correto conceitualmente. Ausência de persistência limita escalabilidade horizontal. Previsto para Sprint 5 (EPIC-004)." },
  { aspect: "Extensibilidade",  score: 8.0, note: "Interfaces bem definidas facilitam extensão. Adição de novo EvictionPolicy ou PromotionPolicy exigiria refatoração interna do WorkingMemoryEngine por falta de interfaces de política." },
  { aspect: "Performance",      score: 9.5, note: "Todas as operações core são O(1) via Map. Eviction de capacidade é O(n) — único gargalo identificado. Tests confirmam p95 < 10ms." },
  { aspect: "Segurança",        score: 9.0, note: "Isolamento por IdentityContext funcional e testado. Object.freeze() em AuditRecords e MemoryEvents garante integridade. Validação de entrada com MemoryValidationError cobrindo todos os campos críticos." },
  { aspect: "Observabilidade",  score: 9.2, note: "AuditTrail completo com correlationId em todas as operações. EventEmitter com histórico bounded (1000). Método queryAudit com filtros flexíveis. Stats por contexto disponíveis." },
  { aspect: "Testabilidade",    score: 8.5, note: "Engine instancia dependências internamente, dificultando mock. Métodos _clearForTesting() presentes mas indicam ausência de injeção. Suíte de testes sólida com 40+ casos." },
];

const FOUNDATION_ADHERENCE = [
  { doc: "MV",    status: "✓", note: "Engine implementa conceito de 'memória viva e permanente'. Isolamento por contexto alinha com princípio de identidade contínua." },
  { doc: "MPS",   status: "✓", note: "Working Memory é a camada de curto prazo definida no produto. TTL por prioridade alinha com jornadas do usuário." },
  { doc: "MAS",   status: "✓", note: "Separação clara Core / Store / Interface. Nenhum vazamento entre camadas arquiteturais." },
  { doc: "MDS",   status: "✓", note: "Segue Architectural Principles: Event-Driven (MemoryEventEmitter), Separation of Concerns (Store/Engine/Audit), Immutability (Object.freeze)." },
  { doc: "MRS",   status: "✓", note: "Cap.3 implementado: WorkingMemoryItem com TTL, priority, accessCount. Cap.5: eventos publicados corretamente conforme catálogo MREM." },
  { doc: "MCS",   status: "⚠", note: "Princípio de Inversion of Control parcialmente seguido. Store, Audit e EventEmitter são instanciados diretamente, não injetados via interface. Fronteiras do Core precisam de abstração." },
  { doc: "MDIS",  status: "✓", note: "Lógica de promoção é determinística: access_threshold, auto_promote_flag, manual. Sem ambiguidade." },
  { doc: "MIES",  status: "⚠", note: "Auto-promote por accessCount é o embrião do learning. Contudo, nenhuma política de aprendizado foi extraída como abstração (IMemoryPromotionPolicy). Necessário para Sprint 5+." },
  { doc: "MDPS",  status: "✓", note: "Interface IWorkingMemoryEngine é o contrato SDK para desenvolvedores. Documentação JSDoc alinha com MPAR." },
  { doc: "MGFS",  status: "✓", note: "Implementação rastreada ao Sprint 1 do MEB. Nenhuma mudança de Foundation executada sem RFC." },
  { doc: "MRI",   status: "✓", note: "Suíte de testes cobre todos os cenários do MRI: isolamento, TTL, eviction, audit, eventos, performance." },
  { doc: "MQCCS", status: "✓", note: "Accuracy de 100% nos testes. Object.freeze() em records críticos. MemoryValidationError com field identifier. Cobertura de concorrência e performance." },
  { doc: "MPAR",  status: "⚠", note: "IWorkingMemoryEngine cobre store/get/remove/findByKey/touch/promote/stats/runEviction/clearContext. IMemoryProvider e IWorkingMemoryEngine têm assinaturas divergentes (store recebe WorkingMemoryItem vs MemoryRecord). Alinhamento necessário." },
  { doc: "MREM",  status: "✓", note: "Catálogo de eventos Cap.4 completo: stored, retrieved, removed, expired, evicted, promoted, cleared, eviction_run. correlationId presente em todos." },
  { doc: "MEB",   status: "✓", note: "Sprint 1 entrega todos os itens definidos no backlog: interfaces, tipos, core, engine, testes." },
];

const INTERFACE_REVIEW = [
  {
    name: "IMemoryProvider",
    responsibility: "Contrato base para qualquer provider de memória.",
    issues: [
      { type: "⚠", text: "store() recebe MemoryRecord enquanto IWorkingMemoryEngine recebe WorkingMemoryItem. Tipos divergentes para a mesma operação semântica cria confusão e quebra o Liskov Substitution Principle." },
      { type: "⚠", text: "filter() usa MemoryFilter mas IWorkingMemoryEngine usa findByKey() com string — assinaturas incompatíveis impede que WorkingMemoryEngine implemente IMemoryProvider." },
      { type: "⚠", text: "evictExpired() em IMemoryProvider vs runEviction() em IWorkingMemoryEngine — nomenclatura inconsistente para a mesma operação." },
    ],
    suggestions: [
      "Unificar IMemoryProvider e IWorkingMemoryEngine em uma hierarquia coerente.",
      "Definir T genérico: IMemoryProvider<T extends MemoryRecord = MemoryRecord>.",
      "Renomear evictExpired → runEviction em IMemoryProvider para consistência.",
    ]
  },
  {
    name: "IWorkingMemoryEngine",
    responsibility: "Contrato específico do engine de working memory com TTL, eviction e promoção.",
    issues: [
      { type: "⚠", text: "Sem métodos de observabilidade na interface: onEvent() e queryAudit() existem na implementação mas não no contrato. Qualquer consumidor de IWorkingMemoryEngine não sabe que pode observar eventos." },
      { type: "ℹ", text: "destroy() (lifecycle) não está definido na interface. Importante para containers de injeção de dependências." },
      { type: "ℹ", text: "findByKey() suporta apenas prefixo. Não há suporte a regex ou filtros compostos — limitação futura." },
    ],
    suggestions: [
      "Adicionar onEvent(handler) e queryAudit() à interface.",
      "Adicionar destroy() para gerenciamento de lifecycle.",
      "Evoluir findByKey para find(filter: MemoryFilter) para maior expressividade.",
    ]
  },
];

const TYPE_REVIEW = [
  {
    name: "IdentityContext",
    status: "✓ Excelente",
    notes: [
      "Todos os campos são readonly — imutabilidade correta.",
      "buildPartitionKey() é puro e determinístico.",
      "isSamePartition() helper bem colocado no mesmo módulo.",
      "projectId opcional como terceiro nível de isolamento é elegante.",
    ],
    issues: ["Não há versão/schema version no tipo — dificulta migração futura de dados serializados."]
  },
  {
    name: "WorkingMemoryItem",
    status: "⚠ Bom com ressalvas",
    notes: [
      "id e key como readonly — correto.",
      "value: unknown é type-safe — boa prática.",
      "StoreResult e EvictedItemSummary são interfaces úteis mas não usadas no retorno de store() (retorna apenas string).",
    ],
    issues: [
      "accessCount e lastAccessedAt são mutáveis (sem readonly) — necessário para funcionamento mas viola princípio de imutabilidade do item. Solução: separar estado observacional (accessCount) do dado imutável.",
      "expiresAt mutável — correto funcionalmente mas abre risco de mutação acidental.",
      "StoreResult definido mas não usado no retorno da API pública. Dead type.",
    ]
  },
  {
    name: "MemoryRecord",
    status: "⚠ Redundante",
    notes: ["Estrutura quase idêntica a WorkingMemoryItem."],
    issues: [
      "MemoryRecord e WorkingMemoryItem são 95% iguais. WorkingMemoryItem deveria estender MemoryRecord ou ambos deveriam ser unificados.",
      "Divergência gera risco de drift entre as duas interfaces ao longo do tempo.",
    ]
  },
  {
    name: "MemoryFilter",
    status: "✓ Adequado",
    notes: ["Campos opcionais corretos. excludeExpired semântico. limit para paginação presente."],
    issues: ["Sem suporte a range de timestamps (storedBefore, storedAfter). Necessário para queries históricas."]
  },
  {
    name: "MemoryPriority",
    status: "✓ Excelente",
    notes: [
      "Enum numérico permite ordenação direta (item.priority < candidate.priority).",
      "DEFAULT_TTL_BY_PRIORITY bem definido e documentado.",
      "parsePriority() e priorityLabel() são helpers corretos.",
    ],
    issues: []
  },
  {
    name: "MemoryPromotionResult",
    status: "✓ Bom",
    notes: ["Todos os campos readonly. PromotionReason é union type — extensível."],
    issues: ["Sem campo para destino da promoção (ltmId, ltmProvider). Necessário quando Sprint 5 implementar LTM real."]
  },
  {
    name: "AuditRecord",
    status: "✓ Excelente",
    notes: [
      "Object.freeze() aplicado — imutabilidade garantida.",
      "correlationId presente — rastreabilidade total.",
      "durationMs calculado — observabilidade de performance.",
      "component hardcoded como 'WorkingMemoryEngine' — correto para Sprint 1.",
    ],
    issues: ["details tipado como Record<string, string|number|boolean> — não suporta objetos aninhados. Pode ser limitante para erros complexos."]
  },
  {
    name: "MemoryEvent",
    status: "✓ Excelente",
    notes: [
      "Object.freeze() em todos os eventos — integridade garantida.",
      "MEMORY_EVENT_PRIORITY mapeado corretamente.",
      "eventId único em cada evento — rastreabilidade.",
    ],
    issues: ["Sem campo de schema version — dificulta evolução do payload sem breaking change."]
  },
];

const DEPENDENCY_REVIEW = [
  {
    from: "Map (concreto)",
    to: "IWorkingMemoryStorage",
    reason: "WorkingMemoryStore usa Map diretamente. Para suportar Redis, IndexedDB ou qualquer backend persistente, o storage precisa de uma interface.",
    impact: "Alta — bloqueador para Sprint 5 (LTM persistente) e testes de integração.",
    priority: "ALTA",
    needsRfc: false
  },
  {
    from: "new MemoryAuditLogger()",
    to: "IAuditSink",
    reason: "WorkingMemoryEngine instancia MemoryAuditLogger diretamente. Impede substituição por sink externo (Datadog, OpenTelemetry, banco de dados).",
    impact: "Média — testes unitários precisam de mocks via _clearForTesting() em vez de injeção.",
    priority: "MÉDIA",
    needsRfc: false
  },
  {
    from: "new MemoryEventEmitter()",
    to: "IEventPublisher",
    reason: "EventEmitter é implementação local. Para integrar com EventBus real (EPIC-002), precisa de interface.",
    impact: "Alta — EventBus unificado é requisito de Runtime.",
    priority: "ALTA",
    needsRfc: false
  },
  {
    from: "Eviction inline (evictLowestPriority)",
    to: "IEvictionPolicy",
    reason: "Lógica de eviction hardcoded em WorkingMemoryStore. Políticas futuras (LRU, LFU, priority-weighted) exigem abstração.",
    impact: "Média — baixo risco no Sprint 1, mas dificulta personalização por domínio.",
    priority: "MÉDIA",
    needsRfc: false
  },
  {
    from: "accessCount >= 3 (hardcoded)",
    to: "IMemoryPromotionPolicy",
    reason: "Threshold de promoção automática está hardcoded (AUTO_PROMOTE_ACCESS_THRESHOLD = 3). Política de promoção deveria ser injetável.",
    impact: "Baixa no Sprint 1. Alta para MIES — learning engine precisa controlar políticas dinamicamente.",
    priority: "BAIXA",
    needsRfc: false
  },
  {
    from: "setInterval (concreto)",
    to: "IScheduler",
    reason: "Timer de eviction usa setInterval diretamente. Em environments Node.js com cluster ou workers, precisa de scheduler controlável.",
    impact: "Baixa atualmente. Importante para ambientes de produção.",
    priority: "BAIXA",
    needsRfc: false
  },
  {
    from: "generateId() (concreto)",
    to: "IIdGenerator",
    reason: "UUID gerado via função global. Para testes determinísticos, um IIdGenerator injetável permite sequências previsíveis.",
    impact: "Baixa — apenas testabilidade. crypto.randomUUID() é seguro.",
    priority: "BAIXA",
    needsRfc: false
  },
];

const ALGORITHM_REVIEW = [
  { op: "store()", complexity: "O(1)", worst: "O(n) (eviction)", status: "✓", note: "Map.set() é O(1). evictLowestPriority é O(n) — ocorre apenas quando partição está cheia (500 itens). Aceitável." },
  { op: "get()", complexity: "O(1)", worst: "O(1)", status: "✓", note: "Map.get() com verificação de TTL. Perfeito." },
  { op: "remove()", complexity: "O(1)", worst: "O(1)", status: "✓", note: "Map.delete() direto. Ótimo." },
  { op: "findByKey()", complexity: "O(n)", worst: "O(n)", status: "⚠", note: "Itera toda a partição para filtrar por prefixo. Com 500 itens é aceitável. Para escalabilidade: índice secundário por prefixo eliminaria para O(log n)." },
  { op: "touch()", complexity: "O(1)", worst: "O(1)", status: "✓", note: "Map.get() + mutação do campo. Ótimo." },
  { op: "promote()", complexity: "O(1)", worst: "O(1)", status: "✓", note: "Map.get() + registro de audit/evento. Ótimo." },
  { op: "runEviction()", complexity: "O(p×n)", worst: "O(p×n)", status: "⚠", note: "Itera todas as partições (p) e todos os itens de cada partição (n). Com muitos contextos pode ser lento. Solução: min-heap por expiresAt reduziria para O(k log n) onde k = número de expirados." },
  { op: "clearContext()", complexity: "O(1)", worst: "O(1)", status: "✓", note: "Map.clear() — O(1) amortizado. Excelente." },
  { op: "stats()", complexity: "O(n)", worst: "O(n)", status: "⚠", note: "Itera toda a partição. Contadores incrementais eliminariam para O(1)." },
  { op: "evictLowestPriority()", complexity: "O(n)", worst: "O(n)", status: "⚠", note: "Busca linear pelo menor. Uma min-heap por prioridade reduziria para O(log n) a cada store." },
];

const REFACTORING = {
  critical: [
    {
      title: "Unificar WorkingMemoryItem e MemoryRecord",
      motivation: "Duplicação de 95% dos campos. Drift futuro garantirá bugs silenciosos.",
      impact: "Elimina dead code, garante consistência entre IMemoryProvider e IWorkingMemoryEngine.",
      complexity: "Baixa",
      needsRfc: false,
    },
    {
      title: "Adicionar onEvent() e queryAudit() à IWorkingMemoryEngine",
      motivation: "Observabilidade está na implementação mas não no contrato público.",
      impact: "Qualquer consumidor da interface pode agora observar o engine sem depender da implementação.",
      complexity: "Baixa",
      needsRfc: false,
    },
  ],
  high: [
    {
      title: "Injetar WorkingMemoryStore via IWorkingMemoryStorage",
      motivation: "Necessário para Sprint 5 (LTM), testes de integração e backends alternativos.",
      impact: "Desacopla o engine do storage concreto. Permite Map, Redis, IndexedDB.",
      complexity: "Média",
      needsRfc: false,
    },
    {
      title: "Injetar MemoryEventEmitter via IEventPublisher",
      motivation: "Integração com EventBus real do Runtime (EPIC-002).",
      impact: "WorkingMemoryEngine passa a publicar no barramento unificado sem refatoração.",
      complexity: "Baixa",
      needsRfc: false,
    },
    {
      title: "Alinhar assinaturas de IMemoryProvider e IWorkingMemoryEngine",
      motivation: "Nomenclatura inconsistente (evictExpired vs runEviction, filter vs findByKey).",
      impact: "WorkingMemoryEngine pode implementar IMemoryProvider. Polimorfismo garantido.",
      complexity: "Baixa",
      needsRfc: false,
    },
  ],
  medium: [
    {
      title: "Extrair IEvictionPolicy",
      motivation: "Política de eviction hardcoded dificulta personalização por domínio.",
      impact: "Suporte a LRU, LFU, priority-weighted sem modificar WorkingMemoryStore.",
      complexity: "Média",
      needsRfc: false,
    },
    {
      title: "Extrair IMemoryPromotionPolicy",
      motivation: "Threshold de auto-promoção hardcoded impede MIES de controlar o learning.",
      impact: "Learning Engine pode injetar políticas de promoção dinâmicas.",
      complexity: "Baixa",
      needsRfc: false,
    },
    {
      title: "Substituir accessCount inline por estrutura separada de observação",
      motivation: "WorkingMemoryItem tem campos mutáveis (accessCount, lastAccessedAt) misturados com dados imutáveis.",
      impact: "Item se torna fully immutable. Contadores vivem em estrutura separada de acesso.",
      complexity: "Média",
      needsRfc: false,
    },
  ],
  low: [
    {
      title: "Adicionar schema version aos tipos serializáveis",
      motivation: "IdentityContext e MemoryEvent sem versão dificultam migração.",
      impact: "Compatibilidade forward garantida.",
      complexity: "Baixa",
      needsRfc: false,
    },
    {
      title: "Implementar índice secundário por prefixo de key",
      motivation: "findByKey() é O(n). Índice Map<prefix, Set<id>> reduziria para O(1).",
      impact: "Performance de busca com muitos itens por partição.",
      complexity: "Média",
      needsRfc: false,
    },
    {
      title: "Injetar IIdGenerator",
      motivation: "Tests determinísticos com sequências de ID previsíveis.",
      impact: "Apenas testabilidade.",
      complexity: "Baixa",
      needsRfc: false,
    },
  ]
};

const ADDITIONAL_TESTS = [
  { name: "Stress Test", desc: "10.000 stores/gets em paralelo. Verificar que não há memory leak, crashes ou inconsistências. Meta: 0 falhas." },
  { name: "Memory Leak Test", desc: "Criar engine, executar 1.000 operações, destruir. Verificar que Map não retém referências. Usar heap snapshot." },
  { name: "Fault Injection — AuditLogger crash", desc: "Handler de evento lança exceção. Verificar que engine não falha (já tem try/catch no emitter)." },
  { name: "Long Running Test", desc: "Engine rodando por 60 minutos com eviction automático. Verificar estabilidade do timer e ausência de drift." },
  { name: "Chaos Test", desc: "Operações aleatórias em ordem aleatória em múltiplos contextos simultâneos. Verificar isolamento sob stress." },
  { name: "Fuzz Test — validateStoreInput", desc: "Entradas inválidas aleatórias para validateStoreInput(). Verificar que nenhuma passa sem MemoryValidationError." },
  { name: "Recovery Test", desc: "Simular falha parcial (destroy() durante operação). Verificar que estado é consistente." },
  { name: "TTL Drift Test", desc: "Verificar que expiresAt não sofre drift acumulativo após múltiplos touch()." },
  { name: "Eviction Order Determinism", desc: "Verificar que evictLowestPriority() é determinístico: mesmo input → mesmo item removido." },
  { name: "Cross-domain Boundary Test", desc: "100 contextos distintos com 5 itens cada. Verificar que nenhum item vaza entre partições." },
];

const ACTION_PLAN = {
  mandatory: [
    "Unificar WorkingMemoryItem com MemoryRecord (ou definir hierarquia clara).",
    "Adicionar onEvent() e queryAudit() à interface IWorkingMemoryEngine.",
    "Alinhar nomenclatura IMemoryProvider / IWorkingMemoryEngine (evictExpired → runEviction, filter → findByKey).",
  ],
  optional: [
    "Injetar WorkingMemoryStore via IWorkingMemoryStorage.",
    "Injetar MemoryEventEmitter via IEventPublisher.",
    "Extrair IEvictionPolicy e IMemoryPromotionPolicy.",
    "Separar campos de observação (accessCount) do WorkingMemoryItem imutável.",
    "Adicionar schema version aos tipos serializáveis.",
  ],
  future: [
    "Implementar índice secundário por prefixo (Sprint 3+).",
    "Injetar IScheduler para ambiente de produção (Sprint 4+).",
    "Injetar IIdGenerator para testes determinísticos.",
    "Adicionar campo ltmId em MemoryPromotionResult para Sprint 5 (LTM).",
  ]
};

const LESSONS_LEARNED = {
  good: [
    "Object.freeze() em records e eventos — zero bugs de mutação acidental identificados nos testes.",
    "correlationId em todas as operações — rastreabilidade completa de ponta a ponta.",
    "MemoryValidationError com field identifier — erros imediatamente acionáveis.",
    "buildPartitionKey() como função pura — isolamento de contexto testável e determinístico.",
    "Suíte de testes com categorias (unitário, integração, performance, concorrência) — cobertura holística.",
    "Referências à Foundation nos comentários (ex: 'MRS Cap.3') — rastreabilidade entre código e spec.",
  ],
  improve: [
    "Instanciação direta de dependências no construtor — usar injeção de dependências desde Sprint 1.",
    "WorkingMemoryItem e MemoryRecord deveriam ter sido unificados desde o início.",
    "Observabilidade (onEvent, queryAudit) deveria estar na interface desde o primeiro draft.",
    "Eviction poderia ter sido abstração desde Sprint 1 (IEvictionPolicy é baixa complexidade).",
  ],
  reuse: [
    "Padrão partitionKey = userId::domain::projectId — adotar em TODOS os engines de memória futuros.",
    "Object.freeze() em todos os records de audit e eventos — padrão obrigatório do projeto.",
    "Suíte de testes com seções: unit / integration / performance / concurrency / isolation — template oficial.",
    "JSDoc com referência à Foundation — padrão de documentação do projeto.",
    "MemoryValidationError com field — padrão de erro de validação do projeto.",
  ],
  avoid: [
    "Nunca instanciar dependências diretamente no construtor de um componente central.",
    "Nunca criar dois tipos com 95% de sobreposição sem hierarquia explícita.",
    "Nunca expor capacidades de observabilidade apenas na implementação, sempre na interface.",
    "Nunca hardcodar thresholds de comportamento (auto-promote = 3) sem abstraí-los como configuração.",
  ]
};

// ─── Components ────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
function SectionHeader({ icon: SectionIcon, title, color = "violet" }) {
  const Icon = SectionIcon;
  const colors = {
    violet: "bg-violet-700",
    blue:   "bg-blue-700",
    green:  "bg-green-700",
    yellow: "bg-yellow-700",
    red:    "bg-red-700",
    zinc:   "bg-zinc-700",
  };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-base">{title}</h2>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === "✓") return <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded font-mono">✓ Aderente</span>;
  if (status === "⚠") return <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800 px-2 py-0.5 rounded font-mono">⚠ Parcial</span>;
  return <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono">✗ Não aderente</span>;
}

function PriorityBadge({ priority }) {
  const map = {
    "CRÍTICA": "bg-red-900/40 text-red-400 border-red-800",
    "ALTA":    "bg-orange-900/40 text-orange-400 border-orange-800",
    "MÉDIA":   "bg-yellow-900/40 text-yellow-400 border-yellow-800",
    "BAIXA":   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded border font-bold ${map[priority] ?? map["BAIXA"]}`}>{priority}</span>;
}

function ScoreBar({ score }) {
  const color = score >= 9 ? "bg-green-500" : score >= 7.5 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score * 10}%` }} />
      </div>
      <span className={`text-sm font-bold w-8 text-right ${score >= 9 ? "text-green-400" : score >= 7.5 ? "text-yellow-400" : "text-red-400"}`}>{score}</span>
    </div>
  );
}

function Collapsible({ title, badge, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </div>
      </button>
      {open && <div className="border-t border-zinc-800 px-4 py-3">{children}</div>}
    </div>
  );
}

const TABS = [
  { id: "overview",      label: "Visão Geral" },
  { id: "foundation",    label: "Foundation" },
  { id: "interfaces",    label: "Interfaces" },
  { id: "modeling",      label: "Modelagem" },
  { id: "implementation",label: "Implementação" },
  { id: "dependencies",  label: "Dependências" },
  { id: "algorithms",    label: "Algoritmos" },
  { id: "performance",   label: "Performance" },
  { id: "tests",         label: "Testes" },
  { id: "security",      label: "Segurança" },
  { id: "quality",       label: "Qualidade" },
  { id: "refactoring",   label: "Refatorações" },
  { id: "action",        label: "Action Plan" },
  { id: "gate",          label: "Sprint Gate" },
  { id: "lessons",       label: "Lessons Learned" },
];

// ─── Main ──────────────────────────────────────────────────────────────────

export default function Sprint1Review() {
  const [tab, setTab] = useState("overview");

  const avgScore = (GENERAL_REVIEW.reduce((s, r) => s + r.score, 0) / GENERAL_REVIEW.length).toFixed(1);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-700 flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MESR-001 — Engineering Sprint Review</h1>
              <p className="text-zinc-500 text-xs">Sprint 1: Working Memory Engine · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["MRI","MQCCS","Foundation v1.0","Sprint 1","Working Memory Engine"].map(b => (
              <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
            ))}
          </div>
        </div>

        {/* Tabs — scroll horizontal mobile */}
        <div className="overflow-x-auto mb-6">
          <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 min-w-max">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── CAP 1: VISÃO GERAL ─────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-4">
            <SectionHeader icon={BarChart2} title="Capítulo 1 — Revisão Geral" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Score Geral</span>
                <span className="text-3xl font-bold text-violet-400">{avgScore}<span className="text-zinc-600 text-lg">/10</span></span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 mt-2">
                <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Number(avgScore) * 10}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              {GENERAL_REVIEW.map(r => (
                <Collapsible key={r.aspect} title={r.aspect} badge={<ScoreBar score={r.score} />}>
                  <p className="text-zinc-300 text-sm">{r.note}</p>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 2: FOUNDATION ─────────────────────────────────────────── */}
        {tab === "foundation" && (
          <div className="space-y-4">
            <SectionHeader icon={BookOpen} title="Capítulo 2 — Aderência à Foundation" color="blue" />
            <div className="space-y-2">
              {FOUNDATION_ADHERENCE.map(f => (
                <Collapsible key={f.doc} title={f.doc} badge={<StatusBadge status={f.status} />}>
                  <p className="text-zinc-300 text-sm">{f.note}</p>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 3: INTERFACES ─────────────────────────────────────────── */}
        {tab === "interfaces" && (
          <div className="space-y-4">
            <SectionHeader icon={Code} title="Capítulo 3 — Revisão das Interfaces" color="violet" />
            {INTERFACE_REVIEW.map(iface => (
              <div key={iface.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <h3 className="font-mono text-violet-300 font-bold">{iface.name}</h3>
                <p className="text-zinc-400 text-sm">{iface.responsibility}</p>
                {iface.issues.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">Problemas</p>
                    <ul className="space-y-1.5">
                      {iface.issues.map((issue, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="shrink-0">{issue.type}</span>
                          <span className="text-zinc-300">{issue.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">Sugestões</p>
                  <ul className="space-y-1">
                    {iface.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-green-300">
                        <ArrowRight size={12} className="mt-0.5 shrink-0" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CAP 4: MODELAGEM ──────────────────────────────────────────── */}
        {tab === "modeling" && (
          <div className="space-y-4">
            <SectionHeader icon={Code} title="Capítulo 4 — Revisão da Modelagem" color="blue" />
            <div className="space-y-2">
              {TYPE_REVIEW.map(t => (
                <Collapsible key={t.name}
                  title={t.name}
                  badge={
                    <span className={`text-xs px-2 py-0.5 rounded border font-mono ${t.status.startsWith("✓") ? "bg-green-900/30 text-green-400 border-green-800" : "bg-yellow-900/30 text-yellow-400 border-yellow-800"}`}>
                      {t.status}
                    </span>
                  }
                >
                  {t.notes.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {t.notes.map((n, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />{n}</li>)}
                    </ul>
                  )}
                  {t.issues.length > 0 && (
                    <ul className="space-y-1">
                      {t.issues.map((n, i) => <li key={i} className="text-sm text-yellow-300 flex gap-2"><AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />{n}</li>)}
                    </ul>
                  )}
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 5: IMPLEMENTAÇÃO ──────────────────────────────────────── */}
        {tab === "implementation" && (
          <div className="space-y-4">
            <SectionHeader icon={Code} title="Capítulo 5 — Revisão da Implementação" color="green" />
            {[
              {
                name: "WorkingMemoryStore",
                score: "9.0",
                items: [
                  "✓ Isolamento por partitionKey — correto e testado",
                  "✓ evictLowestPriority é determinístico — empate resolvido por storedAt",
                  "✓ assertOwnership evita acesso cruzado",
                  "⚠ getAll() retorna itens expirados — caller deve filtrar (risco de bugs)",
                  "⚠ Sem interface — acoplamento direto com WorkingMemoryEngine",
                  "⚠ evictAllExpired itera Map dentro de Map — O(p×n)",
                ]
              },
              {
                name: "WorkingMemoryEngine",
                score: "9.0",
                items: [
                  "✓ Toda operação pública tem correlationId, audit e evento",
                  "✓ Auto-promote no get() é elegante e não bloqueia",
                  "✓ destroy() libera timer — sem memory leak",
                  "⚠ Dependências instanciadas diretamente (não injetadas)",
                  "⚠ dummyCtx em runEviction() é code smell — ação de sistema sem contexto real",
                  "⚠ get() muta item.accessCount — viola imutabilidade parcial do WorkingMemoryItem",
                ]
              },
              {
                name: "MemoryAuditLogger",
                score: "9.5",
                items: [
                  "✓ Object.freeze() em todos os records",
                  "✓ durationMs calculado — performance observável",
                  "✓ query() com filtros flexíveis",
                  "✓ _clearForTesting() segregado com underline convention",
                  "⚠ Records em memória — sem persistência. Audit log se perde ao destruir o engine",
                  "⚠ Sem limite máximo de records — possível memory pressure em sessões longas",
                ]
              },
              {
                name: "MemoryEventEmitter",
                score: "9.2",
                items: [
                  "✓ try/catch por handler — falha de um handler não quebra o engine",
                  "✓ MAX_HISTORY bounded em 1000 — sem memory leak de eventos",
                  "✓ Object.freeze() em todos os eventos",
                  "⚠ shift() em array para bounded history é O(n) — usar circular buffer",
                  "⚠ Sem interface (IEventPublisher) — dificulta integração com EventBus real",
                ]
              },
              {
                name: "Validators",
                score: "9.3",
                items: [
                  "✓ MemoryValidationError com field identifier — ótimo DX",
                  "✓ validateExtraTtl com limite de 48h — proteção contra TTL absurdo",
                  "✓ Funções puras e sem side effects",
                  "⚠ validateStoreInput usa Date.now() diretamente — impossível testar com timestamps fixos",
                  "⚠ Verificação de MemoryPriority redundante (verifica TS enum em JS runtime)",
                ]
              },
              {
                name: "UUID (generateId)",
                score: "9.5",
                items: [
                  "✓ crypto.randomUUID() com fallback manual — compatibilidade total",
                  "✓ Função pura sem side effects",
                  "ℹ Sem interface IIdGenerator — impossível injetar sequências determinísticas em testes",
                ]
              },
            ].map(comp => (
              <Collapsible key={comp.name} title={comp.name}
                badge={<span className="text-xs font-bold text-green-400">{comp.score}/10</span>}
              >
                <ul className="space-y-1.5">
                  {comp.items.map((item, i) => (
                    <li key={i} className={`text-sm flex gap-2 ${item.startsWith("✓") ? "text-zinc-300" : item.startsWith("⚠") ? "text-yellow-300" : "text-zinc-400"}`}>
                      <span className="shrink-0">{item.slice(0,1)}</span>
                      <span>{item.slice(2)}</span>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            ))}
          </div>
        )}

        {/* ── CAP 6: DEPENDÊNCIAS ───────────────────────────────────────── */}
        {tab === "dependencies" && (
          <div className="space-y-4">
            <SectionHeader icon={GitBranch} title="Capítulo 6 — Dependency Review" color="yellow" />
            <div className="space-y-2">
              {DEPENDENCY_REVIEW.map((d, i) => (
                <Collapsible key={i}
                  title={<span className="font-mono text-sm">{d.from} <ArrowRight size={12} className="inline mx-1 text-zinc-500" /> {d.to}</span>}
                  badge={<PriorityBadge priority={d.priority} />}
                >
                  <div className="space-y-2 text-sm">
                    <p className="text-zinc-300"><span className="text-zinc-500">Motivo: </span>{d.reason}</p>
                    <p className="text-zinc-300"><span className="text-zinc-500">Impacto: </span>{d.impact}</p>
                  </div>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 7: ALGORITMOS ─────────────────────────────────────────── */}
        {tab === "algorithms" && (
          <div className="space-y-4">
            <SectionHeader icon={Zap} title="Capítulo 7 — Algoritmos" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Operação</th>
                    <th className="px-4 py-2 text-left">Médio</th>
                    <th className="px-4 py-2 text-left">Pior</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {ALGORITHM_REVIEW.map(r => (
                    <tr key={r.op}>
                      <td className="px-4 py-2.5 font-mono text-zinc-200">{r.op}</td>
                      <td className={`px-4 py-2.5 font-mono ${r.complexity === "O(1)" ? "text-green-400" : "text-yellow-400"}`}>{r.complexity}</td>
                      <td className={`px-4 py-2.5 font-mono ${r.worst === "O(1)" ? "text-green-400" : r.worst.includes("n") ? "text-yellow-400" : "text-green-400"}`}>{r.worst}</td>
                      <td className="px-3 py-2.5 text-center text-lg">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              {ALGORITHM_REVIEW.filter(r => r.status === "⚠").map(r => (
                <div key={r.op} className="bg-yellow-950/30 border border-yellow-900/50 rounded-xl p-3">
                  <p className="font-mono text-yellow-300 text-sm font-semibold mb-1">{r.op}</p>
                  <p className="text-zinc-300 text-sm">{r.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 8: PERFORMANCE ────────────────────────────────────────── */}
        {tab === "performance" && (
          <div className="space-y-4">
            <SectionHeader icon={BarChart2} title="Capítulo 8 — Performance Review" color="green" />
            {[
              { title: "Latência", status: "✓ Excelente", detail: "Todos os métodos core (store, get, remove, touch) são O(1). Tests confirmam p95 < 10ms conforme target MPAR. Em ambiente real com payload maior o número pode variar — recomendado re-testar com objetos de 1KB, 10KB, 100KB." },
              { title: "Consumo de Memória", status: "⚠ Atenção", detail: "Working Memory in-process. 500 itens × 512 bytes (estimativa) = ~250KB por partição. Com 1.000 usuários simultâneos = ~250MB apenas de dados. AuditLogger sem limite superior acumula records indefinidamente — risco para sessões longas." },
              { title: "Escalabilidade", status: "⚠ Limitado ao Sprint 1", detail: "Single-process, in-memory. Horizontal scaling requer IWorkingMemoryStorage com backend distribuído (Redis). Previsto EPIC-004/Sprint 5. Não é bloqueador para desenvolvimento." },
              { title: "Concorrência", status: "✓ Adequado para JS", detail: "JavaScript é single-threaded. Não há race conditions no sentido de threads. Async/await correto. Operações concorrentes via Promise.all são seguras pois o event loop serializa o acesso ao Map." },
              { title: "Throughput", status: "✓ Alto", detail: "Map operations são O(1) amortizado. Estimativa conservadora: 100.000+ ops/segundo em hardware moderno. Gargalo real será a network/database quando IWorkingMemoryStorage for implementado." },
              { title: "Eviction Performance", status: "⚠ Atenção", detail: "runEviction() é O(p×n). Com 100 partições × 500 itens = 50.000 iterações a cada 5 minutos. Aceitável. Para escala maior: min-heap por expiresAt ou índice temporal reduziria drasticamente." },
              { title: "EventEmitter History", status: "⚠ Atenção", detail: "shift() em array de 1000 elementos é O(n). Para alto volume de eventos, substituir por circular buffer (ring buffer) com pointer, eliminando para O(1)." },
            ].map(item => (
              <div key={item.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-zinc-200 text-sm">{item.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono ${item.status.startsWith("✓") ? "bg-green-900/30 text-green-400 border-green-800" : "bg-yellow-900/30 text-yellow-400 border-yellow-800"}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-zinc-400 text-sm">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── CAP 9: TESTES ─────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <SectionHeader icon={CheckCircle} title="Capítulo 9 — Test Review" color="green" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
              {[
                { label: "Total de Testes", value: "40+", color: "text-violet-400" },
                { label: "Accuracy", value: "100%", color: "text-green-400" },
                { label: "Categorias", value: "9", color: "text-blue-400" },
                { label: "MRI Status", value: "✓ PASS", color: "text-green-400" },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Cobertura Atual</h3>
              <div className="grid grid-cols-2 gap-2">
                {["Unitários (store/get/remove/touch/promote/stats)", "Integração (audit + eventos)", "Performance (p95 < 10ms)", "Concorrência (50+ ops simultâneas)", "Identity Context Isolation (4 cenários)", "TTL (expiração + touch)", "Eviction (capacidade + prioridade)", "Auto-Promote (threshold 3 acessos)", "Validação de entrada (MemoryValidationError)", "Audit Completeness (freeze + correlationId)"].map(c => (
                  <div key={c} className="flex gap-2 text-xs text-zinc-300">
                    <CheckCircle size={11} className="text-green-400 mt-0.5 shrink-0" />{c}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Testes Adicionais Recomendados</h3>
              <div className="space-y-2">
                {ADDITIONAL_TESTS.map(t => (
                  <div key={t.name} className="border-l-2 border-violet-700 pl-3">
                    <p className="text-sm font-medium text-violet-300">{t.name}</p>
                    <p className="text-xs text-zinc-400">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CAP 10: SECURITY ──────────────────────────────────────────── */}
        {tab === "security" && (
          <div className="space-y-4">
            <SectionHeader icon={Shield} title="Capítulo 10 — Security Review" color="red" />
            {[
              { topic: "Identity Isolation", status: "✓", detail: "buildPartitionKey() garante separação total. Testado com 4 cenários de cross-context access. remove() de ctxA com ID de ctxB retorna false e não afeta o item." },
              { topic: "Thread Safety", status: "✓", detail: "JavaScript é single-threaded. Não existem race conditions de threads. Promise.all serializado pelo event loop. Seguro por design da linguagem." },
              { topic: "Race Conditions (async)", status: "⚠", detail: "await this.promote() dentro de get() pode causar eventos duplicados em cenário de muitos gets simultâneos com autoPromote. Promote poderia verificar se já foi promovido (flag isPromoted)." },
              { topic: "Input Validation", status: "✓", detail: "validateContext(), validateStoreInput(), validateExtraTtl() cobrem todos os campos críticos. MemoryValidationError é tipado com field. Sem injeção possível via key ou value (não há execução de strings)." },
              { topic: "DoS / Memory Exhaustion", status: "⚠", detail: "AuditLogger sem limite de records. Em sessões longas com alta frequência de operações, pode crescer indefinidamente. Adicionar MAX_AUDIT_RECORDS com ring buffer." },
              { topic: "Capacity Eviction", status: "✓", detail: "MAX_ITEMS_PER_PARTITION = 500 impede crescimento unbounded de uma partição. CRITICAL items nunca são evictados por capacidade — correto." },
              { topic: "Privilege Escalation", status: "✓", detail: "Nenhuma operação expõe dados de outro contexto. get() com ID válido mas contexto errado retorna null — sem leak de existência do item." },
              { topic: "Audit Integrity", status: "✓", detail: "Object.freeze() em todos os AuditRecords. Imutável após criação. correlationId rastreia toda a cadeia de operação." },
              { topic: "Event Integrity", status: "✓", detail: "Object.freeze() em todos os MemoryEvents. Handler crash não afeta engine (try/catch por handler). Sem possibilidade de modificar evento após emissão." },
            ].map(item => (
              <div key={item.topic} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-zinc-200 text-sm">{item.topic}</span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-zinc-400 text-sm">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── CAP 11: QUALIDADE ─────────────────────────────────────────── */}
        {tab === "quality" && (
          <div className="space-y-4">
            <SectionHeader icon={Target} title="Capítulo 11 — Code Quality" color="blue" />
            {[
              { principle: "SRP (Single Responsibility)", status: "✓", detail: "WorkingMemoryStore: apenas storage. MemoryAuditLogger: apenas audit. MemoryEventEmitter: apenas eventos. WorkingMemoryEngine: orchestração. Cada classe tem uma única razão para mudar." },
              { principle: "OCP (Open/Closed)", status: "⚠", detail: "Aberto para extensão via interfaces de engine. Fechado para modificação nas operações core. Porém: para adicionar nova política de eviction, é necessário modificar WorkingMemoryStore — IEvictionPolicy resolveria isso." },
              { principle: "LSP (Liskov Substitution)", status: "⚠", detail: "IMemoryProvider e IWorkingMemoryEngine têm assinaturas divergentes. WorkingMemoryEngine NÃO pode substituir IMemoryProvider sem adaptação. Necessária unificação de tipos." },
              { principle: "ISP (Interface Segregation)", status: "✓", detail: "IMemoryProvider e IWorkingMemoryEngine são interfaces separadas com propósitos distintos. Nenhuma interface força implementações desnecessárias." },
              { principle: "DIP (Dependency Inversion)", status: "⚠", detail: "WorkingMemoryEngine depende de concretizações (WorkingMemoryStore, MemoryAuditLogger, MemoryEventEmitter) em vez de abstrações. Violação parcial — resolvida com injeção de dependências." },
              { principle: "Clean Architecture", status: "✓", detail: "Camadas bem definidas: types → interfaces → core → engine. Dependências sempre apontam para dentro (do engine para o core, do core para os tipos)." },
              { principle: "Hexagonal (Ports & Adapters)", status: "⚠", detail: "IWorkingMemoryEngine é o Port. WorkingMemoryEngine é o Adapter primário. Faltam Adapters secundários (Storage, EventBus, AuditSink) como Ports abstratos." },
              { principle: "DDD", status: "✓", detail: "IdentityContext como Value Object. WorkingMemoryItem como Entity. MemoryAuditRecord como Domain Event. Nomenclatura alinhada com linguagem ubíqua do domínio (promote, evict, touch)." },
              { principle: "Clean Code", status: "9/10", detail: "Funções pequenas e com nome descritivo. Sem magic numbers (constantes nomeadas). JSDoc completo. Único ponto a melhorar: dummyCtx em runEviction() é confuso." },
            ].map(item => (
              <Collapsible key={item.principle} title={item.principle}
                badge={<StatusBadge status={typeof item.status === "string" && item.status.length <= 1 ? item.status : "⚠"} />}
              >
                <p className="text-zinc-300 text-sm">{item.detail}</p>
              </Collapsible>
            ))}
          </div>
        )}

        {/* ── CAP 12: REFATORAÇÕES ──────────────────────────────────────── */}
        {tab === "refactoring" && (
          <div className="space-y-4">
            <SectionHeader icon={AlertCircle} title="Capítulo 12 — Refatorações Recomendadas" color="yellow" />
            {[
              { label: "Críticas", items: REFACTORING.critical, color: "border-red-800 bg-red-950/20", badge: "bg-red-900/40 text-red-400 border-red-800" },
              { label: "Altas", items: REFACTORING.high, color: "border-orange-800 bg-orange-950/20", badge: "bg-orange-900/40 text-orange-400 border-orange-800" },
              { label: "Médias", items: REFACTORING.medium, color: "border-yellow-800 bg-yellow-950/20", badge: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
              { label: "Baixas", items: REFACTORING.low, color: "border-zinc-700 bg-zinc-900/50", badge: "bg-zinc-800 text-zinc-400 border-zinc-700" },
            ].map(group => (
              <div key={group.label}>
                <h3 className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border inline-block mb-3 ${group.badge}`}>{group.label}</h3>
                <div className="space-y-2">
                  {group.items.map((item, i) => (
                    <div key={i} className={`border rounded-xl p-4 ${group.color}`}>
                      <p className="font-semibold text-zinc-200 text-sm mb-1">{item.title}</p>
                      <p className="text-xs text-zinc-400 mb-1"><span className="text-zinc-500">Motivação: </span>{item.motivation}</p>
                      <p className="text-xs text-zinc-400"><span className="text-zinc-500">Impacto: </span>{item.impact}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CAP 13: ACTION PLAN ───────────────────────────────────────── */}
        {tab === "action" && (
          <div className="space-y-4">
            <SectionHeader icon={Target} title="Capítulo 13 — Action Plan" color="violet" />
            {[
              { title: "🔴 Obrigatório antes do Sprint 2", items: ACTION_PLAN.mandatory, color: "border-red-900 bg-red-950/20" },
              { title: "🟡 Opcional — recomendado", items: ACTION_PLAN.optional, color: "border-yellow-900 bg-yellow-950/20" },
              { title: "🔵 Futuro — Sprint 3+", items: ACTION_PLAN.future, color: "border-blue-900 bg-blue-950/20" },
            ].map(group => (
              <div key={group.title} className={`border rounded-xl p-4 ${group.color}`}>
                <h3 className="font-semibold text-zinc-200 text-sm mb-3">{group.title}</h3>
                <ul className="space-y-1.5">
                  {group.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-300">
                      <ArrowRight size={12} className="mt-0.5 shrink-0 text-zinc-500" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ── CAP 14: SPRINT GATE ───────────────────────────────────────── */}
        {tab === "gate" && (
          <div className="space-y-4">
            <SectionHeader icon={Shield} title="Capítulo 14 — Sprint Gate" color="green" />
            <div className="bg-gradient-to-br from-green-950 to-emerald-950 border border-green-700 rounded-xl p-6 text-center mb-4">
              <div className="text-5xl mb-2">✅</div>
              <h2 className="text-white font-bold text-xl mb-1">Sprint 1 — APROVADO COM RESSALVAS</h2>
              <p className="text-green-300 text-sm">O Sprint 2 pode iniciar após as 3 refatorações críticas</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-zinc-200">Justificativa Técnica</h3>
              {[
                { label: "Funcionalidade", result: "✓ Completa", note: "Todos os contratos definidos no MEB estão implementados e testados." },
                { label: "Conformidade MRI", result: "✓ 100%", note: "40+ testes passando com 100% de accuracy." },
                { label: "Foundation Compliance", result: "⚠ 12/15", note: "3 documentos parcialmente aderentes (MCS, MIES, MPAR)." },
                { label: "Qualidade", result: "⚠ 8.5/10", note: "Acoplamento direto de dependências é o maior gap. Não bloqueia Sprint 2." },
                { label: "Segurança", result: "✓ Adequada", note: "Isolamento funcional. Sem vulnerabilidades críticas identificadas." },
                { label: "Performance", result: "✓ MQCCS Pass", note: "p95 < 10ms em store/get/remove." },
              ].map(item => (
                <div key={item.label} className="flex gap-3 text-sm">
                  <span className="text-zinc-500 w-40 shrink-0">{item.label}</span>
                  <span className={`font-mono shrink-0 ${item.result.startsWith("✓") ? "text-green-400" : "text-yellow-400"}`}>{item.result}</span>
                  <span className="text-zinc-400">{item.note}</span>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-red-900/50 rounded-xl p-4">
              <h3 className="font-semibold text-red-300 text-sm mb-2">Pré-condições para Sprint 2</h3>
              {ACTION_PLAN.mandatory.map((item, i) => (
                <div key={i} className="flex gap-2 text-sm text-zinc-300 mb-1">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />{item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CAP 15: LESSONS LEARNED ───────────────────────────────────── */}
        {tab === "lessons" && (
          <div className="space-y-4">
            <SectionHeader icon={Lightbulb} title="Capítulo 15 — Lessons Learned" color="yellow" />
            {[
              { title: "✅ O que funcionou bem", items: LESSONS_LEARNED.good, color: "border-green-900", icon: CheckCircle, iconColor: "text-green-400" },
              { title: "⚠️ O que pode melhorar", items: LESSONS_LEARNED.improve, color: "border-yellow-900", icon: AlertTriangle, iconColor: "text-yellow-400" },
              { title: "♻️ Padrões a reutilizar", items: LESSONS_LEARNED.reuse, color: "border-blue-900", icon: ArrowRight, iconColor: "text-blue-400" },
              { title: "🚫 Práticas a evitar", items: LESSONS_LEARNED.avoid, color: "border-red-900", icon: XCircle, iconColor: "text-red-400" },
            ].map(group => (
              <div key={group.title} className={`bg-zinc-900 border rounded-xl p-4 ${group.color}`}>
                <h3 className="font-semibold text-zinc-200 text-sm mb-3">{group.title}</h3>
                <ul className="space-y-2">
                  {group.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-300">
                      <group.icon size={12} className={`mt-0.5 shrink-0 ${group.iconColor}`} />{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}