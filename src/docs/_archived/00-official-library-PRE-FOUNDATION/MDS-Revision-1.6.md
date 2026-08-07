# MDS v1.6 — Memory Architecture — Arquitetura Definitiva de Memória

**Versão:** 1.6  
**Status:** Revisão Oficial — Adenda ao MDS v1.5  
**Data:** 2026-07-09  
**Tipo:** Arquitetura Definitiva do Domínio de Memória  
**Alinhamento:** MAS 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0 · v1.1 · v1.2 · v1.3 · v1.4 · v1.5

---

## Declaração de Revisão

Esta revisão estabelece a **arquitetura definitiva de memória do MemoryOS** como domínio independente. **Knowledge** representa o que o sistema sabe. **Memory** representa aquilo que o sistema escolhe lembrar, reutilizar, consolidar e recuperar de forma contextual.

**Não remove** nenhuma seção. **Não altera** nenhuma decisão anterior. **Apenas complementa.**

---

# REVISÃO 1 — MEMORY ARCHITECTURE

---

## 1.1 Distinção Fundamental

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              KNOWLEDGE vs MEMORY — DISTINÇÃO OFICIAL                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  KNOWLEDGE (MDS v1.5)         │  MEMORY (MDS v1.6)                         │
│  ─────────────────────────    │  ────────────────────────────               │
│  O que o sistema SABE         │  O que o sistema ESCOLHE LEMBRAR            │
│  Grafo semântico global        │  Experiências contextuais e episódicas     │
│  Ontológico e universal        │  Pessoal, organizacional e situacional     │
│  Estruturado em classes        │  Estruturado em episódios e padrões        │
│  Permanente por padrão         │  Gerenciado por decay e retenção           │
│  Orientado à verdade           │  Orientado à utilidade                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Arquitetura Geral

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   MEMORY ARCHITECTURE — MDS v1.6                            │
└──────────────────────────────────────────────────────────────────────────────┘

FONTES DE CAPTURA
  Conversa   Execução  Feedback  Specialist  Connector  Marketplace  Sistema
     │           │         │         │            │           │          │
     └───────────┴─────────┴─────────┴────────────┴───────────┴──────────┘
                                     │
                           ┌─────────▼──────────┐
                           │   WorkingMemory     │  ← contexto imediato (TTL curto)
                           │     Engine          │
                           └─────────┬──────────┘
                                     │ (validado + classificado)
                           ┌─────────▼──────────┐
                           │   LongTermMemory    │  ← persistência permanente
                           │     Engine          │
                           └──────┬──────┬───────┘
                                  │      │
                   ┌──────────────┘      └──────────────┐
                   ▼                                      ▼
        ┌─────────────────────┐              ┌─────────────────────┐
        │ MemoryConsolidation │              │  MemoryDecay        │
        │     Engine          │              │     Engine          │
        └──────────┬──────────┘              └──────────┬──────────┘
                   │                                      │
                   ▼                                      ▼
        ┌─────────────────────┐              ┌─────────────────────┐
        │ MemoryCompression   │              │  MemoryGovernance   │
        │     Engine          │              │     Engine          │
        └──────────┬──────────┘              └─────────────────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │ Knowledge Promotion │  → KnowledgeGraphEngine (MDS v1.5)
        └──────────┬──────────┘
                   │
     ┌─────────────┼──────────────┐
     ▼             ▼              ▼
  Retrieval    Reasoning       Index
  Engine       Engine          Engine
     │
     └→ Consumidores: Planner, GoalEngine, CapabilityIntel, Specialists, Voice
```

## 1.3 Modelo Unificado de Memória

```typescript
// packages/core/memory/memory-model.ts

export interface MemoryItem {
  memoryId:      string;             // "mem:uuid"
  identity:      MemoryIdentity;
  content:       MemoryContent;
  type:          MemoryType;
  tier:          MemoryTier;
  context:       MemoryContext;
  provenance:    MemoryProvenance;
  quality:       MemoryQuality;
  governance:    MemoryGovernance;
  lifecycle:     MemoryLifecycle;
  relationships: MemoryRelationship[];
  metadata:      MemoryMetadata;
}

export interface MemoryIdentity {
  memoryId:      string;
  globalId:      string;             // estável entre versões
  version:       string;             // semver
  previousId?:   string;
  fingerprint:   string;             // SHA-256 do conteúdo canônico
  canonicalRef?: string;             // referência ao KnowledgeNode (se promovido)
}

export interface MemoryContent {
  summary:       string;             // resumo em linguagem natural
  raw:           unknown;            // conteúdo original
  compressed?:   string;             // conteúdo comprimido (após MemoryCompression)
  embedding?:    number[];           // vetor semântico
  language:      string;
  tokenCount?:   number;             // estimativa de tokens
}

export enum MemoryType {
  EPISODIC       = "EPISODIC",       // evento específico que ocorreu
  SEMANTIC       = "SEMANTIC",       // fato ou conceito aprendido
  PROCEDURAL     = "PROCEDURAL",     // como fazer algo
  WORKING        = "WORKING",        // contexto imediato atual
  CONVERSATION   = "CONVERSATION",   // troca de mensagens
  EXECUTION      = "EXECUTION",      // resultado de execução
  LEARNING       = "LEARNING",       // insight do LearningEngine
  GOAL           = "GOAL",           // objetivo perseguido
  CAPABILITY     = "CAPABILITY",     // capacidade de um Connector usada
  MARKETPLACE    = "MARKETPLACE",    // interação com Marketplace
  ORGANIZATIONAL = "ORGANIZATIONAL", // memória da organização
  SHARED         = "SHARED",         // compartilhada entre usuários
  COLLECTIVE     = "COLLECTIVE",     // memória coletiva da plataforma
  PLANNER        = "PLANNER",        // plano executado pelo Planner
  KNOWLEDGE      = "KNOWLEDGE",      // memória de conhecimento promovido
}

export enum MemoryTier {
  WORKING      = "WORKING",          // TTL minutos
  SHORT_TERM   = "SHORT_TERM",       // TTL horas–dias
  LONG_TERM    = "LONG_TERM",        // persistência permanente
  ARCHIVED     = "ARCHIVED",         // comprimida, raramente acessada
  CONSOLIDATED = "CONSOLIDATED",     // consolidada em padrão
  PROMOTED     = "PROMOTED",         // promovida ao KnowledgeGraph
}

export interface MemoryContext {
  userId?:       string;
  orgId?:        string;
  projectId?:    string;
  sessionId?:    string;
  goalId?:       string;
  planId?:       string;
  domain?:       string;
  subDomain?:    string;
  location?:     string;
  language:      string;
  timeOfDay?:    number;             // 0–23
  dayOfWeek?:    number;             // 0–6
  deviceType?:   string;
  voiceMode?:    boolean;
}

export interface MemoryProvenance {
  sourceType:    MemorySourceType;
  sourceId:      string;
  capturedAt:    string;
  confidenceScore: number;           // 0.0–1.0
  qualityScore:  number;
  evidence:      MemoryEvidence[];
}

export enum MemorySourceType {
  CONVERSATION  = "CONVERSATION",
  EXECUTION     = "EXECUTION",
  FEEDBACK      = "FEEDBACK",
  SPECIALIST    = "SPECIALIST",
  CONNECTOR     = "CONNECTOR",
  MARKETPLACE   = "MARKETPLACE",
  SYSTEM        = "SYSTEM",
  USER_EXPLICIT = "USER_EXPLICIT",   // memória criada explicitamente pelo usuário
}

export interface MemoryEvidence {
  type:     "DIRECT" | "INFERRED" | "CONFIRMED";
  sourceId: string;
  weight:   number;
  addedAt:  string;
}

export interface MemoryQuality {
  accuracy:      number;
  freshness:     number;
  relevance:     number;
  confidence:    number;
  usageScore:    number;
  overallScore:  number;
}

export interface MemoryLifecycle {
  status:        MemoryStatus;
  createdAt:     string;
  updatedAt:     string;
  lastAccessedAt?: string;
  consolidatedAt?: string;
  compressedAt?: string;
  archivedAt?:   string;
  expiresAt?:    string;
  deletedAt?:    string;
  retentionPolicy: MemoryRetentionPolicy;
  history:       MemoryHistoryEntry[];
}

export enum MemoryStatus {
  ACTIVE       = "ACTIVE",
  CONSOLIDATED = "CONSOLIDATED",
  COMPRESSED   = "COMPRESSED",
  ARCHIVED     = "ARCHIVED",
  EXPIRED      = "EXPIRED",
  DELETED      = "DELETED",
  PROMOTED     = "PROMOTED",         // promovida ao KnowledgeGraph
}

export interface MemoryRetentionPolicy {
  tier:          MemoryTier;
  ttlMinutes?:   number;             // para WORKING e SHORT_TERM
  retainDays?:   number;             // para LONG_TERM
  action:        "COMPRESS" | "ARCHIVE" | "DELETE" | "PROMOTE";
  legalHold?:    boolean;
  complianceHold?: boolean;
}

export interface MemoryRelationship {
  toMemoryId:    string;
  type:          MemoryRelType;
  weight:        number;
  createdAt:     string;
}

export enum MemoryRelType {
  PRECEDES       = "PRECEDES",
  FOLLOWS        = "FOLLOWS",
  RELATED_TO     = "RELATED_TO",
  CONTRADICTS    = "CONTRADICTS",
  SUPPORTS       = "SUPPORTS",
  CONSOLIDATES   = "CONSOLIDATES",
  SUPERSEDES     = "SUPERSEDES",
  DERIVED_FROM   = "DERIVED_FROM",
  PART_OF        = "PART_OF",
}

export interface MemoryMetadata {
  tags:          string[];
  domain?:       string;
  importance:    number;             // 0.0–1.0 — importância subjetiva
  accessCount:   number;
  lastAccessedBy?: string;
  schemaVersion: string;
}
```

## 1.4 Diagrama C4 — Memory Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  Memory Domain [Container Group]                             │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  WorkingMemoryEngine     │  │  LongTermMemoryEngine                    │ │
│  │  Redis (TTL)             │  │  PostgreSQL + pgvector                   │ │
│  └──────────────────────────┘  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  MemoryConsolidationEng. │  │  MemoryDecayEngine                       │ │
│  └──────────────────────────┘  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  MemoryCompressionEng.   │  │  MemoryRetrievalEngine                   │ │
│  └──────────────────────────┘  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  MemoryReasoningEngine   │  │  MemoryIndexEngine                       │ │
│  └──────────────────────────┘  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────┐                                               │
│  │  MemoryGovernanceEngine  │                                               │
│  └──────────────────────────┘                                               │
│                                                                              │
│  Integra com: KnowledgeGraphEngine (MDS v1.5), LearningEngine (MDS v1.4)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# REVISÃO 2 — MEMORY ENGINE

---

## 2.1 Interface Principal

```typescript
// packages/core/memory/memory-engine.ts

export interface IMemoryEngine {
  capture(input: MemoryCaptureInput): Promise<MemoryItem>;
  update(memoryId: string, patch: Partial<MemoryItem>): Promise<MemoryItem>;
  retrieve(query: MemoryRetrievalQuery): Promise<MemoryRetrievalResult>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult>;
  consolidate(memoryIds: string[]): Promise<ConsolidatedMemory>;
  compress(memoryId: string): Promise<CompressedMemory>;
  summarize(memoryIds: string[]): Promise<MemorySummary>;
  merge(memoryIds: string[]): Promise<MemoryItem>;
  snapshot(userId: string, orgId?: string): Promise<MemorySnapshot>;
  replay(memoryId: string): Promise<MemoryReplayResult>;
  getTimeline(userId: string, options: TimelineOptions): Promise<MemoryTimeline>;
  getContext(sessionId: string): Promise<WorkingMemoryContext>;
}

export interface MemoryCaptureInput {
  content:      unknown;
  type:         MemoryType;
  context:      MemoryContext;
  source:       MemorySourceType;
  sourceId:     string;
  importance?:  number;
  ttlMinutes?:  number;             // para WORKING memory
  tags?:        string[];
}

export interface MemorySnapshot {
  userId:          string;
  capturedAt:      string;
  totalMemories:   number;
  byTier:          Record<MemoryTier, number>;
  byType:          Record<MemoryType, number>;
  byStatus:        Record<MemoryStatus, number>;
  avgConfidence:   number;
  avgQuality:      number;
  recentEpisodes:  MemoryItem[];
  topPatterns:     MemoryItem[];
  workingContext:  WorkingMemoryContext;
  storageEstimate: StorageEstimate;
}

export interface StorageEstimate {
  workingMB:   number;
  shortTermMB: number;
  longTermMB:  number;
  archivedMB:  number;
  totalMB:     number;
}

@Injectable()
export class MemoryEngine implements IMemoryEngine {
  constructor(
    private readonly working:       WorkingMemoryEngine,
    private readonly longTerm:      LongTermMemoryEngine,
    private readonly consolidation: MemoryConsolidationEngine,
    private readonly compression:   MemoryCompressionEngine,
    private readonly decay:         MemoryDecayEngine,
    private readonly retrieval:     MemoryRetrievalEngine,
    private readonly reasoning:     MemoryReasoningEngine,
    private readonly index:         MemoryIndexEngine,
    private readonly governance:    MemoryGovernanceEngine,
    private readonly eventBus:      UniversalEventBus,
  ) {}

  async capture(input: MemoryCaptureInput): Promise<MemoryItem> {
    const item = this.buildMemoryItem(input);

    // Validar e classificar
    const classified = await this.classify(item);

    // Rotear para tier correto
    if (classified.tier === MemoryTier.WORKING) {
      await this.working.store(classified);
    } else {
      await this.longTerm.store(classified);
    }

    // Indexar
    await this.index.index(classified);

    await this.eventBus.publish("memory.created", {
      memoryId: classified.memoryId, type: classified.type,
      tier: classified.tier, userId: input.context.userId,
    });

    return classified;
  }

  private buildMemoryItem(input: MemoryCaptureInput): MemoryItem {
    const memoryId = generateId("mem");
    return {
      memoryId,
      identity: {
        memoryId, globalId: generateId("mgid"),
        version: "1.0.0", fingerprint: computeSHA256(input.content),
      },
      content: {
        summary: "", raw: input.content, language: input.context.language ?? "pt-BR",
        tokenCount: estimateTokens(input.content),
      },
      type:    input.type,
      tier:    this.deriveInitialTier(input),
      context: input.context,
      provenance: {
        sourceType: input.source, sourceId: input.sourceId,
        capturedAt: new Date().toISOString(),
        confidenceScore: 0.80, qualityScore: 0.70, evidence: [],
      },
      quality: { accuracy: 0.80, freshness: 1.0, relevance: 0.70, confidence: 0.80, usageScore: 0, overallScore: 0.76 },
      governance: { owner: input.context.userId ?? "system", visibility: MemoryVisibility.PRIVATE, permissions: [], compliance: [], retentionDays: 90, auditLog: [] },
      lifecycle: {
        status: MemoryStatus.ACTIVE, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        retentionPolicy: this.buildRetentionPolicy(input), history: [],
      },
      relationships: [],
      metadata: { tags: input.tags ?? [], importance: input.importance ?? 0.5, accessCount: 0, schemaVersion: "1.6" },
    };
  }

  private deriveInitialTier(input: MemoryCaptureInput): MemoryTier {
    if (input.ttlMinutes && input.ttlMinutes <= 60) return MemoryTier.WORKING;
    if (input.type === MemoryType.WORKING)           return MemoryTier.WORKING;
    if (input.type === MemoryType.CONVERSATION)      return MemoryTier.SHORT_TERM;
    return MemoryTier.LONG_TERM;
  }
}
```

---

# REVISÃO 3 — MEMORY TYPES

---

```typescript
// packages/core/memory/memory-types.ts

export const MEMORY_TYPE_CONFIG: Record<MemoryType, MemoryTypeConfig> = {
  EPISODIC: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  180,
    compressionAfterDays: 30,
    promotionEligible: true,
    description: "Evento específico e datado que ocorreu para o usuário/org",
    examples: ["Reunião com cliente X em 2026-03-15", "Deploy realizado com sucesso"],
  },
  SEMANTIC: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  365,
    compressionAfterDays: 90,
    promotionEligible: true,
    description: "Fato ou conceito duradouro aprendido",
    examples: ["A empresa usa PostgreSQL 15 em produção", "Preferência: relatórios em PDF"],
  },
  PROCEDURAL: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  365,
    compressionAfterDays: 180,
    promotionEligible: true,
    description: "Sequência de passos para realizar uma tarefa",
    examples: ["Como fazer deploy no AWS", "Como gerar relatório de vendas"],
  },
  WORKING: {
    defaultTier:     MemoryTier.WORKING,
    defaultTtlDays:  0,
    ttlMinutes:      60,
    compressionAfterDays: 0,
    promotionEligible: false,
    description: "Contexto imediato da sessão atual — descartado após uso",
    examples: ["Última pergunta do usuário", "Variáveis da execução atual"],
  },
  CONVERSATION: {
    defaultTier:     MemoryTier.SHORT_TERM,
    defaultTtlDays:  7,
    compressionAfterDays: 1,
    promotionEligible: false,
    description: "Histórico da conversa atual",
    examples: ["Perguntas e respostas da sessão"],
  },
  EXECUTION: {
    defaultTier:     MemoryTier.SHORT_TERM,
    defaultTtlDays:  30,
    compressionAfterDays: 7,
    promotionEligible: true,
    description: "Resultado e contexto de uma execução de plano",
    examples: ["Relatório gerado, duração 3.2s, Connector Bling usado"],
  },
  LEARNING: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  365,
    compressionAfterDays: 90,
    promotionEligible: true,
    description: "Insight produzido pelo LearningEngine",
    examples: ["Usuário prefere horários matutinos para reuniões"],
  },
  GOAL: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  180,
    compressionAfterDays: 60,
    promotionEligible: true,
    description: "Objetivo perseguido e seu resultado",
    examples: ["Meta Q1: aumentar receita 20% — concluída"],
  },
  CAPABILITY: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  90,
    compressionAfterDays: 30,
    promotionEligible: false,
    description: "Capacidade de Connector observada em uso",
    examples: ["Connector Shopify: getOrders funcionou com 230ms"],
  },
  MARKETPLACE: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  180,
    compressionAfterDays: 60,
    promotionEligible: false,
    description: "Interação com o Marketplace",
    examples: ["Connector X avaliado com 4 estrelas em 2026-02"],
  },
  ORGANIZATIONAL: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  730,
    compressionAfterDays: 180,
    promotionEligible: true,
    description: "Memória coletiva da organização",
    examples: ["Empresa usa CRM Salesforce desde 2022"],
  },
  SHARED: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  365,
    compressionAfterDays: 90,
    promotionEligible: true,
    description: "Memória compartilhada entre membros da equipe",
    examples: ["Decisão de arquitetura acordada em reunião de equipe"],
  },
  COLLECTIVE: {
    defaultTier:     MemoryTier.LONG_TERM,
    defaultTtlDays:  730,
    compressionAfterDays: 365,
    promotionEligible: true,
    description: "Memória coletiva da plataforma MemoryOS",
    examples: ["Melhores práticas para domínio FINANCE consolidadas pela comunidade"],
  },
  PLANNER:  {
    defaultTier: MemoryTier.SHORT_TERM, defaultTtlDays: 30,
    compressionAfterDays: 7, promotionEligible: false,
    description: "Plano criado e executado pelo Planner",
  },
  KNOWLEDGE: {
    defaultTier: MemoryTier.PROMOTED, defaultTtlDays: 730,
    compressionAfterDays: 365, promotionEligible: false,
    description: "Memória promovida ao KnowledgeGraph (referência)",
  },
};

export interface MemoryTypeConfig {
  defaultTier:          MemoryTier;
  defaultTtlDays:       number;
  ttlMinutes?:          number;
  compressionAfterDays: number;
  promotionEligible:    boolean;
  description:          string;
  examples?:            string[];
}
```

---

# REVISÃO 4 — WORKING MEMORY ENGINE

---

```typescript
// packages/core/memory/working/working-memory-engine.ts

export interface WorkingMemoryContext {
  sessionId:       string;
  userId:          string;
  orgId?:          string;
  activeGoalId?:   string;
  activePlanId?:   string;
  items:           WorkingMemorySlot[];
  tokenUsage:      TokenUsage;
  specialists:     string[];         // specialists ativos nesta sessão
  createdAt:       string;
  expiresAt:       string;
}

export interface WorkingMemorySlot {
  slotId:          string;
  memoryId:        string;
  priority:        number;           // 0.0–1.0 — maior = mantido mais tempo
  type:            MemoryType;
  summary:         string;
  tokenCount:      number;
  addedAt:         string;
  expiresAt:       string;
  pinned:          boolean;          // fixado — não descartado pelo decay
}

export interface TokenUsage {
  used:            number;
  capacity:        number;           // limite configurável por plano
  reserved:        number;           // reservado para resposta
  available:       number;
  utilizationPct:  number;
}

@Injectable()
export class WorkingMemoryEngine {
  private readonly DEFAULT_TTL_MIN = 60;
  private readonly DEFAULT_CAPACITY = 128_000;   // tokens

  async store(item: MemoryItem): Promise<WorkingMemorySlot> {
    const ctx = await this.getOrCreateContext(item.context.sessionId!, item.context.userId!);

    // Verificar capacidade — descartar itens de menor prioridade se necessário
    if (ctx.tokenUsage.available < (item.content.tokenCount ?? 100)) {
      await this.evict(ctx, item.content.tokenCount ?? 100);
    }

    const slot: WorkingMemorySlot = {
      slotId:   generateId("wms"),
      memoryId: item.memoryId,
      priority: item.metadata.importance,
      type:     item.type,
      summary:  item.content.summary,
      tokenCount: item.content.tokenCount ?? 0,
      addedAt:  new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.DEFAULT_TTL_MIN * 60_000).toISOString(),
      pinned:   false,
    };

    await this.cache.setSlot(ctx.sessionId, slot, this.DEFAULT_TTL_MIN * 60);
    await this.updateTokenUsage(ctx, slot.tokenCount);
    return slot;
  }

  async getContext(sessionId: string): Promise<WorkingMemoryContext> {
    const ctx = await this.cache.getContext(sessionId);
    if (!ctx) throw new WorkingMemoryContextNotFoundError(sessionId);
    return ctx;
  }

  // Priorizar: pins primeiro, depois por importance, depois por recência
  async prioritize(sessionId: string): Promise<WorkingMemorySlot[]> {
    const ctx = await this.getContext(sessionId);
    return ctx.items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (Math.abs(a.priority - b.priority) > 0.1) return b.priority - a.priority;
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
  }

  // Descartar itens de menor prioridade para liberar tokens
  private async evict(ctx: WorkingMemoryContext, needed: number): Promise<void> {
    const sorted = ctx.items
      .filter(s => !s.pinned)
      .sort((a, b) => a.priority - b.priority);   // menor prioridade primeiro

    let freed = 0;
    for (const slot of sorted) {
      if (freed >= needed) break;
      await this.cache.removeSlot(ctx.sessionId, slot.slotId);
      freed += slot.tokenCount;
      await this.eventBus.publish("memory.decayed", {
        memoryId: slot.memoryId, reason: "WORKING_MEMORY_EVICTION", sessionId: ctx.sessionId,
      });
    }
  }

  // Passar memórias relevantes para LongTermMemory ao final da sessão
  async flush(sessionId: string): Promise<FlushResult> {
    const ctx = await this.getContext(sessionId);
    const toPromote = ctx.items.filter(s => s.priority >= 0.6);
    const promoted: string[] = [];

    for (const slot of toPromote) {
      const item = await this.memoryStore.get(slot.memoryId);
      if (item) {
        await this.longTermEngine.store({ ...item, tier: MemoryTier.SHORT_TERM });
        promoted.push(slot.memoryId);
      }
    }

    await this.cache.clearContext(sessionId);
    return { promoted: promoted.length, discarded: ctx.items.length - promoted.length };
  }
}
```

---

# REVISÃO 5 — LONG TERM MEMORY ENGINE

---

```typescript
// packages/core/memory/long-term/long-term-memory-engine.ts

export interface ILongTermMemoryEngine {
  store(item: MemoryItem): Promise<void>;
  get(memoryId: string): Promise<MemoryItem | null>;
  update(memoryId: string, patch: Partial<MemoryItem>): Promise<MemoryItem>;
  delete(memoryId: string): Promise<void>;
  list(filter: LongTermFilter): Promise<MemoryItem[]>;
  getTimeline(userId: string, opts: TimelineOptions): Promise<MemoryTimeline>;
  getHistory(memoryId: string): Promise<MemoryHistoryEntry[]>;
}

export interface LongTermFilter {
  userId?:       string;
  orgId?:        string;
  type?:         MemoryType[];
  tier?:         MemoryTier[];
  status?:       MemoryStatus[];
  domain?:       string;
  fromDate?:     string;
  toDate?:       string;
  minConfidence?: number;
  tags?:         string[];
  limit:         number;
  offset:        number;
  sortBy:        "created" | "accessed" | "confidence" | "relevance";
  sortDir:       "ASC" | "DESC";
}

export interface MemoryTimeline {
  userId:        string;
  domain?:       string;
  events:        MemoryTimelineEvent[];
  span:          { start: string; end: string };
  totalEvents:   number;
}

export interface MemoryTimelineEvent {
  date:          string;
  type:          "CREATED" | "UPDATED" | "ACCESSED" | "CONSOLIDATED" | "COMPRESSED" | "ARCHIVED" | "PROMOTED";
  memoryId:      string;
  memoryType:    MemoryType;
  summary:       string;
  confidence:    number;
}

@Injectable()
export class LongTermMemoryEngine implements ILongTermMemoryEngine {
  async store(item: MemoryItem): Promise<void> {
    // Verificar duplicata por fingerprint
    const existing = await this.memoryStore.findByFingerprint(
      item.identity.fingerprint, item.context.userId
    );
    if (existing) {
      await this.update(existing.memoryId, {
        provenance: { ...existing.provenance, confidenceScore: Math.min(existing.provenance.confidenceScore + 0.05, 1.0) },
        metadata:   { ...existing.metadata, accessCount: existing.metadata.accessCount + 1 },
      });
      return;
    }

    // Gerar summary via LLM se ausente
    if (!item.content.summary) {
      item.content.summary = await this.summarizer.summarize(item.content.raw);
    }

    await this.memoryStore.create(item);
    await this.vectorStore.upsert(item.memoryId, item.content.embedding ?? await this.embedder.embed(item.content.summary));
    await this.eventBus.publish("memory.created", { memoryId: item.memoryId, type: item.type, tier: item.tier, userId: item.context.userId });
  }

  async getTimeline(userId: string, opts: TimelineOptions): Promise<MemoryTimeline> {
    const memories = await this.memoryStore.findByUser(userId, {
      fromDate: opts.fromDate, toDate: opts.toDate, limit: opts.limit ?? 100,
    });
    return {
      userId, domain: opts.domain,
      events: memories.map(m => ({
        date:       m.lifecycle.createdAt,
        type:       "CREATED",
        memoryId:   m.memoryId,
        memoryType: m.type,
        summary:    m.content.summary,
        confidence: m.provenance.confidenceScore,
      })),
      span: { start: memories.at(-1)?.lifecycle.createdAt ?? opts.fromDate ?? "", end: memories[0]?.lifecycle.createdAt ?? "" },
      totalEvents: memories.length,
    };
  }
}
```

---

# REVISÃO 6 — MEMORY CONSOLIDATION ENGINE

---

```typescript
// packages/core/memory/consolidation/memory-consolidation-engine.ts

export interface ConsolidatedMemory {
  consolidationId: string;
  sourceIds:       string[];
  result:          MemoryItem;
  compressionRatio: number;         // sourceCount / 1
  patterns:        string[];        // padrões detectados
  conflicts:       ConsolidationConflict[];
  durationMs:      number;
}

export interface ConsolidationConflict {
  field:     string;
  values:    unknown[];
  resolution: string;
  winner:    unknown;
}

@Injectable()
export class MemoryConsolidationEngine {
  async consolidate(memoryIds: string[]): Promise<ConsolidatedMemory> {
    const t0      = Date.now();
    const items   = await Promise.all(memoryIds.map(id => this.longTerm.get(id)));
    const valid   = items.filter(Boolean) as MemoryItem[];

    if (valid.length === 0) throw new MemoryConsolidationError("No valid memories to consolidate");

    // Detectar padrões e conflitos
    const patterns   = this.detectPatterns(valid);
    const conflicts  = this.detectConflicts(valid);
    const resolved   = this.resolveConflicts(conflicts, valid);

    // Gerar summary consolidado via LLM
    const summary = await this.llm.consolidate(
      valid.map(m => m.content.summary), patterns
    );

    // Calcular scores combinados (média ponderada por confidence)
    const totalConf  = valid.reduce((a, m) => a + m.provenance.confidenceScore, 0);
    const avgConf    = totalConf / valid.length;
    const maxImport  = Math.max(...valid.map(m => m.metadata.importance));

    const consolidated: MemoryItem = {
      ...valid[0],
      memoryId: generateId("mem"),
      identity: { ...valid[0].identity, memoryId: generateId("mem"), version: "1.0.0", fingerprint: computeSHA256(summary) },
      content:  { ...valid[0].content, summary, raw: { consolidatedFrom: memoryIds, patterns } },
      tier:     MemoryTier.CONSOLIDATED,
      lifecycle: { ...valid[0].lifecycle, status: MemoryStatus.CONSOLIDATED, consolidatedAt: new Date().toISOString(), history: [] },
      provenance: { ...valid[0].provenance, confidenceScore: avgConf, evidence: valid.flatMap(m => m.provenance.evidence) },
      metadata:  { ...valid[0].metadata, importance: maxImport, tags: [...new Set(valid.flatMap(m => m.metadata.tags))] },
    };

    await this.longTerm.store(consolidated);

    // Comprimir originais
    await Promise.all(memoryIds.map(id => this.compressor.compress(id)));

    await this.eventBus.publish("memory.consolidated", {
      consolidationId: generateId("con"), sourceIds: memoryIds,
      resultId: consolidated.memoryId, compressionRatio: memoryIds.length,
    });

    return {
      consolidationId: generateId("con"), sourceIds: memoryIds,
      result: consolidated, compressionRatio: memoryIds.length,
      patterns, conflicts: resolved, durationMs: Date.now() - t0,
    };
  }

  private detectPatterns(items: MemoryItem[]): string[] {
    const byType   = this.groupBy(items, i => i.type);
    const byDomain = this.groupBy(items, i => i.context.domain ?? "UNKNOWN");
    const patterns: string[] = [];

    Object.entries(byType).forEach(([type, group]) => {
      if (group.length >= 3) patterns.push(`Padrão recorrente de ${type}: ${group.length} ocorrências`);
    });
    Object.entries(byDomain).forEach(([domain, group]) => {
      if (group.length >= 2) patterns.push(`Concentração no domínio ${domain}: ${group.length} memórias`);
    });

    return patterns;
  }
}
```

---

# REVISÃO 7 — MEMORY RETRIEVAL ENGINE

---

```typescript
// packages/core/memory/retrieval/memory-retrieval-engine.ts

export interface MemoryRetrievalQuery {
  mode:          RetrievalMode;
  userId?:       string;
  orgId?:        string;
  // Critérios de recuperação
  context?:      Partial<MemoryContext>;
  timeRange?:    { from: string; to: string };
  goalId?:       string;
  personId?:     string;
  orgEntityId?:  string;
  specialistId?: string;
  projectId?:    string;
  workflowId?:   string;
  domain?:       string;
  connectorId?:  string;
  location?:     string;
  language?:     string;
  tags?:         string[];
  relType?:      MemoryRelType;
  minConfidence?: number;
  minQuality?:   number;
  // Texto e semântica
  text?:         string;
  embedding?:    number[];
  // Paginação
  limit:         number;
  offset:        number;
}

export enum RetrievalMode {
  CONTEXT    = "CONTEXT",           // por contexto da sessão atual
  TEMPORAL   = "TEMPORAL",          // por janela de tempo
  GOAL       = "GOAL",              // por objetivo relacionado
  PERSON     = "PERSON",            // por pessoa mencionada
  PROJECT    = "PROJECT",           // por projeto
  DOMAIN     = "DOMAIN",            // por domínio
  CONNECTOR  = "CONNECTOR",         // por Connector usado
  SEMANTIC   = "SEMANTIC",          // por similaridade semântica
  HYBRID     = "HYBRID",            // semântico + filtros
  GRAPH      = "GRAPH",             // por relacionamentos
  TAG        = "TAG",               // por tags
  CONFIDENCE = "CONFIDENCE",        // por score mínimo de confiança
  QUALITY    = "QUALITY",           // por score mínimo de qualidade
}

export interface MemoryRetrievalResult {
  queryId:    string;
  mode:       RetrievalMode;
  items:      RetrievedMemory[];
  total:      number;
  durationMs: number;
}

export interface RetrievedMemory {
  memory:     MemoryItem;
  score:      number;
  relevance:  number;
  confidence: number;
  explanation: string;
}

@Injectable()
export class MemoryRetrievalEngine {
  async retrieve(query: MemoryRetrievalQuery): Promise<MemoryRetrievalResult> {
    const t0      = Date.now();
    const queryId = generateId("rq");
    let items: RetrievedMemory[] = [];

    switch (query.mode) {
      case RetrievalMode.CONTEXT:
        items = await this.byContext(query); break;
      case RetrievalMode.TEMPORAL:
        items = await this.byTimeRange(query); break;
      case RetrievalMode.GOAL:
        items = await this.byGoal(query); break;
      case RetrievalMode.SEMANTIC:
        items = await this.bySemantic(query); break;
      case RetrievalMode.HYBRID:
        items = await this.byHybrid(query); break;
      case RetrievalMode.DOMAIN:
        items = await this.byDomain(query); break;
      case RetrievalMode.CONNECTOR:
        items = await this.byConnector(query); break;
      case RetrievalMode.TAG:
        items = await this.byTags(query); break;
      case RetrievalMode.CONFIDENCE:
        items = await this.byConfidence(query); break;
      default:
        items = await this.byHybrid(query);
    }

    // Atualizar accessCount e lastAccessedAt
    await Promise.all(
      items.map(i => this.longTerm.update(i.memory.memoryId, {
        lifecycle:  { ...i.memory.lifecycle, lastAccessedAt: new Date().toISOString() },
        metadata:   { ...i.memory.metadata, accessCount: i.memory.metadata.accessCount + 1 },
        quality:    { ...i.memory.quality, usageScore: Math.min(i.memory.quality.usageScore + 0.02, 1.0) },
      }))
    );

    await this.eventBus.publish("memory.retrieved", {
      queryId, mode: query.mode, count: items.length, userId: query.userId,
    });

    return { queryId, mode: query.mode, items: items.slice(query.offset, query.offset + query.limit), total: items.length, durationMs: Date.now() - t0 };
  }

  private async byHybrid(query: MemoryRetrievalQuery): Promise<RetrievedMemory[]> {
    const [semantic, filtered] = await Promise.all([
      query.text || query.embedding ? this.bySemantic(query) : Promise.resolve([]),
      this.byFilters(query),
    ]);

    // RRF fusion
    const scores = new Map<string, number>();
    const k = 60;
    semantic.forEach((m, i) => scores.set(m.memory.memoryId, (scores.get(m.memory.memoryId) ?? 0) + 1 / (k + i + 1)));
    filtered.forEach((m, i) => scores.set(m.memory.memoryId, (scores.get(m.memory.memoryId) ?? 0) + 1 / (k + i + 1)));

    const all = new Map<string, RetrievedMemory>();
    [...semantic, ...filtered].forEach(m => all.set(m.memory.memoryId, m));

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ ...all.get(id)!, score }));
  }
}
```

---

# REVISÃO 8 — MEMORY DECAY ENGINE

---

```typescript
// packages/core/memory/decay/memory-decay-engine.ts

export interface DecayPolicy {
  policyId:      string;
  name:          string;
  tier:          MemoryTier;
  type:          MemoryType[];
  decayRate:     number;             // redução de confidence por dia (0.0–1.0)
  halfLifeDays:  number;             // dias para confidence cair 50%
  minConfidence: number;             // abaixo disto → archive
  archiveAfterDays: number;
  deleteAfterDays?: number;
  legalHoldExempt: boolean;
  complianceTags: ComplianceTag[];
}

export const DEFAULT_DECAY_POLICIES: DecayPolicy[] = [
  {
    policyId: "DPY-001", name: "Working Memory Decay",
    tier: MemoryTier.WORKING, type: [MemoryType.WORKING, MemoryType.CONVERSATION],
    decayRate: 1.0, halfLifeDays: 0.042,    // ~1 hora
    minConfidence: 0.1, archiveAfterDays: 0,
    legalHoldExempt: true, complianceTags: [],
  },
  {
    policyId: "DPY-002", name: "Short-Term Decay",
    tier: MemoryTier.SHORT_TERM, type: [MemoryType.EXECUTION, MemoryType.PLANNER],
    decayRate: 0.05, halfLifeDays: 14,
    minConfidence: 0.3, archiveAfterDays: 30,
    legalHoldExempt: false, complianceTags: [],
  },
  {
    policyId: "DPY-003", name: "Long-Term Slow Decay",
    tier: MemoryTier.LONG_TERM, type: [MemoryType.EPISODIC, MemoryType.SEMANTIC],
    decayRate: 0.005, halfLifeDays: 138,
    minConfidence: 0.2, archiveAfterDays: 365,
    legalHoldExempt: false, complianceTags: ["LGPD"],
  },
  {
    policyId: "DPY-004", name: "Organizational Memory",
    tier: MemoryTier.LONG_TERM, type: [MemoryType.ORGANIZATIONAL, MemoryType.COLLECTIVE],
    decayRate: 0.001, halfLifeDays: 693,   // ~2 anos
    minConfidence: 0.15, archiveAfterDays: 730,
    legalHoldExempt: false, complianceTags: ["LGPD", "GDPR"],
  },
];

@Injectable()
export class MemoryDecayEngine {
  // Executado via scheduled automation (diariamente)
  async applyDecay(): Promise<DecayReport> {
    const memories = await this.memoryStore.findDecayable();
    const actions: DecayAction[] = [];

    for (const mem of memories) {
      const policy = this.resolvePolicy(mem);
      if (!policy) continue;

      const ageDays = (Date.now() - new Date(mem.lifecycle.updatedAt).getTime()) / 86_400_000;
      const newConfidence = mem.provenance.confidenceScore * Math.pow(1 - policy.decayRate, ageDays);

      if (mem.lifecycle.retentionPolicy.legalHold || mem.lifecycle.retentionPolicy.complianceHold) {
        actions.push({ memoryId: mem.memoryId, action: "HOLD", reason: "LEGAL_OR_COMPLIANCE_HOLD" });
        continue;
      }

      if (newConfidence < policy.minConfidence) {
        await this.archive(mem.memoryId);
        actions.push({ memoryId: mem.memoryId, action: "ARCHIVED", reason: `Confidence ${newConfidence.toFixed(2)} < min ${policy.minConfidence}` });
        await this.eventBus.publish("memory.decayed", { memoryId: mem.memoryId, newConfidence, action: "ARCHIVED" });
      } else {
        await this.memoryStore.update(mem.memoryId, {
          provenance: { ...mem.provenance, confidenceScore: newConfidence },
        });
        actions.push({ memoryId: mem.memoryId, action: "DECAYED", newConfidence });
      }
    }

    return { applied: actions.length, archived: actions.filter(a => a.action === "ARCHIVED").length, actions };
  }

  // Priority Preservation: memórias importantes resistem ao decay
  priorityPreserve(mem: MemoryItem): number {
    return mem.metadata.importance * 0.5;   // bônus de até +0.5 no decay rate efetivo
  }
}
```

---

# REVISÃO 9 — MEMORY COMPRESSION ENGINE

---

```typescript
// packages/core/memory/compression/memory-compression-engine.ts

export interface CompressionResult {
  memoryId:        string;
  originalTokens:  number;
  compressedTokens: number;
  compressionRatio: number;       // original / compressed
  level:           CompressionLevel;
  summary:         string;
  compressedAt:    string;
}

export enum CompressionLevel {
  LIGHT    = "LIGHT",             // resume em 50% dos tokens
  MODERATE = "MODERATE",          // resume em 25% dos tokens
  HEAVY    = "HEAVY",             // resume em 10% dos tokens
  EXTREME  = "EXTREME",           // 1–3 sentenças essenciais
}

/**
 * PIPELINE DE COMPRESSÃO OFICIAL
 *
 * Milhares de eventos
 *   → Centenas de episódios   (LIGHT: agrupamento por sessão)
 *   → Dezenas de padrões      (MODERATE: consolidação por período)
 *   → Poucos conhecimentos    (HEAVY: extração de insights)
 *   → Conhecimento promovido  (EXTREME: promoção ao KnowledgeGraph)
 */

@Injectable()
export class MemoryCompressionEngine {
  async compress(memoryId: string, level?: CompressionLevel): Promise<CompressionResult> {
    const mem    = await this.longTerm.get(memoryId);
    if (!mem) throw new MemoryNotFoundError(memoryId);

    const ageDays = (Date.now() - new Date(mem.lifecycle.createdAt).getTime()) / 86_400_000;
    const resolvedLevel = level ?? this.resolveLevel(mem, ageDays);
    const compressed    = await this.applyCompression(mem, resolvedLevel);

    await this.longTerm.update(memoryId, {
      content:  { ...mem.content, summary: compressed.summary, compressed: compressed.summary },
      lifecycle: { ...mem.lifecycle, status: MemoryStatus.COMPRESSED, compressedAt: new Date().toISOString() },
      metadata:  { ...mem.metadata },
    });

    await this.eventBus.publish("memory.compressed", {
      memoryId, originalTokens: compressed.originalTokens,
      compressedTokens: compressed.compressedTokens,
      compressionRatio: compressed.compressionRatio, level: resolvedLevel,
    });

    return compressed;
  }

  private resolveLevel(mem: MemoryItem, ageDays: number): CompressionLevel {
    if (ageDays < 7)   return CompressionLevel.LIGHT;
    if (ageDays < 30)  return CompressionLevel.MODERATE;
    if (ageDays < 180) return CompressionLevel.HEAVY;
    return CompressionLevel.EXTREME;
  }

  private async applyCompression(mem: MemoryItem, level: CompressionLevel): Promise<CompressionResult> {
    const ratioMap: Record<CompressionLevel, number> = {
      LIGHT: 0.5, MODERATE: 0.25, HEAVY: 0.1, EXTREME: 0.05,
    };
    const targetRatio = ratioMap[level];
    const original    = JSON.stringify(mem.content.raw);
    const targetTokens = Math.max(Math.floor((mem.content.tokenCount ?? 1000) * targetRatio), 10);

    const summary = await this.llm.compress(original, { maxTokens: targetTokens, level });

    return {
      memoryId:         mem.memoryId,
      originalTokens:   mem.content.tokenCount ?? 0,
      compressedTokens: estimateTokens(summary),
      compressionRatio: (mem.content.tokenCount ?? 1) / Math.max(estimateTokens(summary), 1),
      level,
      summary,
      compressedAt:     new Date().toISOString(),
    };
  }

  // Knowledge Promotion: comprimir ao limite e promover ao KnowledgeGraph
  async promote(memoryId: string): Promise<PromotionResult> {
    const compressed = await this.compress(memoryId, CompressionLevel.EXTREME);
    const mem        = await this.longTerm.get(memoryId);
    if (!mem) throw new MemoryNotFoundError(memoryId);

    // Criar nó no KnowledgeGraph
    const knowledgeNode = await this.knowledgeGraphEngine.createNode({
      identity:    { canonicalName: compressed.summary, aliases: [], fingerprint: computeSHA256(compressed.summary), globalId: generateId("kgid"), version: "1.0.0" },
      content:     { type: KnowledgeNodeType.FACT, domain: mem.context.domain ?? "GENERAL", value: { memoryId: mem.memoryId, summary: compressed.summary }, summary: compressed.summary, language: mem.content.language },
      ontology:    { class: "MemoryPromotion", superClasses: [], subClasses: [], properties: [], constraints: [], taxonomy: ["ROOT", mem.context.domain ?? "GENERAL", "MEMORY"], semanticCategory: "MEMORY" },
      relationships: [],
      provenance:  { origin: { sourceType: LearningSource.SYSTEM, sourceId: memoryId, userId: mem.context.userId ?? "system", orgId: mem.context.orgId ?? "system", extractedAt: new Date().toISOString(), confidence: mem.provenance.confidenceScore }, evidence: [], confidenceScore: mem.provenance.confidenceScore, qualityScore: mem.quality.overallScore, trustScore: 0.75, sources: [memoryId] },
      governance:  { owner: mem.context.userId ?? "system", visibility: "PRIVATE", permissions: [], compliance: [], retentionDays: 730 },
      quality:     { accuracy: mem.quality.accuracy, freshness: mem.quality.freshness, consistency: 0.8, coverage: 0.6, completeness: 0.7, trust: mem.provenance.confidenceScore, evidenceScore: 0.5, confidenceScore: mem.provenance.confidenceScore, popularityScore: 0, usageScore: mem.quality.usageScore, relevanceScore: 0.7 },
      lifecycle:   { status: KnowledgeNodeStatus.PUBLISHED, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), history: [], retentionPolicy: { days: 730, action: "ARCHIVE" } },
      metadata:    { tags: mem.metadata.tags, domain: mem.context.domain ?? "GENERAL", subDomain: "MEMORY", language: mem.content.language, schemaVersion: "1.5" },
    });

    // Atualizar memória como promovida
    await this.longTerm.update(memoryId, {
      tier:     MemoryTier.PROMOTED,
      lifecycle: { ...mem.lifecycle, status: MemoryStatus.PROMOTED },
      identity:  { ...mem.identity, canonicalRef: knowledgeNode.nodeId },
    });

    await this.eventBus.publish("memory.promoted", {
      memoryId, knowledgeNodeId: knowledgeNode.nodeId, domain: mem.context.domain,
    });

    return { memoryId, knowledgeNodeId: knowledgeNode.nodeId, compressed };
  }
}
```

---

# REVISÃO 10 — MEMORY REASONING ENGINE

---

```typescript
// packages/core/memory/reasoning/memory-reasoning-engine.ts

export interface IMemoryReasoningEngine {
  compareExperiences(ctx: ReasoningContext): Promise<ExperienceComparison>;
  findHistoricalSimilarity(memoryId: string, limit?: number): Promise<SimilarMemory[]>;
  supportDecision(goalId: string, userId: string): Promise<DecisionSupport>;
  predictContext(sessionCtx: MemoryContext): Promise<ContextPrediction>;
  rankMemories(memoryIds: string[], criterion: RankingCriterion): Promise<RankedMemory[]>;
}

export interface ExperienceComparison {
  current:         MemoryItem;
  similar:         SimilarMemory[];
  patterns:        string[];
  recommendation:  string;
  confidence:      number;
}

export interface SimilarMemory {
  memory:       MemoryItem;
  similarity:   number;       // 0.0–1.0
  sharedContext: string[];
  divergence:   string[];
}

export interface DecisionSupport {
  goalId:       string;
  relevant:     RetrievedMemory[];
  pastOutcomes: PastOutcome[];
  confidence:   number;
  recommendation: string;
  risks:        string[];
}

export interface PastOutcome {
  memoryId:   string;
  goal:       string;
  outcome:    "SUCCESS" | "FAILURE" | "PARTIAL";
  confidence: number;
  date:       string;
  lesson:     string;
}

export interface ContextPrediction {
  sessionCtx:      MemoryContext;
  predictedNeeds:  string[];        // o que o usuário provavelmente precisará
  preloadIds:      string[];        // memórias para pré-carregar na WorkingMemory
  confidence:      number;
}

export enum RankingCriterion {
  RELEVANCE   = "RELEVANCE",
  CONFIDENCE  = "CONFIDENCE",
  RECENCY     = "RECENCY",
  IMPORTANCE  = "IMPORTANCE",
  USAGE       = "USAGE",
}

export interface RankedMemory {
  memory:  MemoryItem;
  rank:    number;
  score:   number;
  reason:  string;
}

@Injectable()
export class MemoryReasoningEngine implements IMemoryReasoningEngine {
  async supportDecision(goalId: string, userId: string): Promise<DecisionSupport> {
    const relevant = await this.retrieval.retrieve({
      mode: RetrievalMode.GOAL, goalId, userId, limit: 20, offset: 0,
    });

    const pastOutcomes: PastOutcome[] = relevant.items
      .filter(m => m.memory.type === MemoryType.GOAL || m.memory.type === MemoryType.EXECUTION)
      .map(m => ({
        memoryId:   m.memory.memoryId,
        goal:       m.memory.content.summary,
        outcome:    this.classifyOutcome(m.memory),
        confidence: m.memory.provenance.confidenceScore,
        date:       m.memory.lifecycle.createdAt,
        lesson:     this.extractLesson(m.memory),
      }));

    const successRate = pastOutcomes.filter(o => o.outcome === "SUCCESS").length / Math.max(pastOutcomes.length, 1);

    return {
      goalId,
      relevant: relevant.items,
      pastOutcomes,
      confidence: successRate,
      recommendation: successRate >= 0.7
        ? "Histórico positivo — prosseguir com confiança"
        : "Histórico misto — revisar lições aprendidas",
      risks: pastOutcomes.filter(o => o.outcome === "FAILURE").map(o => o.lesson),
    };
  }

  async predictContext(ctx: MemoryContext): Promise<ContextPrediction> {
    const history = await this.retrieval.retrieve({
      mode:    RetrievalMode.CONTEXT,
      context: ctx,
      userId:  ctx.userId,
      limit:   50,
      offset:  0,
    });

    const domains  = [...new Set(history.items.map(m => m.memory.context.domain).filter(Boolean))];
    const goals    = [...new Set(history.items.filter(m => m.memory.type === MemoryType.GOAL).map(m => m.memory.content.summary))];
    const preload  = history.items.filter(m => m.relevance >= 0.7).map(m => m.memory.memoryId);

    return {
      sessionCtx: ctx,
      predictedNeeds: [...goals.slice(0, 3), ...domains.slice(0, 3)],
      preloadIds: preload.slice(0, 10),
      confidence: history.items.length >= 5 ? 0.80 : 0.50,
    };
  }
}
```

---

# REVISÃO 11 — MEMORY INDEX ENGINE

---

```typescript
// packages/core/memory/index/memory-index-engine.ts

export interface IMemoryIndexEngine {
  index(item: MemoryItem): Promise<void>;
  reindex(memoryId: string): Promise<void>;
  remove(memoryId: string): Promise<void>;
  search(query: IndexSearchQuery): Promise<IndexSearchResult>;
}

export interface IndexSearchQuery {
  text?:         string;
  embedding?:    number[];
  userId?:       string;
  orgId?:        string;
  type?:         MemoryType[];
  domain?:       string;
  tags?:         string[];
  timeRange?:    { from: string; to: string };
  goalId?:       string;
  projectId?:    string;
  specialistId?: string;
  connectorId?:  string;
  location?:     string;
  language?:     string;
  relType?:      MemoryRelType;
  minConfidence?: number;
  limit:         number;
  offset:        number;
}

// Os índices mantidos:
export const MEMORY_INDEXES = [
  "idx_memory_user_time",          // userId + createdAt
  "idx_memory_type_domain",        // type + domain
  "idx_memory_session",            // sessionId
  "idx_memory_goal",               // goalId
  "idx_memory_project",            // projectId
  "idx_memory_tags",               // GIN index em tags[]
  "idx_memory_confidence",         // provenance.confidenceScore
  "idx_memory_specialist",         // metadata especialista
  "idx_memory_connector",          // connectorId usado
  "idx_memory_fingerprint",        // identity.fingerprint (único)
  "idx_memory_vector",             // HNSW em embedding (pgvector)
  "idx_memory_relationship",       // relacionamentos
  "idx_memory_ontology",           // ontologia do domínio
] as const;

@Injectable()
export class MemoryIndexEngine implements IMemoryIndexEngine {
  async index(item: MemoryItem): Promise<void> {
    await Promise.all([
      this.keywordIndex.upsert(item.memoryId, {
        text:     item.content.summary,
        type:     item.type,
        domain:   item.context.domain,
        tags:     item.metadata.tags,
        userId:   item.context.userId,
        orgId:    item.context.orgId,
        goalId:   item.context.goalId,
        projectId: item.context.projectId,
        language: item.content.language,
        createdAt: item.lifecycle.createdAt,
      }),
      item.content.embedding
        ? this.vectorIndex.upsert(item.memoryId, item.content.embedding)
        : this.embeddingQueue.enqueue(item.memoryId),   // embedding assíncrono
      this.relIndex.upsert(item.memoryId, item.relationships),
    ]);
  }
}
```

---

# REVISÃO 12 — MEMORY GOVERNANCE ENGINE

---

```typescript
// packages/core/memory/governance/memory-governance-engine.ts

export enum MemoryVisibility {
  PRIVATE  = "PRIVATE",
  ORG      = "ORG",
  SHARED   = "SHARED",           // equipe específica
  PUBLIC   = "PUBLIC",           // toda a plataforma
}

export interface MemoryGovernance {
  owner:           string;
  visibility:      MemoryVisibility;
  permissions:     MemoryPermission[];
  compliance:      ComplianceTag[];
  retentionDays:   number;
  legalHold?:      boolean;
  complianceHold?: boolean;
  certifiedBy?:    string;
  certifiedAt?:    string;
  auditLog:        GovernanceAuditEntry[];
}

export interface MemoryPermission {
  principalId:   string;
  principalType: "USER" | "ORG" | "ROLE" | "SPECIALIST";
  actions:       MemoryPermissionAction[];
  grantedBy:     string;
  grantedAt:     string;
  expiresAt?:    string;
}

export enum MemoryPermissionAction {
  READ    = "READ",
  WRITE   = "WRITE",
  DELETE  = "DELETE",
  SHARE   = "SHARE",
  EXPORT  = "EXPORT",
  ARCHIVE = "ARCHIVE",
}

@Injectable()
export class MemoryGovernanceEngine {
  async checkPermission(memoryId: string, userId: string, action: MemoryPermissionAction): Promise<boolean> {
    const mem = await this.longTerm.get(memoryId);
    if (!mem) return false;
    if (mem.governance.owner === userId) return true;
    const perm = mem.governance.permissions.find(p =>
      p.principalId === userId && p.actions.includes(action) &&
      (!p.expiresAt || new Date(p.expiresAt) > new Date())
    );
    return !!perm;
  }

  async deleteUserMemories(userId: string): Promise<number> {
    const memories = await this.memoryStore.findByOwner(userId);
    // Respeitar legal hold
    const deletable = memories.filter(m => !m.governance.legalHold && !m.governance.complianceHold);
    await Promise.all(deletable.map(m => this.longTerm.delete(m.memoryId)));
    await this.eventBus.publish("memory.deleted", { userId, count: deletable.length, reason: "USER_DELETION_REQUEST" });
    return deletable.length;
  }

  async applyLegalHold(memoryId: string, reason: string): Promise<void> {
    await this.longTerm.update(memoryId, { governance: { legalHold: true } as any });
    await this.auditLog.write(memoryId, { action: "LEGAL_HOLD_APPLIED", reason, at: new Date().toISOString() });
  }
}
```

---

# REVISÃO 13 — MEMORY EVENTS

---

```typescript
// packages/shared/events/memory-events-v1.6.ts

/** memory.created — MemoryEngine | Consumer: MemoryIndexEngine, LearningEngine */
export interface MemoryCreatedEvent {
  memoryId: string; type: MemoryType; tier: MemoryTier;
  userId?: string; orgId?: string; createdAt: string;
}

/** memory.updated — MemoryEngine | Consumer: MemoryIndexEngine */
export interface MemoryUpdatedEvent {
  memoryId: string; version: string; changedFields: string[]; updatedAt: string;
}

/** memory.retrieved — MemoryRetrievalEngine | Consumer: LearningEngine, ObservabilityCollector */
export interface MemoryRetrievedEvent {
  queryId: string; mode: RetrievalMode; count: number;
  userId?: string; durationMs: number; retrievedAt: string;
}

/** memory.archived — MemoryDecayEngine, MemoryGovernanceEngine */
export interface MemoryArchivedEvent {
  memoryId: string; reason: string; archivedAt: string;
}

/** memory.compressed — MemoryCompressionEngine */
export interface MemoryCompressedEvent {
  memoryId: string; originalTokens: number; compressedTokens: number;
  compressionRatio: number; level: CompressionLevel; compressedAt: string;
}

/** memory.summarized — MemoryCompressionEngine (EXTREME level) */
export interface MemorySummarizedEvent {
  memoryIds: string[]; summaryId: string; summaryTokens: number; summarizedAt: string;
}

/** memory.consolidated — MemoryConsolidationEngine */
export interface MemoryConsolidatedEvent {
  consolidationId: string; sourceIds: string[]; resultId: string;
  compressionRatio: number; consolidatedAt: string;
}

/** memory.replayed — MemoryEngine.replay() */
export interface MemoryReplayedEvent {
  memoryId: string; userId?: string; replayedAt: string;
}

/** memory.expired — MemoryDecayEngine (TTL expirado) */
export interface MemoryExpiredEvent {
  memoryId: string; tier: MemoryTier; expiredAt: string;
}

/** memory.deleted — MemoryGovernanceEngine */
export interface MemoryDeletedEvent {
  memoryId?: string; userId?: string; count?: number;
  reason: string; deletedAt: string;
}

/** memory.decayed — MemoryDecayEngine */
export interface MemoryDecayedEvent {
  memoryId: string; newConfidence: number; action: string; decayedAt: string;
}

/** memory.promoted — MemoryCompressionEngine.promote() */
export interface MemoryPromotedEvent {
  memoryId: string; knowledgeNodeId: string; domain?: string; promotedAt: string;
}
```

---

# REVISÃO 14 — OBSERVABILIDADE

---

```typescript
export function setupMemoryMetrics(meter: Meter) {
  return {
    memoryGrowth: meter.createCounter("memory_items_total",
      { description: "Total de itens de memória criados" }),                   // Labels: type, tier
    memoryRetrievalTime: meter.createHistogram("memory_retrieval_duration_ms",
      { unit: "ms", boundaries: [5, 10, 25, 50, 100, 250, 500, 1000] }),
    memoryCompressionRate: meter.createObservableGauge("memory_compression_rate",
      { description: "Tokens antes vs depois da compressão (ratio médio)" }),
    memoryConsolidationRate: meter.createObservableGauge("memory_consolidation_rate",
      { description: "Memórias consolidadas / total de memórias por período" }),
    memoryAccuracy: meter.createObservableGauge("memory_accuracy_score",
      { description: "Score de acurácia médio do corpus de memória" }),
    memoryFreshness: meter.createObservableGauge("memory_freshness_score",
      { description: "% do corpus com freshness ≥ 0.5" }),
    memoryReuse: meter.createObservableGauge("memory_reuse_rate",
      { description: "Média de accessCount por item por mês" }),
    memoryReplay: meter.createCounter("memory_replays_total",
      { description: "Total de replays de memória executados" }),
    memoryContextAccuracy: meter.createObservableGauge("memory_context_accuracy",
      { description: "% de contextos WorkingMemory que satisfizeram o objetivo da sessão" }),
    workingMemoryUsage: meter.createObservableGauge("memory_working_usage_pct",
      { description: "% de capacidade de tokens usada na WorkingMemory" }),     // Labels: sessionId
    longTermMemoryUsage: meter.createObservableGauge("memory_long_term_total_mb",
      { description: "Tamanho total do Long-Term Memory em MB" }),              // Labels: userId, orgId
    searchAccuracy: meter.createObservableGauge("memory_search_accuracy",
      { description: "% de buscas cujo top-3 continha o item esperado (rolling 7d)" }),
    decayRate: meter.createObservableGauge("memory_decay_rate",
      { description: "% de memórias com confidence decrescente por dia" }),
    promotionRate: meter.createObservableGauge("memory_promotion_rate",
      { description: "% de memórias promovidas ao KnowledgeGraph por mês" }),
  };
}
```

## 14.1 KPIs Oficiais

| KPI | Meta | Warning | Critical |
|---|---|---|---|
| Memory Retrieval P95 | < 100ms | > 250ms | > 500ms |
| Working Memory Usage | < 80% | > 90% | > 95% |
| Memory Compression Ratio | > 5x | < 2x | < 1.5x |
| Memory Consolidation Rate | > 10%/sem | < 2%/sem | = 0 |
| Memory Accuracy | > 0.75 | < 0.60 | < 0.45 |
| Memory Freshness | > 65% | < 45% | < 25% |
| Memory Reuse | > 3x/mês | < 1x/mês | = 0 |
| Search Accuracy | > 80% | < 65% | < 50% |
| Memory Context Accuracy | > 75% | < 60% | < 45% |
| Promotion Rate | > 5%/mês | < 1%/mês | = 0 |

---

# REVISÃO 15 — CHECKLIST OFICIAL

---

```
CHECKLIST OFICIAL — MEMORY ARCHITECTURE — MDS v1.6
═══════════════════════════════════════════════════════════════════════════════

MEMORY MODEL
  [ ] MemoryItem com todos os campos: identity, content, type, tier, context,
      provenance, quality, governance, lifecycle, relationships, metadata
  [ ] MemoryType com 15 tipos e MEMORY_TYPE_CONFIG completo
  [ ] MemoryTier com 6 níveis
  [ ] MemoryStatus com 7 estados
  [ ] MemoryRetentionPolicy com legalHold e complianceHold
  [ ] Distinção formal Knowledge vs Memory documentada

MEMORY ENGINE
  [ ] MemoryEngine.capture() com classificação automática de tier
  [ ] Deduplicação por fingerprint SHA-256
  [ ] Summary gerado via LLM quando ausente
  [ ] Embedding gerado assincronamente
  [ ] Evento memory.created publicado

WORKING MEMORY ENGINE
  [ ] WorkingMemoryContext com TokenUsage
  [ ] WorkingMemorySlot com priority e pinned
  [ ] Eviction por menor prioridade quando capacidade esgotada
  [ ] flush() promovendo slots com priority ≥ 0.6 ao SHORT_TERM
  [ ] TTL default de 60 minutos para slots não pinados
  [ ] Evento memory.decayed publicado em eviction

LONG TERM MEMORY ENGINE
  [ ] LongTermFilter com 11 critérios de filtragem
  [ ] MemoryTimeline por userId e domain
  [ ] Deduplicação por fingerprint + userId
  [ ] Vector upsert em paralelo com store
  [ ] Evento memory.created publicado

MEMORY CONSOLIDATION ENGINE
  [ ] consolidate() aceitando N memoryIds
  [ ] detectPatterns() por type e domain
  [ ] detectConflicts() com resolução documentada
  [ ] Summary consolidado via LLM
  [ ] Score médio ponderado por confidenceScore
  [ ] Compressão automática dos originais após consolidação
  [ ] Evento memory.consolidated publicado

MEMORY RETRIEVAL ENGINE
  [ ] 13 RetrievalModes implementados
  [ ] Hybrid Retrieval com RRF (k=60)
  [ ] Atualização de accessCount e lastAccessedAt após recuperação
  [ ] usageScore incrementado em +0.02 por acesso
  [ ] Evento memory.retrieved publicado

MEMORY DECAY ENGINE
  [ ] 4 DEFAULT_DECAY_POLICIES com half-life documentados
  [ ] Respeito a legalHold e complianceHold
  [ ] Priority Preservation para memórias de alta importância
  [ ] Scheduled automation diária via LearningEngine
  [ ] Evento memory.decayed publicado

MEMORY COMPRESSION ENGINE
  [ ] 4 CompressionLevels com ratios documentados
  [ ] resolveLevel() automático por age of memory
  [ ] Pipeline LIGHT → MODERATE → HEAVY → EXTREME documentado
  [ ] promote() criando nó no KnowledgeGraphEngine (MDS v1.5)
  [ ] Evento memory.compressed publicado
  [ ] Evento memory.promoted publicado

MEMORY REASONING ENGINE
  [ ] compareExperiences() com SimilarMemory por embedding
  [ ] supportDecision() com PastOutcome e successRate
  [ ] predictContext() com preloadIds para WorkingMemory
  [ ] rankMemories() com 5 RankingCriteria

MEMORY INDEX ENGINE
  [ ] 13 índices declarados e criados (keyword + vector + relação)
  [ ] index() rodando em paralelo (keyword + vector + relação)
  [ ] Embedding assíncrono via embeddingQueue se ausente
  [ ] Suporte a filtros compostos

MEMORY GOVERNANCE ENGINE
  [ ] 4 MemoryVisibility levels
  [ ] 6 MemoryPermissionActions
  [ ] checkPermission() com expiresAt
  [ ] deleteUserMemories() respeitando legalHold (LGPD)
  [ ] applyLegalHold() com auditLog

MEMORY LIFECYCLE (Revisão 17)
  [ ] Fluxo Capture → Working → Validation → Classification → LongTerm
      → Consolidation → Compression → Knowledge Promotion → Archive → Deletion
  [ ] Cada transição de status publicando evento UEB
  [ ] Retenção configurável por MemoryType

EVENTOS (12 eventos)
  [ ] memory.created, updated, retrieved, archived, compressed, summarized
  [ ] memory.consolidated, replayed, expired, deleted, decayed, promoted
  [ ] Idempotência por memoryId em todos os eventos

OBSERVABILIDADE
  [ ] memory_items_total por type e tier
  [ ] memory_retrieval_duration_ms instrumentado
  [ ] memory_compression_rate calculado por batch
  [ ] memory_working_usage_pct por sessionId
  [ ] Alertas configurados para todos KPIs críticos
  [ ] Dashboard "Memory Overview" criado

CONTRATOS
  [ ] MemoryItem com schema Zod
  [ ] WorkingMemoryContext com schema Zod
  [ ] MemoryRetrievalQuery com schema Zod
  [ ] ConsolidatedMemory com schema Zod

COMPLIANCE
  [ ] PII isolado por userId + orgId
  [ ] deleteUserMemories() com respeito a legalHold
  [ ] Retention configurável por tipo (LGPD mínimo 5 anos para fiscal)
  [ ] Audit log imutável em MemoryGovernance.auditLog
  [ ] complianceHold para processos judiciais

ESCALABILIDADE
  [ ] WorkingMemoryEngine em Redis com TTL nativo
  [ ] LongTermMemoryEngine em PostgreSQL com sharding por orgId
  [ ] VectorStore com particionamento por orgId
  [ ] MemoryDecayEngine rodando como scheduled automation
  [ ] MemoryCompressionEngine stateless → horizontal
```

---

# REVISÃO 16 — TABELA DE RESPONSABILIDADE

---

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│          TABELA DE RESPONSABILIDADE — MEMORY ARCHITECTURE — MDS v1.6                          │
├──────────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Componente                   │ Especificação                                                   │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryEngine                 │ R: Orquestrador central do domínio de memória                  │
│                              │ E: MemoryCaptureInput, queries, memoryIds                      │
│                              │ S: MemoryItem, MemoryRetrievalResult, MemorySnapshot           │
│                              │ D: WorkingMemory, LongTermMemory, ConsolidationEng, DecayEng   │
│                              │ P: memory.created                                               │
│                              │ C: —                                                            │
│                              │ Escala: Stateless, horizontal                                   │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ WorkingMemoryEngine          │ R: Janela de contexto imediato com TTL curto                   │
│                              │ E: MemoryItem, sessionId                                        │
│                              │ S: WorkingMemorySlot, WorkingMemoryContext                     │
│                              │ D: Redis (cache com TTL nativo)                                 │
│                              │ P: memory.decayed (eviction)                                   │
│                              │ C: —                                                            │
│                              │ Escala: Redis Cluster; sharding por sessionId                  │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ LongTermMemoryEngine         │ R: Persistência permanente de memórias importantes             │
│                              │ E: MemoryItem, LongTermFilter                                  │
│                              │ S: MemoryItem, MemoryTimeline                                  │
│                              │ D: PostgreSQL + pgvector, EmbeddingGenerator                   │
│                              │ P: memory.created, memory.updated                              │
│                              │ C: —                                                            │
│                              │ Escala: PostgreSQL sharding por orgId; read replicas           │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryConsolidationEngine    │ R: Mesclar N memórias em 1 consolidada                         │
│                              │ E: memoryIds[], LLM                                             │
│                              │ S: ConsolidatedMemory com patterns e conflicts                 │
│                              │ D: LongTermMemory, MemoryCompression, LLM                      │
│                              │ P: memory.consolidated                                          │
│                              │ C: memory.created (dispara avaliação de consolidação)          │
│                              │ Escala: Stateless; batch assíncrono                            │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryRetrievalEngine        │ R: Recuperar memórias por 13 critérios                         │
│                              │ E: MemoryRetrievalQuery (13 modes)                             │
│                              │ S: MemoryRetrievalResult com score e explanation               │
│                              │ D: LongTermMemory, VectorStore, KeywordIndex                   │
│                              │ P: memory.retrieved                                             │
│                              │ C: —                                                            │
│                              │ Escala: Stateless, horizontal; vector cache TTL 60s            │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryDecayEngine            │ R: Reduzir confidence e arquivar memórias obsoletas            │
│                              │ E: ScheduledTrigger (diário), MemoryItem                       │
│                              │ S: DecayReport com actions                                      │
│                              │ D: LongTermMemory, DEFAULT_DECAY_POLICIES                      │
│                              │ P: memory.decayed, memory.archived                              │
│                              │ C: scheduled (automation diária)                               │
│                              │ Escala: Worker único (sequential scan) ou particionado         │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryCompressionEngine      │ R: Comprimir memórias velhas e promover ao KnowledgeGraph      │
│                              │ E: memoryId, CompressionLevel (opcional)                       │
│                              │ S: CompressionResult, PromotionResult                          │
│                              │ D: LongTermMemory, LLM, KnowledgeGraphEngine (MDS v1.5)        │
│                              │ P: memory.compressed, memory.promoted                          │
│                              │ C: memory.consolidated (comprimir originais)                   │
│                              │ Escala: Stateless; queue-based para batch                      │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryReasoningEngine        │ R: Usar histórico de memória para suportar decisões            │
│                              │ E: goalId, sessionCtx, memoryIds                              │
│                              │ S: DecisionSupport, ContextPrediction, RankedMemory[]         │
│                              │ D: MemoryRetrievalEngine, VectorStore                          │
│                              │ P: —                                                            │
│                              │ C: memory.retrieved (para ranking)                             │
│                              │ Escala: Stateless, horizontal                                   │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryIndexEngine            │ R: Indexar memórias para recuperação rápida                    │
│                              │ E: MemoryItem (index/reindex/remove), IndexSearchQuery         │
│                              │ S: IndexSearchResult                                           │
│                              │ D: KeywordIndex (pg_trgm), VectorIndex (pgvector), RelIndex   │
│                              │ P: —                                                            │
│                              │ C: memory.created (indexar), memory.deleted (remover)         │
│                              │ Escala: Stateless; indexação paralela; HNSW para vetores       │
├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ MemoryGovernanceEngine       │ R: Permissões, compliance, LGPD e auditoria                   │
│                              │ E: memoryId, userId, MemoryPermissionAction                   │
│                              │ S: boolean (checkPermission), DeletionCount                   │
│                              │ D: LongTermMemory, AuditLog                                    │
│                              │ P: memory.deleted, memory.archived                              │
│                              │ C: —                                                            │
│                              │ Escala: Stateless; auditLog append-only                        │
└──────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

# REVISÃO 17 — MEMORY LIFECYCLE

---

```
MEMORY LIFECYCLE OFICIAL — MDS v1.6
═══════════════════════════════════

CAPTURE
  │  Qualquer fonte: conversa, execução, feedback, connector
  │  MemoryEngine.capture(input) → buildMemoryItem()
  ▼
WORKING MEMORY (TTL: minutos)
  │  WorkingMemoryEngine.store()
  │  Priorização por importance; eviction de menor prioridade
  │  Evento: memory.created (tier=WORKING)
  ▼
VALIDATION
  │  Verificação de duplicata por fingerprint
  │  Score de qualidade inicial calculado
  │  Summary gerado via LLM se ausente
  ▼
CLASSIFICATION
  │  MemoryType e MemoryTier determinados
  │  RetentionPolicy atribuída por MEMORY_TYPE_CONFIG
  │  Tags e domain inferidos do contexto
  ▼
LONG TERM MEMORY (retentionDays: tipo-específico)
  │  LongTermMemoryEngine.store()
  │  Indexação: keyword + vector + relacionamento
  │  Evento: memory.created (tier=LONG_TERM)
  ▼
CONSOLIDATION (threshold: 3+ memórias similares)
  │  MemoryConsolidationEngine.consolidate()
  │  Pattern detection + conflict resolution
  │  Summary consolidado via LLM
  │  Originais comprimidos (LIGHT)
  │  Evento: memory.consolidated
  ▼
COMPRESSION (por idade ou trigger manual)
  │  MemoryCompressionEngine.compress()
  │  LIGHT (< 7d) → MODERATE (< 30d) → HEAVY (< 180d) → EXTREME (> 180d)
  │  Evento: memory.compressed
  ▼
KNOWLEDGE PROMOTION (apenas memórias elegíveis com confidence ≥ 0.70)
  │  MemoryCompressionEngine.promote()
  │  Cria KnowledgeNode no KnowledgeGraphEngine (MDS v1.5)
  │  Memória atualizada para tier=PROMOTED
  │  Evento: memory.promoted
  ▼
ARCHIVE (por decay ou expiração)
  │  MemoryDecayEngine.archive()
  │  Confidence abaixo de policy.minConfidence
  │  Evento: memory.archived
  ▼
RETENTION (legalHold / complianceHold preservam)
  │  MemoryGovernanceEngine controla
  │  LGPD: mínimo 5 anos para dados fiscais
  │  Evento: memory.expired (se TTL expirado)
  ▼
DELETION (manual ou por policy)
     MemoryGovernanceEngine.deleteUserMemories()
     Respeita legalHold e complianceHold
     Evento: memory.deleted
```

---

# DECLARAÇÃO FINAL — MDS v1.6

---

Esta revisão estabelece a **arquitetura definitiva de memória do MemoryOS** como domínio arquitetural independente.

Todo item de memória possui agora:

| Atributo | Componente |
|---|---|
| **Identidade** | MemoryIdentity — fingerprint SHA-256 + globalId + canonicalRef |
| **Origem** | MemoryProvenance — sourceType, sourceId, evidence |
| **Contexto** | MemoryContext — userId, orgId, goal, session, domain, localização |
| **Linha do tempo** | LongTermMemoryEngine — MemoryTimeline por userId |
| **Relacionamentos** | MemoryRelationship — 9 MemoryRelTypes |
| **Confiança** | provenance.confidenceScore — decay automático + feedback |
| **Qualidade** | MemoryQuality — 6 dimensões + overallScore |
| **Versionamento** | MemoryLifecycle — semver + MemoryHistoryEntry[] |
| **Governança** | MemoryGovernanceEngine — visibility, permissions, LGPD, legalHold |
| **Consolidação** | MemoryConsolidationEngine — N→1 com pattern detection |
| **Compressão** | MemoryCompressionEngine — 4 níveis + Knowledge Promotion |
| **Recuperação** | MemoryRetrievalEngine — 13 modos + RRF hybrid |
| **Auditoria** | MemoryGovernance.auditLog — imutável, append-only |
| **Esquecimento controlado** | MemoryDecayEngine — 4 políticas + priority preservation |

A arquitetura de memória permanece **totalmente desacoplada do Knowledge Graph, orientada a eventos, altamente escalável e compatível com todas as versões anteriores do Manual Oficial de Engenharia do MemoryOS**.

---

**MDS v1.6 — Memory Architecture — Arquitetura Definitiva de Memória**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.5 · **Série:** MDS v1.0 → v1.1 → v1.2 → v1.3 → v1.4 → v1.5 → v1.6