# MDS v1.4 — Learning Engine — Arquitetura Definitiva

**Versão:** 1.4  
**Status:** Revisão Oficial — Adenda ao MDS v1.3  
**Data:** 2026-07-09  
**Tipo:** Arquitetura Definitiva do Learning Engine  
**Alinhamento:** MAS 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0 · v1.1 · v1.2 · v1.3

---

## Declaração de Revisão

Esta revisão estabelece a **arquitetura definitiva do Learning Engine**, transformando-o no principal mecanismo de evolução contínua do MemoryOS. Todo conhecimento aprendido possui origem, evidências, versão, contexto, validação, histórico, score de confiança, linha do tempo, capacidade de evolução, auditoria e rollback.

**Não remove** nenhuma seção. **Não altera** nenhuma decisão anterior. **Apenas complementa.**

---

# REVISÃO 1 — LEARNING ARCHITECTURE

---

## 1.1 Visão Geral

O **Learning Engine** é a principal fonte de evolução contínua do MemoryOS. Ele transforma toda execução, conversa, erro, correção, aprovação e rejeição em **conhecimento estruturado, validado e reutilizável** que alimenta todos os outros motores da plataforma.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     LEARNING ENGINE — ARQUITETURA OFICIAL                   │
│                              MDS v1.4                                       │
└──────────────────────────────────────────────────────────────────────────────┘

FONTES DE APRENDIZADO
  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Executions │  │Conversa- │  │Feedbacks │  │Errors &  │  │Approvals │
  │& Results  │  │  tions   │  │& Reviews │  │Successes │  │& Rejects │
  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
        └──────────────┴─────────────┴─────────────┴─────────────┘
                                     │
                                     ▼
                        ┌────────────────────────┐
                        │  KnowledgeExtraction   │  ← extrai fatos brutos
                        │       Engine           │
                        └────────────┬───────────┘
                                     │ KnowledgeItem[]
                                     ▼
                        ┌────────────────────────┐
                        │  PatternDetection      │  ← detecta padrões
                        │       Engine           │
                        └────────────┬───────────┘
                                     │ KnowledgeItem[] + Pattern[]
                                     ▼
                        ┌────────────────────────┐
                        │  KnowledgeValidation   │  ← filtra, valida confiança
                        │       Engine           │
                        └────────────┬───────────┘
                                     │ ValidatedKnowledge[]
                                     ▼
                        ┌────────────────────────┐
                        │  KnowledgeConsolidation│  ← mescla, deduplica, versiona
                        │       Engine           │
                        └────────────┬───────────┘
                                     │ ConsolidatedKnowledge[]
                                     ▼
                        ┌────────────────────────┐
                        │  KnowledgeEvolution    │  ← evolui, rollback, archive
                        │       Engine           │
                        └────────────┬───────────┘
                                     │
                        ┌────────────▼───────────┐
                        │  LearningQuality       │  ← avalia qualidade geral
                        │       Engine           │
                        └────────────┬───────────┘
                                     │
                        ┌────────────▼───────────┐
                        │  KnowledgePublishing   │  ← distribui para consumidores
                        │       Engine           │
                        └────────────┬───────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼            ▼             ▼             ▼             ▼
    MemoryEngine  GoalEngine     Planner    Capability    Specialists
                                           Intelligence  Marketplace
```

## 1.2 Interfaces Centrais

```typescript
// packages/core/learning/learning-engine-v1.4.ts

export interface ILearningEngine {
  learn(input: LearningInput): Promise<LearningOutput>;
}

export interface LearningInput {
  source:      LearningSource;
  executionResult?: ExecutionResult;
  conversationId?:  string;
  feedbackId?:      string;
  userId:           string;
  orgId:            string;
  sessionCtx:       SessionContext;
  goalContext?:     GoalContext;
}

export enum LearningSource {
  EXECUTION         = "EXECUTION",
  CONVERSATION      = "CONVERSATION",
  FEEDBACK          = "FEEDBACK",
  APPROVAL          = "APPROVAL",
  REJECTION         = "REJECTION",
  ERROR             = "ERROR",
  SUCCESS           = "SUCCESS",
  SPECIALIST        = "SPECIALIST",
  MARKETPLACE       = "MARKETPLACE",
  SYSTEM            = "SYSTEM",
}

export interface LearningOutput {
  learningId:       string;
  source:           LearningSource;
  extracted:        KnowledgeItem[];
  patterns:         DetectedPattern[];
  validated:        ValidatedKnowledge[];
  consolidated:     ConsolidatedKnowledge[];
  published:        PublishedKnowledge[];
  qualityReport:    LearningQualityReport;
  metrics:          LearningMetrics;
  durationMs:       number;
  createdAt:        string;
}

// KnowledgeItem — unidade atômica de conhecimento
export interface KnowledgeItem {
  knowledgeId:    string;
  type:           KnowledgeType;
  domain:         string;
  value:          unknown;
  origin:         KnowledgeOrigin;
  evidence:       KnowledgeEvidence[];
  version:        string;           // semver
  confidenceScore: number;          // 0.0–1.0
  qualityScore:   number;           // 0.0–1.0
  context:        KnowledgeContext;
  validatedAt?:   string;
  consolidatedAt?: string;
  publishedAt?:   string;
  status:         KnowledgeStatus;
  createdAt:      string;
}

export enum KnowledgeType {
  FACT            = "FACT",           // fato verificável
  PREFERENCE      = "PREFERENCE",     // preferência de usuário
  HABIT           = "HABIT",          // hábito comportamental
  PATTERN         = "PATTERN",        // padrão recorrente
  WORKFLOW        = "WORKFLOW",       // workflow aprendido
  RULE            = "RULE",           // regra inferida
  PREDICTION      = "PREDICTION",     // predição gerada
  CORRECTION      = "CORRECTION",     // correção de conhecimento anterior
  ANOMALY         = "ANOMALY",        // anomalia detectada
  RELATIONSHIP    = "RELATIONSHIP",   // relação entre entidades
}

export enum KnowledgeStatus {
  RAW        = "RAW",         // extraído, não validado
  VALIDATED  = "VALIDATED",   // passou na validação
  REJECTED   = "REJECTED",    // não passou na validação
  CONSOLIDATED = "CONSOLIDATED", // mesclado ao corpus
  PUBLISHED  = "PUBLISHED",   // distribuído aos consumidores
  DEPRECATED = "DEPRECATED",  // substituído por versão mais nova
  ARCHIVED   = "ARCHIVED",    // sem uso, arquivado
}

export interface KnowledgeOrigin {
  sourceType:  LearningSource;
  sourceId:    string;           // executionId, conversationId, etc.
  userId:      string;
  orgId:       string;
  extractedAt: string;
  confidence:  number;
}

export interface KnowledgeEvidence {
  type:        "DIRECT" | "INFERRED" | "CONFIRMED" | "CORROBORATED";
  description: string;
  sourceId:    string;
  weight:      number;           // 0.0–1.0
  addedAt:     string;
}

export interface KnowledgeContext {
  goalDomain?:     string;
  projectId?:      string;
  sessionId?:      string;
  timeOfDay?:      number;       // 0–23
  dayOfWeek?:      number;       // 0–6
  deviceType?:     string;
  voiceMode?:      boolean;
  userRegion?:     string;
  orgDepartment?:  string;
}
```

## 1.3 Diagrama de Estados do KnowledgeItem

```
         ┌─────────────────────────────────────────────┐
         │              KNOWLEDGE LIFECYCLE             │
         └─────────────────────────────────────────────┘

  [Extração]        [Validação]      [Consolidação]    [Publicação]
      │                 │                 │                 │
      ▼                 │                 │                 │
  ┌───────┐  pass    ┌──▼──────┐  pass ┌─▼─────────┐    ┌─▼─────────┐
  │  RAW  │─────────►│VALIDATED│──────►│CONSOLIDATED│───►│ PUBLISHED │
  └───────┘          └──┬──────┘       └─────┬──────┘    └─────┬─────┘
                        │ fail               │                  │
                        ▼                   │ conflict         │ obsoleto
                    ┌────────┐              ▼                  ▼
                    │REJECTED│         [resolver]         ┌──────────┐
                    └────────┘              │              │DEPRECATED│
                                           ▼              └────┬─────┘
                                     (nova versão)             │
                                                               ▼
                                                          ┌──────────┐
                                                          │ ARCHIVED │
                                                          └──────────┘
```

## 1.4 Diagrama C4 — Container View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Learning Engine [Container]                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      LearningPipeline                                  │ │
│  │                                                                        │ │
│  │  KnowledgeExtractionEngine → PatternDetectionEngine                   │ │
│  │         → KnowledgeValidationEngine → KnowledgeConsolidationEngine    │ │
│  │         → KnowledgeEvolutionEngine → LearningQualityEngine            │ │
│  │         → KnowledgePublishingEngine                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │  LearningFeedback    │  │  LearningMemory       │                       │
│  │  Engine              │  │  (history, replay,    │                       │
│  │  (feedback loop)     │  │   snapshot, timeline) │                       │
│  └──────────────────────┘  └──────────────────────┘                        │
│                                                                              │
│  Publica para:  UniversalEventBus                                           │
│  Persiste em:   PostgreSQL (knowledge corpus) + Redis (cache)               │
│  Consome de:    ExecutionEngine, ConversationEngine, FeedbackService        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# REVISÃO 2 — LEARNING PIPELINE

---

## 2.1 Pipeline Oficial

```typescript
// packages/core/learning/learning-pipeline.ts

@Injectable()
export class LearningPipeline {
  constructor(
    private readonly extraction:    KnowledgeExtractionEngine,
    private readonly detection:     PatternDetectionEngine,
    private readonly validation:    KnowledgeValidationEngine,
    private readonly consolidation: KnowledgeConsolidationEngine,
    private readonly evolution:     KnowledgeEvolutionEngine,
    private readonly quality:       LearningQualityEngine,
    private readonly publishing:    KnowledgePublishingEngine,
    private readonly feedback:      LearningFeedbackEngine,
    private readonly memory:        LearningMemory,
    private readonly eventBus:      UniversalEventBus,
  ) {}

  async execute(input: LearningInput): Promise<LearningOutput> {
    const t0         = Date.now();
    const learningId = generateId("lrn");

    await this.eventBus.publish("learning.started", {
      learningId, source: input.source, userId: input.userId,
    });

    // ── ETAPA 1: Extração ──────────────────────────────────────────────────
    const extracted = await this.extraction.extract(input);
    await this.eventBus.publish("knowledge.extracted", {
      learningId, count: extracted.length,
      types: [...new Set(extracted.map(k => k.type))],
    });

    // ── ETAPA 2: Detecção de Padrões ───────────────────────────────────────
    const { items: withPatterns, patterns } = await this.detection.detect(extracted, input);
    if (patterns.length > 0) {
      await this.eventBus.publish("pattern.detected", {
        learningId, patterns: patterns.map(p => ({ type: p.type, confidence: p.confidence })),
      });
    }

    // ── ETAPA 3: Validação ──────────────────────────────────────────────────
    const validated = await this.validation.validate(withPatterns, input);
    await this.eventBus.publish("knowledge.validated", {
      learningId,
      accepted: validated.filter(v => v.status === "VALIDATED").length,
      rejected: validated.filter(v => v.status === "REJECTED").length,
    });

    // ── ETAPA 4: Consolidação ───────────────────────────────────────────────
    const consolidated = await this.consolidation.consolidate(
      validated.filter(v => v.status === "VALIDATED"), input
    );
    await this.eventBus.publish("knowledge.consolidated", {
      learningId, count: consolidated.length,
    });

    // ── ETAPA 5: Evolução ───────────────────────────────────────────────────
    const evolved = await this.evolution.evolve(consolidated, input);
    await this.eventBus.publish("knowledge.evolved", {
      learningId,
      updated: evolved.filter(e => e.wasUpdated).length,
      deprecated: evolved.filter(e => e.wasDeprecated).length,
    });

    // ── ETAPA 6: Avaliação de Qualidade ────────────────────────────────────
    const qualityReport = await this.quality.evaluate(evolved, patterns, input);

    // ── ETAPA 7: Publicação ──────────────────────────────────────────────────
    const published = await this.publishing.publish(
      evolved.filter(e => !e.wasDeprecated), qualityReport
    );
    await this.eventBus.publish("knowledge.published", {
      learningId, count: published.length,
      consumers: [...new Set(published.flatMap(p => p.publishedTo))],
    });

    // ── Persistir no LearningMemory ─────────────────────────────────────────
    const output: LearningOutput = {
      learningId, source: input.source,
      extracted, patterns,
      validated: validated.filter(v => v.status === "VALIDATED"),
      consolidated,
      published,
      qualityReport,
      metrics: this.buildMetrics(extracted, patterns, validated, consolidated, published, t0),
      durationMs: Date.now() - t0,
      createdAt: new Date().toISOString(),
    };

    await this.memory.store(output);

    await this.eventBus.publish("learning.completed", {
      learningId, source: input.source, userId: input.userId,
      extracted: extracted.length, patterns: patterns.length,
      published: published.length, durationMs: output.durationMs,
    });

    return output;
  }
}
```

---

# REVISÃO 3 — KNOWLEDGE EXTRACTION ENGINE

---

## 3.1 Interface e Responsabilidades

```typescript
// packages/core/learning/knowledge-extraction-engine.ts

export interface IKnowledgeExtractionEngine {
  extract(input: LearningInput): Promise<KnowledgeItem[]>;
}

@Injectable()
export class KnowledgeExtractionEngine implements IKnowledgeExtractionEngine {
  async extract(input: LearningInput): Promise<KnowledgeItem[]> {
    const extractors = this.selectExtractors(input.source);
    const results    = await Promise.all(extractors.map(e => e.extract(input)));
    return results.flat().filter(Boolean);
  }

  private selectExtractors(source: LearningSource): KnowledgeExtractor[] {
    const map: Record<LearningSource, KnowledgeExtractor[]> = {
      EXECUTION:    [this.executionExtractor, this.connectorExtractor, this.workflowExtractor],
      CONVERSATION: [this.conversationExtractor, this.entityExtractor, this.intentExtractor],
      FEEDBACK:     [this.feedbackExtractor, this.sentimentExtractor],
      ERROR:        [this.errorExtractor, this.failurePatternExtractor],
      SUCCESS:      [this.successExtractor, this.outcomeExtractor],
      APPROVAL:     [this.approvalExtractor, this.hierarchyExtractor],
      REJECTION:    [this.rejectionExtractor, this.constraintExtractor],
      SPECIALIST:   [this.specialistExtractor, this.domainExtractor],
      MARKETPLACE:  [this.marketplaceExtractor, this.vendorExtractor],
      SYSTEM:       [this.systemExtractor],
    };
    return map[source] ?? [this.genericExtractor];
  }
}

// Extratores especializados
@Injectable()
export class ExecutionExtractor implements KnowledgeExtractor {
  async extract(input: LearningInput): Promise<KnowledgeItem[]> {
    const result = input.executionResult!;
    const items: KnowledgeItem[] = [];

    // Fato: qual conector foi mais rápido neste contexto
    if (result.steps) {
      result.steps.forEach(step => {
        items.push(this.buildItem({
          type:   KnowledgeType.FACT,
          domain: `CONNECTOR.PERFORMANCE.${step.connectorId}`,
          value:  { connectorId: step.connectorId, durationMs: step.durationMs, success: step.success },
          origin: { sourceType: LearningSource.EXECUTION, sourceId: result.planId, userId: input.userId, orgId: input.orgId, extractedAt: new Date().toISOString(), confidence: 0.95 },
          evidence: [{ type: "DIRECT", description: "Medição direta de execução", sourceId: result.planId, weight: 1.0, addedAt: new Date().toISOString() }],
        }));
      });
    }

    // Padrão: horário da execução
    items.push(this.buildItem({
      type:   KnowledgeType.HABIT,
      domain: "USER.SCHEDULE",
      value:  { hour: new Date().getHours(), dayOfWeek: new Date().getDay(), goalDomain: result.goalDomain },
      origin: { sourceType: LearningSource.EXECUTION, sourceId: result.planId, userId: input.userId, orgId: input.orgId, extractedAt: new Date().toISOString(), confidence: 0.80 },
      evidence: [{ type: "DIRECT", description: "Horário observado da execução", sourceId: result.planId, weight: 0.8, addedAt: new Date().toISOString() }],
    }));

    return items;
  }
}

@Injectable()
export class ConversationExtractor implements KnowledgeExtractor {
  async extract(input: LearningInput): Promise<KnowledgeItem[]> {
    // Extrai entidades, preferências e padrões linguísticos da conversa
    const conversation = await this.conversationStore.get(input.conversationId!);
    const llmExtracted = await this.llm.extractKnowledge(conversation.messages, {
      types: ["PREFERENCE", "FACT", "RULE", "RELATIONSHIP"],
      userId: input.userId,
    });
    return llmExtracted.map(e => this.buildItem({ ...e, origin: { sourceType: LearningSource.CONVERSATION, sourceId: input.conversationId!, userId: input.userId, orgId: input.orgId, extractedAt: new Date().toISOString(), confidence: e.confidence ?? 0.70 } }));
  }
}

@Injectable()
export class ErrorExtractor implements KnowledgeExtractor {
  async extract(input: LearningInput): Promise<KnowledgeItem[]> {
    const result = input.executionResult!;
    if (!result.errors?.length) return [];

    return result.errors.map(err => this.buildItem({
      type:   KnowledgeType.ANOMALY,
      domain: `ERROR.${err.code}`,
      value:  { errorCode: err.code, connectorId: err.connectorId, context: err.context },
      origin: { sourceType: LearningSource.ERROR, sourceId: result.planId, userId: input.userId, orgId: input.orgId, extractedAt: new Date().toISOString(), confidence: 1.0 },
      evidence: [{ type: "DIRECT", description: `Erro real observado: ${err.code}`, sourceId: result.planId, weight: 1.0, addedAt: new Date().toISOString() }],
    }));
  }
}
```

---

# REVISÃO 4 — PATTERN DETECTION ENGINE

---

## 4.1 Interface e Tipos de Padrão

```typescript
// packages/core/learning/pattern-detection-engine.ts

export interface IPatternDetectionEngine {
  detect(
    items: KnowledgeItem[],
    input: LearningInput
  ): Promise<{ items: KnowledgeItem[]; patterns: DetectedPattern[] }>;
}

export interface DetectedPattern {
  patternId:   string;
  type:        PatternType;
  description: string;
  occurrences: number;
  confidence:  number;      // 0.0–1.0
  isRecurrent: boolean;     // ocorreu >= 3 vezes
  evidence:    KnowledgeEvidence[];
  userId?:     string;
  orgId?:      string;
  domain?:     string;
  trigger?:    PatternTrigger;
  steps?:      PatternStep[];
  avgDurationMin?: number;
  detectedAt:  string;
}

export enum PatternType {
  HABIT               = "HABIT",              // hábito pessoal
  PREFERENCE          = "PREFERENCE",         // preferência observada
  SCHEDULE            = "SCHEDULE",           // padrão de horário
  LOCATION            = "LOCATION",           // padrão de localização
  ROUTINE             = "ROUTINE",            // rotina recorrente
  RECURRING_GOAL      = "RECURRING_GOAL",     // objetivo que se repete
  RECURRING_ERROR     = "RECURRING_ERROR",    // erro que se repete
  SUCCESS_PATTERN     = "SUCCESS_PATTERN",    // o que leva ao sucesso
  ANOMALY             = "ANOMALY",            // desvio do padrão
  BEHAVIOR_CHANGE     = "BEHAVIOR_CHANGE",    // mudança de comportamento
  CONTEXT_CHANGE      = "CONTEXT_CHANGE",     // mudança de contexto
  ORGANIZATIONAL      = "ORGANIZATIONAL",     // padrão da organização
  SPECIALIST          = "SPECIALIST",         // padrão de uso de specialists
  MARKETPLACE         = "MARKETPLACE",        // padrão de uso de marketplace
}

@Injectable()
export class PatternDetectionEngine implements IPatternDetectionEngine {
  async detect(
    items: KnowledgeItem[],
    input: LearningInput
  ): Promise<{ items: KnowledgeItem[]; patterns: DetectedPattern[] }> {
    const history = await this.store.getRecent(input.userId, input.orgId, 90);
    const all     = [...history, ...items];

    const [habits, preferences, schedules, recurring, errors, successes, anomalies, orgPatterns, changes] = await Promise.all([
      this.detectHabits(all, input.userId),
      this.detectPreferences(all, input.userId),
      this.detectSchedules(all, input.userId),
      this.detectRecurringGoals(all, input.userId),
      this.detectRecurringErrors(all, input.userId),
      this.detectSuccessPatterns(all, input.userId),
      this.detectAnomalies(all),
      this.detectOrganizationalPatterns(all, input.orgId),
      this.detectBehaviorChanges(all, input.userId),
    ]);

    const patterns = [
      ...habits, ...preferences, ...schedules, ...recurring,
      ...errors, ...successes, ...anomalies, ...orgPatterns, ...changes,
    ].filter(p => p.confidence >= 0.60);

    // Enriquecer os KnowledgeItems com padrões detectados
    const enriched = items.map(item => ({
      ...item,
      relatedPatterns: patterns
        .filter(p => this.isRelated(p, item))
        .map(p => p.patternId),
    }));

    return { items: enriched, patterns };
  }

  private async detectHabits(items: KnowledgeItem[], userId: string): Promise<DetectedPattern[]> {
    const scheduleItems = items.filter(i => i.type === KnowledgeType.HABIT && i.domain === "USER.SCHEDULE");
    const byHourDay    = this.groupByHourAndDay(scheduleItems);

    return Object.entries(byHourDay)
      .filter(([, group]) => group.length >= 3)
      .map(([key, group]) => {
        const [hour, day] = key.split("_").map(Number);
        return {
          patternId:   generateId("ptn"),
          type:        PatternType.HABIT,
          description: `Usuário tende a realizar ${group[0].value.goalDomain} às ${hour}h nas ${this.dayName(day)}`,
          occurrences: group.length,
          confidence:  Math.min(0.5 + group.length * 0.1, 0.99),
          isRecurrent: group.length >= 3,
          evidence:    group.map(i => i.evidence[0]),
          userId,
          domain:      group[0].value.goalDomain,
          avgDurationMin: 0,
          detectedAt:  new Date().toISOString(),
        };
      });
  }

  private async detectAnomalies(items: KnowledgeItem[]): Promise<DetectedPattern[]> {
    const errorItems  = items.filter(i => i.type === KnowledgeType.ANOMALY);
    const errorCounts = this.countBy(errorItems, i => i.domain);

    return Object.entries(errorCounts)
      .filter(([, count]) => count >= 2)
      .map(([domain, count]) => ({
        patternId:   generateId("ptn"),
        type:        PatternType.RECURRING_ERROR,
        description: `Erro recorrente detectado: ${domain} (${count}x)`,
        occurrences: count,
        confidence:  Math.min(0.7 + count * 0.05, 0.99),
        isRecurrent: count >= 3,
        evidence:    errorItems.filter(i => i.domain === domain).map(i => i.evidence[0]),
        detectedAt:  new Date().toISOString(),
      }));
  }
}
```

---

# REVISÃO 5 — KNOWLEDGE VALIDATION ENGINE

---

## 5.1 Interface e Regras de Validação

```typescript
// packages/core/learning/knowledge-validation-engine.ts

export interface IKnowledgeValidationEngine {
  validate(items: KnowledgeItem[], input: LearningInput): Promise<ValidatedKnowledge[]>;
}

export interface ValidatedKnowledge extends KnowledgeItem {
  validationResult: ValidationDetail;
  status:           "VALIDATED" | "REJECTED";
}

export interface ValidationDetail {
  passed:      boolean;
  score:       number;           // 0.0–1.0
  checks:      ValidationCheck[];
  rejectedBy?: string;           // nome do check que rejeitou
  evidence:    KnowledgeEvidence[];
  validatedAt: string;
}

export interface KnowledgeValidationCheck {
  name:       string;
  weight:     number;
  minScore:   number;            // abaixo disto, rejeitar
  evaluate(item: KnowledgeItem, corpus: KnowledgeItem[]): Promise<number>;
}

@Injectable()
export class KnowledgeValidationEngine implements IKnowledgeValidationEngine {
  private readonly checks: KnowledgeValidationCheck[] = [
    new ConfidenceCheck(0.40),         // confidenceScore mínimo
    new ConsistencyCheck(0.60),        // não contradiz corpus
    new DuplicityCheck(0.70),          // não duplica conhecimento existente
    new ContradictionCheck(0.60),      // não contradiz conhecimento validado
    new SourceReliabilityCheck(0.50),  // fonte confiável
    new FreshnessCheck(0.50),          // não obsoleto
    new RelevanceCheck(0.40),          // relevante para o domínio
    new ContextConsistencyCheck(0.50), // coerente com contexto do usuário
    new QualityScoreCheck(0.40),       // qualityScore mínimo
    new EvidenceCheck(0.50),           // tem pelo menos 1 evidência DIRECT
  ];

  async validate(items: KnowledgeItem[], input: LearningInput): Promise<ValidatedKnowledge[]> {
    const corpus = await this.knowledgeStore.getCorpus(input.userId, input.orgId);
    return Promise.all(items.map(item => this.validateItem(item, corpus)));
  }

  private async validateItem(item: KnowledgeItem, corpus: KnowledgeItem[]): Promise<ValidatedKnowledge> {
    const results = await Promise.all(this.checks.map(async c => ({
      name:   c.name,
      weight: c.weight,
      score:  await c.evaluate(item, corpus),
      min:    c.minScore,
    })));

    const hardFail = results.find(r => r.score < r.min);
    const totalScore = results.reduce((acc, r) => acc + r.score * r.weight, 0);

    return {
      ...item,
      status: hardFail ? "REJECTED" : "VALIDATED",
      validationResult: {
        passed:      !hardFail,
        score:       totalScore,
        checks:      results,
        rejectedBy:  hardFail?.name,
        evidence:    item.evidence,
        validatedAt: new Date().toISOString(),
      },
    };
  }
}

// Check de contradição
class ContradictionCheck implements KnowledgeValidationCheck {
  name = "CONTRADICTION";  weight = 1.5;  minScore = 0.60;

  async evaluate(item: KnowledgeItem, corpus: KnowledgeItem[]): Promise<number> {
    const sameType   = corpus.filter(c => c.type === item.type && c.domain === item.domain);
    const contradicts = sameType.filter(c => this.isContradiction(c.value, item.value));
    if (!contradicts.length) return 1.0;
    // Peso pela confiança do item que contradiz
    const maxConfidence = Math.max(...contradicts.map(c => c.confidenceScore));
    return 1 - maxConfidence;   // quanto mais confiante o contraditório, menor o score
  }
}
```

---

# REVISÃO 6 — KNOWLEDGE CONSOLIDATION ENGINE

---

## 6.1 Interface e Implementação

```typescript
// packages/core/learning/knowledge-consolidation-engine.ts

export interface ConsolidatedKnowledge extends ValidatedKnowledge {
  consolidationResult: ConsolidationDetail;
  previousVersion?:    string;    // knowledgeId da versão anterior
  mergedFrom?:         string[];  // knowledgeIds mesclados
}

export interface ConsolidationDetail {
  action:      "CREATED" | "UPDATED" | "MERGED" | "SUPERSEDED";
  previousId?:  string;
  previousVersion?: string;
  conflictsResolved: ConflictResolution[];
  consolidatedAt: string;
  version:      string;
}

export interface ConflictResolution {
  conflictType: "VALUE" | "CONFIDENCE" | "CONTEXT";
  strategy:     "HIGHER_CONFIDENCE" | "MOST_RECENT" | "MERGE" | "KEEP_BOTH";
  winner:       string;    // knowledgeId vencedor
  loser:        string;
  rationale:    string;
}

@Injectable()
export class KnowledgeConsolidationEngine {
  async consolidate(
    validated: ValidatedKnowledge[],
    input:     LearningInput
  ): Promise<ConsolidatedKnowledge[]> {
    const corpus = await this.knowledgeStore.getCorpus(input.userId, input.orgId);
    return Promise.all(validated.map(item => this.consolidateItem(item, corpus, input)));
  }

  private async consolidateItem(
    item:   ValidatedKnowledge,
    corpus: KnowledgeItem[],
    input:  LearningInput
  ): Promise<ConsolidatedKnowledge> {
    const existing = corpus.find(c =>
      c.type === item.type && c.domain === item.domain && this.isSameKnowledge(c, item)
    );

    if (!existing) {
      // Criar novo conhecimento
      const newItem = { ...item, version: "1.0.0", status: KnowledgeStatus.CONSOLIDATED };
      await this.knowledgeStore.create(newItem, input.userId, input.orgId);
      return { ...newItem, consolidationResult: { action: "CREATED", conflictsResolved: [], consolidatedAt: new Date().toISOString(), version: "1.0.0" } };
    }

    // Verificar conflitos
    const conflicts = this.detectConflicts(existing, item);
    const resolutions = conflicts.map(c => this.resolveConflict(c, existing, item));
    const merged = this.applyResolutions(existing, item, resolutions);

    // Versionar
    const newVersion = this.bumpVersion(existing.version, conflicts.length > 0 ? "MINOR" : "PATCH");
    const updated = { ...merged, version: newVersion, status: KnowledgeStatus.CONSOLIDATED };

    await this.knowledgeStore.update(existing.knowledgeId, updated, input.userId, input.orgId);

    return {
      ...updated,
      previousVersion: existing.knowledgeId,
      consolidationResult: {
        action: "UPDATED",
        previousId: existing.knowledgeId,
        previousVersion: existing.version,
        conflictsResolved: resolutions,
        consolidatedAt: new Date().toISOString(),
        version: newVersion,
      },
    };
  }

  private resolveConflict(
    conflict: KnowledgeConflict,
    a:        KnowledgeItem,
    b:        KnowledgeItem
  ): ConflictResolution {
    // Estratégia padrão: maior confidenceScore vence
    const winner = a.confidenceScore >= b.confidenceScore ? a : b;
    const loser  = winner === a ? b : a;
    return {
      conflictType: conflict.type,
      strategy:     "HIGHER_CONFIDENCE",
      winner:       winner.knowledgeId,
      loser:        loser.knowledgeId,
      rationale:    `Confiança ${(winner.confidenceScore * 100).toFixed(0)}% > ${(loser.confidenceScore * 100).toFixed(0)}%`,
    };
  }
}
```

---

# REVISÃO 7 — KNOWLEDGE EVOLUTION ENGINE

---

## 7.1 Interface e Implementação

```typescript
// packages/core/learning/knowledge-evolution-engine.ts

export interface EvolvedKnowledge extends ConsolidatedKnowledge {
  wasUpdated:    boolean;
  wasDeprecated: boolean;
  evolutionDetail: EvolutionDetail;
}

export interface EvolutionDetail {
  evolutionType:    EvolutionType;
  timeline:         KnowledgeTimeline;
  diff?:            KnowledgeDiff;
  rollbackAvailable: boolean;
  deprecatedIds?:   string[];
  archivedIds?:     string[];
  replacedBy?:      string;
}

export enum EvolutionType {
  STABLE      = "STABLE",       // sem alteração
  ENRICHED    = "ENRICHED",     // nova evidência adicionada
  CORRECTED   = "CORRECTED",    // valor corrigido
  DEPRECATED  = "DEPRECATED",   // substituído por mais novo
  ARCHIVED    = "ARCHIVED",     // sem uso recente
  ROLLED_BACK = "ROLLED_BACK",  // revertido para versão anterior
}

export interface KnowledgeTimeline {
  knowledgeId:  string;
  history: Array<{
    version:       string;
    value:         unknown;
    confidenceScore: number;
    changedAt:     string;
    changedBy:     LearningSource;
    reason?:       string;
  }>;
  firstCreatedAt: string;
  lastUpdatedAt:  string;
  totalVersions:  number;
}

export interface KnowledgeDiff {
  knowledgeId:  string;
  fromVersion:  string;
  toVersion:    string;
  added:        string[];   // campos/valores adicionados
  removed:      string[];   // campos/valores removidos
  changed:      Array<{ field: string; from: unknown; to: unknown }>;
  confidenceDelta: number;
}

@Injectable()
export class KnowledgeEvolutionEngine {
  async evolve(
    items: ConsolidatedKnowledge[],
    input: LearningInput
  ): Promise<EvolvedKnowledge[]> {
    return Promise.all(items.map(item => this.evolveItem(item, input)));
  }

  private async evolveItem(item: ConsolidatedKnowledge, input: LearningInput): Promise<EvolvedKnowledge> {
    const timeline = await this.buildTimeline(item);
    const diff     = item.previousVersion
      ? await this.buildDiff(item.previousVersion, item.knowledgeId)
      : undefined;

    // Deprecar versões anteriores do mesmo domínio se confiança significativamente maior
    const toDeprecate = await this.findDeprecatable(item);
    if (toDeprecate.length > 0) {
      await Promise.all(toDeprecate.map(id =>
        this.knowledgeStore.updateStatus(id, KnowledgeStatus.DEPRECATED, { replacedBy: item.knowledgeId })
      ));
      await this.eventBus.publish("knowledge.deprecated", {
        deprecatedIds: toDeprecate, replacedBy: item.knowledgeId,
      });
    }

    // Arquivar conhecimento sem uso recente (>180 dias)
    const toArchive = await this.findArchivable(item.domain, input.userId);
    if (toArchive.length > 0) {
      await Promise.all(toArchive.map(id =>
        this.knowledgeStore.updateStatus(id, KnowledgeStatus.ARCHIVED, {})
      ));
      await this.eventBus.publish("knowledge.archived", {
        archivedIds: toArchive, reason: "NO_RECENT_USE",
      });
    }

    return {
      ...item,
      wasUpdated:    !!item.previousVersion,
      wasDeprecated: false,
      evolutionDetail: {
        evolutionType:    diff ? EvolutionType.CORRECTED : EvolutionType.ENRICHED,
        timeline,
        diff,
        rollbackAvailable: timeline.totalVersions > 1,
        deprecatedIds:    toDeprecate.length > 0 ? toDeprecate : undefined,
        archivedIds:      toArchive.length > 0 ? toArchive : undefined,
      },
    };
  }

  // Rollback para versão anterior
  async rollback(knowledgeId: string, targetVersion: string, userId: string): Promise<KnowledgeItem> {
    const timeline = await this.knowledgeStore.getTimeline(knowledgeId);
    const target   = timeline.history.find(h => h.version === targetVersion);
    if (!target) throw new KnowledgeVersionNotFoundError(knowledgeId, targetVersion);

    const rolled = await this.knowledgeStore.rollback(knowledgeId, target, userId);
    await this.eventBus.publish("knowledge.evolved", {
      knowledgeId, evolutionType: EvolutionType.ROLLED_BACK, fromVersion: timeline.history.at(-1)!.version, toVersion: targetVersion,
    });
    return rolled;
  }
}
```

---

# REVISÃO 8 — LEARNING FEEDBACK ENGINE

---

## 8.1 Interface e Implementação

```typescript
// packages/core/learning/learning-feedback-engine.ts

export interface FeedbackInput {
  feedbackId:     string;
  type:           FeedbackType;
  targetId:       string;         // knowledgeId, suggestionId, workflowId
  targetType:     "KNOWLEDGE" | "SUGGESTION" | "WORKFLOW" | "RECOMMENDATION";
  userId:         string;
  orgId:          string;
  signal:         FeedbackSignal;
  comment?:       string;
  correction?:    unknown;        // valor correto (para CORRECTION)
  source:         FeedbackSource;
  receivedAt:     string;
}

export enum FeedbackType {
  POSITIVE    = "POSITIVE",
  NEGATIVE    = "NEGATIVE",
  CORRECTION  = "CORRECTION",
  APPROVAL    = "APPROVAL",
  REJECTION   = "REJECTION",
}

export enum FeedbackSignal {
  EXPLICIT_LIKE     = "EXPLICIT_LIKE",        // usuário clicou "gostei"
  EXPLICIT_DISLIKE  = "EXPLICIT_DISLIKE",     // usuário clicou "não gostei"
  ACCEPTED          = "ACCEPTED",             // usuário aceitou sugestão
  DISMISSED         = "DISMISSED",            // usuário ignorou sugestão
  CORRECTED         = "CORRECTED",            // usuário corrigiu o resultado
  APPROVED_WORKFLOW = "APPROVED_WORKFLOW",    // humano aprovou workflow
  REJECTED_WORKFLOW = "REJECTED_WORKFLOW",    // humano rejeitou workflow
  SPECIALIST_CONFIRM = "SPECIALIST_CONFIRM",  // specialist confirmou
  SYSTEM_VALIDATION  = "SYSTEM_VALIDATION",   // sistema validou automaticamente
}

export enum FeedbackSource {
  USER        = "USER",
  ENTERPRISE  = "ENTERPRISE",
  SPECIALIST  = "SPECIALIST",
  MARKETPLACE = "MARKETPLACE",
  SYSTEM      = "SYSTEM",
}

@Injectable()
export class LearningFeedbackEngine {
  async process(feedback: FeedbackInput): Promise<void> {
    await this.eventBus.publish("feedback.received", {
      feedbackId: feedback.feedbackId, type: feedback.type,
      signal: feedback.signal, targetType: feedback.targetType,
      source: feedback.source, userId: feedback.userId,
    });

    // Ajustar confidenceScore do knowledge alvo
    if (feedback.targetType === "KNOWLEDGE") {
      const delta = this.computeConfidenceDelta(feedback);
      await this.knowledgeStore.adjustConfidence(feedback.targetId, delta);
    }

    // Processar correções — gerar novo KnowledgeItem do tipo CORRECTION
    if (feedback.type === FeedbackType.CORRECTION && feedback.correction) {
      await this.learningPipeline.execute({
        source: LearningSource.FEEDBACK,
        feedbackId: feedback.feedbackId,
        userId: feedback.userId,
        orgId: feedback.orgId,
        sessionCtx: {} as SessionContext,
      });
    }

    // Ajuste de hábito: aprovações consecutivas elevam confiança
    if ([FeedbackType.APPROVAL, FeedbackType.POSITIVE].includes(feedback.type)) {
      await this.habitDetector.reinforce(feedback.targetId, feedback.userId);
    }

    // Rejeições: reduzem peso do padrão
    if ([FeedbackType.REJECTION, FeedbackType.NEGATIVE].includes(feedback.type)) {
      await this.habitDetector.weaken(feedback.targetId, feedback.userId);
    }
  }

  private computeConfidenceDelta(feedback: FeedbackInput): number {
    const weights: Record<FeedbackSignal, number> = {
      EXPLICIT_LIKE:      +0.05,
      EXPLICIT_DISLIKE:   -0.10,
      ACCEPTED:           +0.08,
      DISMISSED:          -0.03,
      CORRECTED:          -0.15,
      APPROVED_WORKFLOW:  +0.12,
      REJECTED_WORKFLOW:  -0.12,
      SPECIALIST_CONFIRM: +0.20,
      SYSTEM_VALIDATION:  +0.10,
    };
    // Fonte influencia o peso: especialista pesa mais que usuário
    const sourceMult: Record<FeedbackSource, number> = {
      USER: 1.0, ENTERPRISE: 1.2, SPECIALIST: 1.5, MARKETPLACE: 1.1, SYSTEM: 0.8,
    };
    return (weights[feedback.signal] ?? 0) * sourceMult[feedback.source];
  }
}
```

---

# REVISÃO 9 — LEARNING QUALITY ENGINE

---

## 9.1 Interface e Modelos

```typescript
// packages/core/learning/learning-quality-engine.ts

export interface LearningQualityReport {
  reportId:        string;
  learningId:      string;
  overallScore:    number;      // 0.0–1.0
  dimensions:      QualityDimension[];
  recommendations: string[];
  pass:            boolean;     // atingiu threshold mínimo?
  threshold:       number;
  generatedAt:     string;
}

export interface QualityDimension {
  name:        QualityDimensionName;
  score:       number;       // 0.0–1.0
  weight:      number;
  description: string;
  evidence:    string[];
}

export enum QualityDimensionName {
  ACCURACY        = "ACCURACY",        // o aprendizado é correto?
  PRECISION       = "PRECISION",       // sem ruído / generalização excessiva
  RELEVANCE       = "RELEVANCE",       // útil para os objetivos do usuário?
  FRESHNESS       = "FRESHNESS",       // atual?
  COVERAGE        = "COVERAGE",        // cobre os domínios relevantes?
  GENERALIZATION  = "GENERALIZATION",  // aplicável além do caso específico?
  SPECIALIZATION  = "SPECIALIZATION",  // suficientemente específico?
  CONSISTENCY     = "CONSISTENCY",     // coerente com o corpus existente?
}

@Injectable()
export class LearningQualityEngine {
  async evaluate(
    evolved:  EvolvedKnowledge[],
    patterns: DetectedPattern[],
    input:    LearningInput
  ): Promise<LearningQualityReport> {
    const corpus  = await this.knowledgeStore.getCorpus(input.userId, input.orgId);
    const weights = { ACCURACY: 0.25, PRECISION: 0.15, RELEVANCE: 0.20, FRESHNESS: 0.10, COVERAGE: 0.10, GENERALIZATION: 0.10, SPECIALIZATION: 0.05, CONSISTENCY: 0.05 };

    const dimensions: QualityDimension[] = [
      {
        name:   QualityDimensionName.ACCURACY,
        score:  this.computeAccuracy(evolved),
        weight: weights.ACCURACY,
        description: "% de itens com confidenceScore ≥ 0.70 após validação",
        evidence: [`${evolved.filter(e => e.confidenceScore >= 0.70).length}/${evolved.length} acima de 0.70`],
      },
      {
        name:   QualityDimensionName.RELEVANCE,
        score:  this.computeRelevance(evolved, input),
        weight: weights.RELEVANCE,
        description: "Proporção de itens relevantes ao objetivo atual",
        evidence: [`Domínio alvo: ${input.goalContext?.ontologyDomain ?? "N/A"}`],
      },
      {
        name:   QualityDimensionName.FRESHNESS,
        score:  this.computeFreshness(corpus),
        weight: weights.FRESHNESS,
        description: "% do corpus com menos de 30 dias",
        evidence: [`Itens recentes: ${corpus.filter(c => this.isRecent(c, 30)).length}/${corpus.length}`],
      },
      {
        name:   QualityDimensionName.CONSISTENCY,
        score:  this.computeConsistency(evolved, corpus),
        weight: weights.CONSISTENCY,
        description: "% de itens sem contradições no corpus",
        evidence: [],
      },
      // ... demais dimensões
    ];

    const overall = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const threshold = 0.60;

    return {
      reportId:        generateId("qlr"),
      learningId:      input.userId,
      overallScore:    overall,
      dimensions,
      recommendations: this.buildRecommendations(dimensions),
      pass:            overall >= threshold,
      threshold,
      generatedAt:     new Date().toISOString(),
    };
  }
}
```

---

# REVISÃO 10 — KNOWLEDGE PUBLISHING ENGINE

---

## 10.1 Interface e Consumidores

```typescript
// packages/core/learning/knowledge-publishing-engine.ts

export interface PublishedKnowledge extends EvolvedKnowledge {
  publishedTo: PublishingConsumer[];
  publishedAt: string;
}

export enum PublishingConsumer {
  MEMORY_ENGINE        = "MEMORY_ENGINE",
  GOAL_ENGINE          = "GOAL_ENGINE",
  PLANNER              = "PLANNER",
  CAPABILITY_INTEL     = "CAPABILITY_INTEL",
  MARKETPLACE          = "MARKETPLACE",
  SPECIALISTS          = "SPECIALISTS",
  VOICE_ENGINE         = "VOICE_ENGINE",
  RECOMMENDATION_ENGINE = "RECOMMENDATION_ENGINE",
  PREDICTION_ENGINE    = "PREDICTION_ENGINE",
}

export interface PublishingRule {
  knowledgeType: KnowledgeType;
  consumers:     PublishingConsumer[];
  minConfidence: number;
  priority:      "IMMEDIATE" | "BATCH" | "LAZY";
}

export const PUBLISHING_RULES: PublishingRule[] = [
  {
    knowledgeType: KnowledgeType.HABIT,
    consumers:     [PublishingConsumer.MEMORY_ENGINE, PublishingConsumer.GOAL_ENGINE, PublishingConsumer.PREDICTION_ENGINE],
    minConfidence: 0.70, priority: "IMMEDIATE",
  },
  {
    knowledgeType: KnowledgeType.PREFERENCE,
    consumers:     [PublishingConsumer.MEMORY_ENGINE, PublishingConsumer.CAPABILITY_INTEL, PublishingConsumer.SPECIALISTS],
    minConfidence: 0.65, priority: "IMMEDIATE",
  },
  {
    knowledgeType: KnowledgeType.WORKFLOW,
    consumers:     [PublishingConsumer.PLANNER, PublishingConsumer.GOAL_ENGINE, PublishingConsumer.MARKETPLACE],
    minConfidence: 0.80, priority: "IMMEDIATE",
  },
  {
    knowledgeType: KnowledgeType.FACT,
    consumers:     [PublishingConsumer.MEMORY_ENGINE],
    minConfidence: 0.60, priority: "BATCH",
  },
  {
    knowledgeType: KnowledgeType.PATTERN,
    consumers:     [PublishingConsumer.GOAL_ENGINE, PublishingConsumer.PLANNER, PublishingConsumer.RECOMMENDATION_ENGINE],
    minConfidence: 0.75, priority: "IMMEDIATE",
  },
  {
    knowledgeType: KnowledgeType.ANOMALY,
    consumers:     [PublishingConsumer.CAPABILITY_INTEL, PublishingConsumer.SPECIALISTS],
    minConfidence: 0.50, priority: "IMMEDIATE",
  },
];

@Injectable()
export class KnowledgePublishingEngine {
  async publish(items: EvolvedKnowledge[], quality: LearningQualityReport): Promise<PublishedKnowledge[]> {
    if (!quality.pass) return [];   // qualidade insuficiente — não publicar

    const published: PublishedKnowledge[] = [];

    for (const item of items) {
      const rules = PUBLISHING_RULES.filter(r =>
        r.knowledgeType === item.type && item.confidenceScore >= r.minConfidence
      );
      if (!rules.length) continue;

      const consumers = [...new Set(rules.flatMap(r => r.consumers))];
      await this.distribute(item, consumers, rules);

      published.push({ ...item, publishedTo: consumers, publishedAt: new Date().toISOString() });
    }

    return published;
  }

  private async distribute(item: EvolvedKnowledge, consumers: PublishingConsumer[], rules: PublishingRule[]): Promise<void> {
    const immediate = consumers.filter(c => rules.some(r => r.consumers.includes(c) && r.priority === "IMMEDIATE"));
    const batch     = consumers.filter(c => !immediate.includes(c));

    // Publicação imediata em paralelo
    await Promise.all(immediate.map(consumer =>
      this.eventBus.publish("knowledge.published", {
        knowledgeId: item.knowledgeId, consumer,
        type:        item.type,
        domain:      item.domain,
        value:       item.value,
        confidence:  item.confidenceScore,
        version:     item.version,
      })
    ));

    // Publicação batch via queue
    if (batch.length > 0) {
      await this.batchQueue.enqueue(batch.map(consumer => ({
        knowledgeId: item.knowledgeId, consumer, item,
      })));
    }
  }
}
```

---

# REVISÃO 11 — LEARNING MEMORY

---

## 11.1 Interface e Modelos

```typescript
// packages/core/learning/learning-memory.ts

export interface ILearningMemory {
  store(output: LearningOutput): Promise<void>;
  getHistory(userId: string, limit?: number): Promise<LearningHistoryEntry[]>;
  getTimeline(userId: string, domain?: string): Promise<LearningTimeline>;
  replay(learningId: string): Promise<LearningOutput>;
  getSnapshot(userId: string): Promise<LearningSnapshot>;
  getEvolution(knowledgeId: string): Promise<KnowledgeEvolutionRecord>;
  getMetrics(userId: string, windowDays: number): Promise<LearningMetricsSummary>;
  getConfidenceEvolution(userId: string, connectorId: string): Promise<ConfidenceEvolution>;
}

export interface LearningHistoryEntry {
  learningId:    string;
  source:        LearningSource;
  extractedCount: number;
  publishedCount: number;
  qualityScore:  number;
  durationMs:    number;
  createdAt:     string;
}

export interface LearningTimeline {
  userId:       string;
  domain?:      string;
  events: Array<{
    date:          string;
    type:          "LEARNED" | "UPDATED" | "DEPRECATED" | "ARCHIVED" | "ROLLED_BACK";
    knowledgeId:   string;
    knowledgeType: KnowledgeType;
    domain:        string;
    confidence:    number;
    description:   string;
  }>;
  totalEvents:  number;
  span:         { start: string; end: string };
}

export interface LearningSnapshot {
  userId:       string;
  capturedAt:   string;
  totalKnowledge: number;
  byType:       Record<KnowledgeType, number>;
  byStatus:     Record<KnowledgeStatus, number>;
  avgConfidence: number;
  avgQuality:   number;
  domains:      string[];
  topPatterns:  DetectedPattern[];
  topHabits:    DetectedPattern[];
  recentActivity: LearningHistoryEntry[];
}

export interface LearningMetricsSummary {
  windowDays:         number;
  learningRate:       number;    // novos itens/dia
  knowledgeGrowth:    number;    // % crescimento do corpus
  avgQualityScore:    number;
  avgConfidenceScore: number;
  patternDetectionRate: number;  // padrões/aprendizado
  publishingRate:     number;    // % publicados com sucesso
  feedbackImpact:     number;    // mudança média de confiança por feedback
  learningROI:        number;    // estimativa de valor gerado
}
```

---

# REVISÃO 12 — LEARNING EVENTS

---

```typescript
// packages/shared/events/learning-events-v1.4.ts

/** learning.started — LearningPipeline | Consumer: AuditLogger */
export interface LearningStartedEvent {
  learningId: string; source: LearningSource; userId: string; startedAt: string;
}

/** learning.completed — LearningPipeline | Consumer: LearningMemory, ObservabilityCollector */
export interface LearningCompletedEvent {
  learningId: string; source: LearningSource; userId: string;
  extracted: number; patterns: number; published: number; durationMs: number; completedAt: string;
}

/** knowledge.extracted — KnowledgeExtractionEngine | Consumer: PatternDetectionEngine */
export interface KnowledgeExtractedEvent {
  learningId: string; count: number; types: KnowledgeType[]; extractedAt: string;
}

/** knowledge.validated — KnowledgeValidationEngine | Consumer: KnowledgeConsolidationEngine */
export interface KnowledgeValidatedEvent {
  learningId: string; accepted: number; rejected: number; validatedAt: string;
}

/** knowledge.consolidated — KnowledgeConsolidationEngine | Consumer: KnowledgeEvolutionEngine */
export interface KnowledgeConsolidatedEvent {
  learningId: string; count: number; consolidatedAt: string;
}

/** knowledge.evolved — KnowledgeEvolutionEngine | Consumer: LearningMemory, ObservabilityCollector */
export interface KnowledgeEvolvedEvent {
  learningId: string; updated: number; deprecated: number; evolvedAt: string;
}

/** knowledge.published — KnowledgePublishingEngine | Consumer: MemoryEngine, GoalEngine, Planner, CapabilityIntel, Specialists */
export interface KnowledgePublishedEvent {
  learningId: string; knowledgeId: string; consumer: PublishingConsumer;
  type: KnowledgeType; domain: string; confidence: number; version: string; publishedAt: string;
}

/** pattern.detected — PatternDetectionEngine | Consumer: LearningEngine, LearningMemory */
export interface PatternDetectedEvent {
  learningId: string; patterns: Array<{ type: PatternType; confidence: number }>; detectedAt: string;
}

/** habit.learned — HabitDetector | Consumer: GoalEngine, PredictionEngine */
export interface HabitLearnedEvent {
  userId: string; habitType: string; domain: string; confidence: number; learnedAt: string;
}

/** workflow.learned — WorkflowGenerator | Consumer: Planner, GoalEngine, Marketplace */
export interface WorkflowLearnedEvent {
  userId: string; workflowId: string; confidence: number; stepsCount: number; learnedAt: string;
}

/** feedback.received — LearningFeedbackEngine | Consumer: LearningPipeline, HabitDetector */
export interface FeedbackReceivedEvent {
  feedbackId: string; type: FeedbackType; signal: FeedbackSignal;
  targetType: string; source: FeedbackSource; userId: string; receivedAt: string;
}

/** knowledge.deprecated — KnowledgeEvolutionEngine | Consumer: LearningMemory, AuditLogger */
export interface KnowledgeDeprecatedEvent {
  deprecatedIds: string[]; replacedBy: string; deprecatedAt: string;
}

/** knowledge.archived — KnowledgeEvolutionEngine | Consumer: LearningMemory */
export interface KnowledgeArchivedEvent {
  archivedIds: string[]; reason: string; archivedAt: string;
}
```

---

# REVISÃO 13 — OBSERVABILIDADE

---

```typescript
export function setupLearningMetrics(meter: Meter) {
  return {
    // Acurácia
    learningAccuracy: meter.createObservableGauge("learning_accuracy",
      { description: "% de conhecimento aprendido que provou ser correto retrospectivamente (rolling 30d)" }),
    knowledgeAccuracy: meter.createObservableGauge("knowledge_accuracy",
      { description: "% do corpus com confidenceScore ≥ 0.70" }),
    patternAccuracy: meter.createObservableGauge("learning_pattern_accuracy",
      { description: "% de padrões detectados confirmados pelo comportamento subsequente" }),
    predictionAccuracy: meter.createObservableGauge("learning_prediction_accuracy",
      { description: "% de predições corretas (rolling 7d)" }),
    recommendationAccuracy: meter.createObservableGauge("learning_recommendation_accuracy",
      { description: "% de recomendações aceitas pelo usuário (rolling 30d)" }),

    // Frescor e Cobertura
    knowledgeFreshness: meter.createObservableGauge("knowledge_freshness",
      { description: "% do corpus com menos de 30 dias" }),
    knowledgeCoverage: meter.createObservableGauge("knowledge_coverage",
      { description: "Número de domínios cobertos pelo corpus do usuário" }),
    knowledgeConfidence: meter.createHistogram("knowledge_confidence_score",
      { description: "Distribuição de confidenceScore no corpus", boundaries: [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0] }),

    // Velocidade e Volume
    learningSpeed: meter.createHistogram("learning_pipeline_duration_ms",
      { description: "Duração do pipeline completo", unit: "ms", boundaries: [50,100,250,500,1000,2500,5000] }),
    knowledgeEvolutionRate: meter.createCounter("knowledge_evolution_total",
      { description: "Itens de conhecimento criados/atualizados por ciclo" }),
    knowledgeReuse: meter.createObservableGauge("knowledge_reuse_rate",
      { description: "Média de vezes que cada KnowledgeItem é reutilizado por mês" }),

    // ROI
    learningROI: meter.createObservableGauge("learning_roi_score",
      { description: "Estimativa do valor gerado pelo Learning Engine (0–1, baseado em aceitação de sugestões e automações ativadas)" }),

    // Pipeline stages
    extractionDuration: meter.createHistogram("learning_extraction_duration_ms",
      { unit: "ms", boundaries: [10,25,50,100,250,500] }),
    validationRate: meter.createObservableGauge("learning_validation_rate",
      { description: "% de itens que passam na validação" }),
    publishingRate: meter.createObservableGauge("learning_publishing_rate",
      { description: "% de itens validados que são publicados" }),
  };
}
```

## 13.1 KPIs Oficiais

| KPI | Meta | Warning | Critical |
|---|---|---|---|
| Learning Accuracy | > 80% | < 70% | < 55% |
| Knowledge Accuracy | > 75% | < 60% | < 45% |
| Knowledge Freshness | > 60% | < 40% | < 20% |
| Pattern Accuracy | > 70% | < 55% | < 40% |
| Prediction Accuracy | > 75% | < 60% | < 45% |
| Recommendation Accuracy | > 65% | < 50% | < 35% |
| Validation Rate | > 70% | < 55% | < 40% |
| Publishing Rate | > 85% | < 70% | < 55% |
| Pipeline P95 Duration | < 1000ms | > 2500ms | > 5000ms |
| Knowledge Reuse | > 3x/mês | < 1x/mês | = 0 |
| Learning ROI | > 0.70 | < 0.50 | < 0.30 |

---

# REVISÃO 14 — CHECKLIST OFICIAL

---

```
CHECKLIST OFICIAL — LEARNING ENGINE — MDS v1.4
═══════════════════════════════════════════════════════════════════════════════

LEARNING ARCHITECTURE
  [ ] KnowledgeItem com todos os campos obrigatórios (origin, evidence, version, status)
  [ ] KnowledgeType com 10 tipos implementados
  [ ] KnowledgeStatus com 7 estados e transições válidas
  [ ] Diagrama de estados do KnowledgeItem validado
  [ ] Diagrama C4 do Learning Engine atualizado na documentação

LEARNING PIPELINE
  [ ] LearningPipeline com 7 etapas em sequência
  [ ] Cada etapa publicando evento UEB correspondente
  [ ] Pipeline isolado por userId + orgId
  [ ] Rollback disponível em caso de falha de etapa

KNOWLEDGE EXTRACTION
  [ ] KnowledgeExtractionEngine com seleção de extratores por LearningSource
  [ ] ExecutionExtractor extraindo fatos, hábitos e erros
  [ ] ConversationExtractor usando LLM com JSON schema
  [ ] ErrorExtractor criando KnowledgeType.ANOMALY
  [ ] FeedbackExtractor processando correções
  [ ] SpecialistExtractor integrado ao SpecialistBus
  [ ] Evento knowledge.extracted publicado

PATTERN DETECTION
  [ ] PatternDetectionEngine com 14 PatternTypes
  [ ] HabitDetector com groupByHourAndDay
  [ ] AnomalyDetector com thresholds configuráveis
  [ ] OrganizationalPatternDetector por orgId
  [ ] BehaviorChangeDetector com baseline adaptativo
  [ ] Evento pattern.detected publicado
  [ ] Evento habit.learned publicado

KNOWLEDGE VALIDATION
  [ ] KnowledgeValidationEngine com 10 checks
  [ ] ConfidenceCheck com threshold mínimo configurável
  [ ] ConsistencyCheck comparando com corpus existente
  [ ] ContradictionCheck com peso por confidenceScore
  [ ] EvidenceCheck exigindo mínimo 1 evidência DIRECT
  [ ] Hard-fail em checks críticos (CONTRADICTION, EVIDENCE)
  [ ] Evento knowledge.validated publicado

KNOWLEDGE CONSOLIDATION
  [ ] KnowledgeConsolidationEngine com estratégias CREATED/UPDATED/MERGED
  [ ] ConflictResolution com 4 estratégias
  [ ] Versionamento semântico (MAJOR/MINOR/PATCH)
  [ ] Histórico preservado em toda atualização
  [ ] Evento knowledge.consolidated publicado

KNOWLEDGE EVOLUTION
  [ ] KnowledgeEvolutionEngine com EvolutionType em 6 tipos
  [ ] KnowledgeTimeline imutável e auditável
  [ ] KnowledgeDiff por versão
  [ ] Rollback funcional para qualquer versão anterior
  [ ] Deprecação automática de versões antigas
  [ ] Arquivamento após 180 dias sem uso
  [ ] Eventos knowledge.deprecated e knowledge.archived publicados

KNOWLEDGE PUBLISHING
  [ ] KnowledgePublishingEngine com 9 PublishingConsumers
  [ ] PUBLISHING_RULES para todos os KnowledgeTypes
  [ ] Publicação IMMEDIATE em paralelo via eventBus
  [ ] Publicação BATCH via queue para não-críticos
  [ ] Publicação bloqueada se qualityReport.pass = false
  [ ] Evento knowledge.published publicado por consumer

LEARNING FEEDBACK ENGINE
  [ ] LearningFeedbackEngine com 9 FeedbackSignals
  [ ] Ajuste automático de confidenceScore por sinal
  [ ] Multiplicador de peso por FeedbackSource
  [ ] Correções gerando novo ciclo de LearningPipeline
  [ ] HabitDetector reforçado por aprovações
  [ ] Evento feedback.received publicado

LEARNING QUALITY ENGINE
  [ ] LearningQualityEngine com 8 QualityDimensions
  [ ] Score mínimo configurável (padrão 0.60)
  [ ] Publicação bloqueada abaixo do threshold
  [ ] Recomendações automáticas de melhoria de qualidade

LEARNING MEMORY
  [ ] LearningMemory com LearningHistory persistente
  [ ] LearningTimeline por userId e domain
  [ ] LearningSnapshot por userId com stats completos
  [ ] Replay funcional de qualquer LearningOutput
  [ ] Retenção mínima de 1 ano
  [ ] Isolamento por tenant

EVENTOS (13 eventos)
  [ ] learning.started, learning.completed
  [ ] knowledge.extracted, knowledge.validated, knowledge.consolidated
  [ ] knowledge.evolved, knowledge.published
  [ ] pattern.detected, habit.learned, workflow.learned
  [ ] feedback.received
  [ ] knowledge.deprecated, knowledge.archived
  [ ] Idempotência garantida (learningId / knowledgeId como chave)

OBSERVABILIDADE
  [ ] learning_accuracy calculado rolling 30d
  [ ] knowledge_freshness calculado diariamente
  [ ] learning_pipeline_duration_ms instrumentado por etapa
  [ ] learning_roi_score calculado mensalmente
  [ ] Todos os alertas de KPI configurados
  [ ] Dashboard "Learning Engine Overview" criado

CONTRATOS
  [ ] KnowledgeItem com schema Zod
  [ ] LearningOutput com schema Zod
  [ ] LearningQualityReport com schema Zod
  [ ] PublishedKnowledge com schema Zod
  [ ] Backward compatibility garantida

COMPLIANCE
  [ ] PII removido antes da publicação de eventos
  [ ] Dados de usuário isolados por tenant
  [ ] LGPD: consentimento verificado antes de processar dados pessoais
  [ ] Audit trail completo via LearningTimeline
  [ ] Direito ao esquecimento: deleteUserKnowledge() implementado
  [ ] Retenção configurável por tipo de conhecimento

ESCALABILIDADE
  [ ] LearningPipeline stateless → escala horizontal
  [ ] KnowledgeExtractionEngine stateless → escala horizontal
  [ ] KnowledgeStore com sharding por userId
  [ ] PublishingEngine com queue Kafka para BATCH
  [ ] LearningMemory com replicação de leitura
```

---

# REVISÃO 15 — TABELA DE RESPONSABILIDADE

---

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│               TABELA DE RESPONSABILIDADE — LEARNING ENGINE — MDS v1.4                       │
├────────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Componente                 │ Especificação                                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ KnowledgeExtractionEngine  │ R: Transformar inputs brutos em KnowledgeItem[]                │
│                            │ E: LearningInput (execution, conversation, feedback, error...)  │
│                            │ S: KnowledgeItem[] (RAW)                                       │
│                            │ D: LLMProvider, ExecutionStore, ConversationStore              │
│                            │ P: knowledge.extracted                                          │
│                            │ C: —                                                            │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ PatternDetectionEngine     │ R: Detectar padrões recorrentes nos KnowledgeItems              │
│                            │ E: KnowledgeItem[], LearningInput                              │
│                            │ S: KnowledgeItem[] (enriquecidos), DetectedPattern[]           │
│                            │ D: KnowledgeStore (últimos 90 dias)                            │
│                            │ P: pattern.detected, habit.learned, workflow.learned           │
│                            │ C: knowledge.extracted                                          │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ KnowledgeValidationEngine  │ R: Garantir que apenas conhecimento confiável seja aprendido   │
│                            │ E: KnowledgeItem[], LearningInput                              │
│                            │ S: ValidatedKnowledge[] (VALIDATED ou REJECTED)                │
│                            │ D: KnowledgeStore (corpus existente)                           │
│                            │ P: knowledge.validated                                          │
│                            │ C: knowledge.extracted                                          │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ KnowledgeConsolidationEng. │ R: Mesclar, versionar, resolver conflitos                      │
│                            │ E: ValidatedKnowledge[], LearningInput                         │
│                            │ S: ConsolidatedKnowledge[] com version semver                  │
│                            │ D: KnowledgeStore (write)                                       │
│                            │ P: knowledge.consolidated                                       │
│                            │ C: knowledge.validated                                          │
│                            │ Escala: Serializado por (userId, domain) — distributed lock   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ KnowledgeEvolutionEngine   │ R: Evoluir, deprecar, arquivar, permitir rollback              │
│                            │ E: ConsolidatedKnowledge[], LearningInput                      │
│                            │ S: EvolvedKnowledge[] com timeline e diff                      │
│                            │ D: KnowledgeStore (histórico), EventBus                        │
│                            │ P: knowledge.evolved, knowledge.deprecated, knowledge.archived │
│                            │ C: knowledge.consolidated                                       │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ LearningQualityEngine      │ R: Avaliar qualidade do ciclo de aprendizado                   │
│                            │ E: EvolvedKnowledge[], DetectedPattern[], LearningInput        │
│                            │ S: LearningQualityReport (8 dimensões)                         │
│                            │ D: KnowledgeStore (corpus)                                      │
│                            │ P: —                                                            │
│                            │ C: knowledge.evolved                                            │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ KnowledgePublishingEngine  │ R: Distribuir conhecimento para os 9 consumidores               │
│                            │ E: EvolvedKnowledge[], LearningQualityReport                   │
│                            │ S: PublishedKnowledge[] com publishedTo[]                      │
│                            │ D: EventBus (immediate), Kafka (batch)                         │
│                            │ P: knowledge.published (por consumer)                           │
│                            │ C: knowledge.evolved                                            │
│                            │ Escala: Worker pool, horizontal                                 │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ LearningFeedbackEngine     │ R: Processar feedback humano e de sistemas                     │
│                            │ E: FeedbackInput                                                │
│                            │ S: Ajustes de confidenceScore + ciclo de aprendizado          │
│                            │ D: KnowledgeStore, LearningPipeline, HabitDetector            │
│                            │ P: feedback.received                                            │
│                            │ C: —                                                            │
│                            │ Escala: Stateless, horizontal                                   │
├────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ LearningMemory             │ R: Persistir e recuperar todo histórico de aprendizado         │
│                            │ E: LearningOutput, queries (history, timeline, snapshot)       │
│                            │ S: LearningHistoryEntry[], LearningTimeline, LearningSnapshot  │
│                            │ D: PostgreSQL (corpus), Redis (cache)                           │
│                            │ P: —                                                            │
│                            │ C: learning.completed                                           │
│                            │ Escala: Sharding por userId, read replicas                     │
└────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

# DECLARAÇÃO FINAL — MDS v1.4

---

Esta revisão estabelece a **arquitetura definitiva do Learning Engine** como o principal mecanismo de evolução contínua do MemoryOS.

Todo conhecimento aprendido possui agora:

| Atributo | Componente responsável |
|---|---|
| **Origem** | KnowledgeOrigin — fonte, usuário, org, timestamp |
| **Evidências** | KnowledgeEvidence — tipo (DIRECT/INFERRED/CONFIRMED), peso |
| **Versão** | KnowledgeConsolidationEngine — semver |
| **Contexto** | KnowledgeContext — horário, dia, região, modo |
| **Validação** | KnowledgeValidationEngine — 10 checks, hard-fail |
| **Histórico** | KnowledgeTimeline — imutável, auditável |
| **Score de Confiança** | LearningFeedbackEngine — ajustável por sinal |
| **Linha do Tempo** | LearningMemory — replay por learningId |
| **Capacidade de Evolução** | KnowledgeEvolutionEngine — EvolutionType |
| **Capacidade de Auditoria** | LearningTimeline + DecisionTrace |
| **Capacidade de Rollback** | KnowledgeEvolutionEngine.rollback() |

Todos os componentes permanecem **desacoplados, orientados a eventos, altamente escaláveis e compatíveis com MAS, MCF, MCIS, MGIS e todas as revisões anteriores do MDS**.

---

**MDS v1.4 — Learning Engine — Arquitetura Definitiva**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.3 · **Série:** MDS v1.0 → v1.1 → v1.2 → v1.3 → v1.4