// ─── Sprint 1 Review Metadata ─────────────────────────────────────────────────
// Dados estáticos APENAS desta Sprint — separados da UI e do Aggregator
// Foundation v1.0

import type {
  ComplianceSection, Finding, Placeholder,
  AbstractionRecommendation, QualitySection,
} from "./ReviewReport";

export const SPRINT1_COMPLIANCE: ComplianceSection[] = [
  {
    title: "Foundation v1.0 Compliance",
    items: [
      { item: "IMemoryProvider contrato público definido", status: "ok", note: "interfaces.ts — MDS Cap.3 aderente" },
      { item: "IdentityContext com userId + projectId obrigatórios", status: "ok", note: "types.ts + validateContext" },
      { item: "Isolamento de namespace por contexto (userId::projectId)", status: "ok", note: "contextNamespace — determinístico" },
      { item: "TTL com expiresAt calculado no store", status: "ok", note: "computeExpiresAt + isExpired" },
      { item: "Auto-evict no retrieve de itens expirados", status: "ok", note: "WME.retrieve linha 73" },
      { item: "Promotion working → long_term com remoção de TTL", status: "ok", note: "WME.promote — expiresAt = null" },
      { item: "AuditTrail em todas as operações", status: "ok", note: "store/retrieve/evict/promote/clear auditados" },
      { item: "EventBus publicado em todas as operações", status: "ok", note: "publisher.publish em todos os métodos" },
      { item: "Listener errors isolados no EventPublisher", status: "ok", note: "try/catch por listener" },
      { item: "WMEStats retorna totalItems + byPriority + expiredItems", status: "ok", note: "stats() completo" },
      { item: "promotedItems sempre 0 em WMEStats", status: "warn", note: "contador não incrementado ao promover — Sprint 2" },
      { item: "sessionId opcional em IdentityContext não usado no namespace", status: "warn", note: "campo definido, não integrado no isolamento" },
    ],
  },
  {
    title: "MREM — Runtime Execution Model",
    items: [
      { item: "Operações assíncronas (Promise) em todas as APIs públicas", status: "ok" },
      { item: "Validação antes de qualquer side-effect", status: "ok", note: "validate antes de store/evict" },
      { item: "Erros lançados com mensagens descritivas", status: "ok" },
      { item: "Retornos tipados — sem any/unknown nos resultados", status: "ok" },
      { item: "Side effects (event + audit) após mutação de estado", status: "ok" },
      { item: "evictExpired não audita se nada expirou (0 evictions)", status: "warn", note: "Comportamento aceitável mas pode obscurecer monitoramento" },
    ],
  },
  {
    title: "MPAR — Public API Reference",
    items: [
      { item: "IMemoryProvider — 8 métodos públicos documentados", status: "ok" },
      { item: "Parâmetros options opcionais com defaults explícitos", status: "ok", note: "priority='medium', ttl=0" },
      { item: "IEventPublisher.publish(event) — contrato limpo", status: "ok" },
      { item: "IAuditLogger.log + getLogs — contrato limpo", status: "ok" },
      { item: "subscribe() não pertence a IEventPublisher", status: "warn", note: "Método extra na classe concreta — não quebra o contrato" },
      { item: "IAuditLogger não declara clear() que a classe concreta tem", status: "warn", note: "Classe concreta expande a interface — aceitável" },
    ],
  },
];

export const SPRINT1_FINDINGS: Finding[] = [
  { type: "coupling", severity: "low", title: "WorkingMemoryEngine acoplado a IEventPublisher e IAuditLogger por injeção", detail: "Correto — DI via constructor. Sem acoplamento estático.", recommendation: "Manter." },
  { type: "solid",    severity: "low", title: "SRP: WorkingMemoryEngine gerencia store + TTL + namespace + sorting", detail: "Acumulação aceitável para Sprint 1. Sorting poderia ser extraído.", recommendation: "Observar crescimento. Extrair se methods > 12." },
  { type: "hidden_dep", severity: "medium", title: "generateId usa Date.now() + counter — dependência implícita do clock", detail: "Não injetável. Frágil em volume extremo.", recommendation: "Abstrair IdProvider em Sprint 3." },
  { type: "hidden_dep", severity: "medium", title: "isExpired e computeExpiresAt usam Date.now() diretamente", detail: "Impossível controlar o clock em testes de TTL sem setTimeout real.", recommendation: "Abstrair ClockProvider em Sprint 3." },
  { type: "duplicate", severity: "low", title: "generateId chamado 2x por operação (evento + audit record)", detail: "Pequena duplicação. Sem impacto de performance.", recommendation: "Acceptable para Sprint 1." },
  { type: "todo",     severity: "low", title: "WMEStats.promotedItems sempre retorna 0", detail: "Campo existe no tipo mas nunca é incrementado.", recommendation: "Implementar contador em Sprint 2." },
  { type: "todo",     severity: "low", title: "AuditLogger é in-memory — sem persistência", detail: "Declarado no JSDoc. Aceitável para Sprint 1.", recommendation: "Swap por PersistentAuditLogger em Sprint 4 ou 5." },
  { type: "todo",     severity: "low", title: "EventPublisher é síncrono — não há backpressure", detail: "Suficiente para Working Memory em memória.", recommendation: "Substituir por EventBus Adapter assíncrono em Sprint 5–6." },
];

export const SPRINT1_PLACEHOLDERS: Placeholder[] = [
  { item: "Promotion → Long-Term Memory", why: "LTM ainda não implementada. Promote muda apenas o tier em Working Memory.", targetSprint: "Sprint 2 (Long-Term Memory Engine)", impact: "Itens promovidos permanecem em memória volátil, perdidos ao reiniciar." },
  { item: "EventPublisher síncrono", why: "EventBus Adapter assíncrono requer a implementação do Universal Event Bus (UEB).", targetSprint: "Sprint 5–6 (UEB Layer)", impact: "Listeners lentos bloqueiam operações de store/evict. Sem retry/DLQ." },
  { item: "generateId (timestamp + counter)", why: "UUID compliant requer lib ou crypto.randomUUID — não usado para evitar dependência externa.", targetSprint: "Sprint 3 (IdProvider abstraction)", impact: "IDs não são UUIDs padronizados. Colisão improvável mas não impossível em paralelo." },
  { item: "AuditLogger in-memory", why: "Persistent store requer integração com camada de dados.", targetSprint: "Sprint 4 (Audit Persistence Layer)", impact: "Logs perdidos ao recarregar. Impossível auditoria histórica." },
  { item: "WMEStats.promotedItems = 0", why: "Contador não implementado — campo reservado.", targetSprint: "Sprint 2", impact: "Estatísticas incompletas. Dashboard mostra 0 promoções sempre." },
];

export const SPRINT1_ABSTRACTIONS: AbstractionRecommendation[] = [
  { name: "ClockProvider", interface: "interface IClockProvider { now(): number }", recommended: true, targetSprint: "Sprint 3", reason: "Date.now() usado em 4 locais. Necessário para testes determinísticos de TTL sem setTimeout." },
  { name: "IdProvider", interface: "interface IIdProvider { generate(prefix: string): string }", recommended: true, targetSprint: "Sprint 3", reason: "generateId tem dependência implícita de clock e module-level counter. Injeção permite UUID real e trace distribuído." },
  { name: "EventBus Adapter", interface: "interface IEventBusAdapter extends IEventPublisher { publishAsync(...): Promise<void> }", recommended: false, targetSprint: "Sprint 5–6", reason: "Prematuro — adiciona complexidade async sem benefício para Working Memory em memória. Aguardar UEB Layer." },
  { name: "Persistent Storage Adapter", interface: "interface IStorageAdapter { set/get/delete/clear/entries(...) }", recommended: false, targetSprint: "Sprint 4", reason: "Prematuro — Long-Term Memory Engine definirá o contrato correto. Abstrair antes risca de errar a interface." },
];

export const SPRINT1_QUALITY: QualitySection = {
  strengths: [
    "Isolamento de contexto robusto e testado (3 casos explícitos)",
    "Injeção de dependência via constructor — testável sem mocks externos",
    "Todas as operações auditadas com contexto, timestamp e details",
    "Eventos publicados de forma resiliente (listener errors não propagam)",
    "Validação defensiva antes de qualquer side-effect",
    "37 testes com cobertura de todos os métodos públicos",
    "Tipos TypeScript explícitos — sem any nas interfaces públicas",
    "Auto-evict de itens expirados no retrieve — sem ghost reads",
  ],
  concerns: [
    "TTL tests usam setTimeout real — frágil em ambientes de CI lentos",
    "promotedItems sempre 0 em WMEStats — campo sem implementação",
    "sessionId em IdentityContext declarado mas não usado no namespace",
    "subscribe() e clear() extras nas classes concretas fora das interfaces",
    "evictExpired não audita quando nenhum item expira",
  ],
  risks: [
    { level: "LOW",    description: "Colisão de ID em volume extremo (> 1M ops/s no mesmo ms)" },
    { level: "LOW",    description: "Namespace collision se userId contiver '::'" },
    { level: "MEDIUM", description: "Dados perdidos ao reiniciar — armazenamento volátil" },
    { level: "MEDIUM", description: "TTL tests com setTimeout podem falhar em CI sobrecarregado" },
    { level: "LOW",    description: "Listeners síncronos podem bloquear store em cenários extremos" },
  ],
  techDebt: [
    "promotedItems = 0 em WMEStats",
    "ClockProvider não abstraído (Date.now() hardcoded)",
    "IdProvider não abstraído",
    "AuditLogger sem persistência",
    "EventPublisher síncrono sem backpressure",
  ],
  dimensions: [
    { label: "Complexidade",   value: "BAIXA",    color: "green",  sub: "1 classe principal, DI limpo" },
    { label: "Performance",    value: "ÓTIMA",    color: "green",  sub: "O(1) store/retrieve, O(n) list" },
    { label: "Segurança",      value: "BOA",      color: "green",  sub: "Isolamento namespace verificado" },
    { label: "Escalabilidade", value: "LIMITADA", color: "yellow", sub: "In-memory — sem sharding" },
    { label: "Testabilidade",  value: "ALTA",     color: "green",  sub: "DI pura, 37 testes, sem mocks" },
    { label: "Maturidade",     value: "SPRINT 1", color: "blue",   sub: "Base sólida, placeholders claros" },
  ],
};