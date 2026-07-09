# MDS v1.3 — Capability Intelligence Layer — Especificação Completa

**Versão:** 1.3  
**Status:** Revisão Oficial — Adenda ao MDS v1.2  
**Data:** 2026-07-09  
**Tipo:** Inteligência de Decisão (complementa, não substitui)  
**Alinhamento:** MAS 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0 · MDS v1.1 · MDS v1.2

---

## Declaração de Revisão

Esta revisão transforma o Capability Negotiation Engine em um **mecanismo inteligente de tomada de decisão**, adicionando capacidades de avaliação, explicação, simulação, predição e recomendação automática.

**Não remove** nenhuma seção.  
**Não altera** nenhuma decisão existente.  
**Não modifica** MAS, MPS, MCF, MCIS, MGIS, MES, MDS v1.0/v1.1/v1.2.  
**Apenas complementa** com a Capability Intelligence Layer.

### Novos Componentes Introduzidos

| Componente | Responsabilidade |
|---|---|
| **CapabilityIntelligenceEngine** | Orquestrador central da inteligência |
| **MarketplaceIntelligence** | Reputação, maturidade e confiança de Connectors |
| **AICapabilityProfile** | Perfil de capacidade de modelos de IA |
| **NegotiationExplainabilityEngine** | Explicação auditável de toda decisão |
| **CapabilitySimulationEngine** | Simulação preditiva sem execução real |
| **CostPredictionEngine** | Previsão de custos e orçamento |
| **NegotiationMemory** | Histórico e replay de negociações |
| **DecisionConfidenceEngine** | Score de confiança de cada decisão |
| **CapabilityRecommendationEngine** | Recomendações automáticas de melhoria |

---

## Posicionamento na Arquitetura

```
ExecutionPlan (do Planner)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│              Capability Negotiation Engine                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CapabilityIntelligenceEngine (NOVO v1.3)     │  │  ← avalia antes do ranking
│  │  ├── MarketplaceIntelligence                         │  │
│  │  ├── AICapabilityProfile                             │  │
│  │  ├── CostPredictionEngine                            │  │
│  │  ├── CapabilitySimulationEngine                      │  │
│  │  └── DecisionConfidenceEngine                        │  │
│  └──────────────────────────────────────────────────────┘  │
│          │ IntelligenceReport                               │
│          ▼                                                  │
│  CapabilityRanking (MDS v1.2) — scores enriquecidos        │
│          │                                                  │
│          ▼                                                  │
│  CapabilitySelection (MDS v1.2)                            │
│          │                                                  │
│  ┌───────▼──────────────────────────────────────────────┐  │
│  │  NegotiationExplainabilityEngine (NOVO v1.3)         │  │  ← explica após seleção
│  └──────────────────────────────────────────────────────┘  │
│          │ DecisionReport                                   │
│          ▼                                                  │
│  NegotiationMemory (NOVO v1.3) — persiste                  │
│          │                                                  │
│          ▼                                                  │
│  CapabilityRecommendationEngine (NOVO v1.3) — sugere        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
  MCIS Runtime → ConnectorManager → ExecutionEngine
```

---

# REVISÃO 1 — CAPABILITY INTELLIGENCE ENGINE

---

## 1.1 Objetivo e Responsabilidades

O **CapabilityIntelligenceEngine** é o orquestrador central da Capability Intelligence Layer. Ele enriquece cada `CapabilityCandidate` com inteligência multidimensional antes do ranking, garantindo que a seleção final seja informada por histórico, contexto, reputação, risco e predição.

## 1.2 Interface Principal

```typescript
// packages/core/negotiation/intelligence/capability-intelligence-engine.ts

export interface ICapabilityIntelligenceEngine {
  enrich(
    candidates: CapabilityCandidate[],
    ctx:        IntelligenceContext
  ): Promise<IntelligenceReport>;
}

export interface IntelligenceContext {
  planId:      string;
  stepId:      string;
  userId:      string;
  orgId:       string;
  goalDomain:  string;
  goalId:      string;
  budgetCtx:   BudgetContext;
  userRegion:  string;
  sessionCtx:  SessionContext;
  historyCtx:  HistoryContext;
}

export interface IntelligenceReport {
  reportId:       string;
  planId:         string;
  stepId:         string;
  enriched:       EnrichedCandidate[];
  simulation:     SimulationReport;
  costPrediction: CostPredictionReport;
  confidence:     DecisionConfidence;
  recommendations: CapabilityRecommendation[];
  generatedAt:    string;
  durationMs:     number;
}

export interface EnrichedCandidate {
  connectorId:        string;
  baseScore:          CapabilityScore;          // score original (MDS v1.2)
  intelligenceScore:  IntelligenceScore;        // score adicionado por esta camada
  marketplaceProfile: MarketplaceProfile;
  aiProfile?:         AICapabilityProfile;      // apenas para connectors IA
  riskAssessment:     RiskAssessment;
  costEstimate:       CostEstimate;
  qualityScore:       number;                   // 0.0–1.0
  experienceScore:    number;                   // score baseado em experiência prévia do usuário
  reputationScore:    number;                   // score combinado de reputação
  finalIntelligenceScore: number;               // score final enriquecido (0.0–1.0)
}

export interface IntelligenceScore {
  history:     number;    // 0.0–1.0 — desempenho histórico deste usuário com este conector
  context:     number;    // 0.0–1.0 — adequação ao contexto atual
  behavior:    number;    // 0.0–1.0 — padrão comportamental observado
  learning:    number;    // 0.0–1.0 — bônus do Learning Engine
  reputation:  number;    // 0.0–1.0 — reputação no Marketplace
  risk:        number;    // 0.0–1.0 — inverso do risco (1 = sem risco)
  prediction:  number;    // 0.0–1.0 — probabilidade de sucesso prevista
  futureCost:  number;    // 0.0–1.0 — score de custo futuro (menor = melhor)
  quality:     number;    // 0.0–1.0 — qualidade de saída observada
  experience:  number;    // 0.0–1.0 — experiência acumulada do usuário com o conector
}
```

## 1.3 Implementação do Orquestrador

```typescript
@Injectable()
export class CapabilityIntelligenceEngine implements ICapabilityIntelligenceEngine {
  constructor(
    private readonly marketplace:  MarketplaceIntelligence,
    private readonly aiProfiler:   AICapabilityProfiler,
    private readonly simulation:   CapabilitySimulationEngine,
    private readonly costPred:     CostPredictionEngine,
    private readonly confidence:   DecisionConfidenceEngine,
    private readonly recommend:    CapabilityRecommendationEngine,
    private readonly memory:       NegotiationMemory,
    private readonly riskEngine:   CapabilityRiskEngine,
    private readonly eventBus:     UniversalEventBus,
    private readonly metrics:      IntelligenceMetrics,
  ) {}

  async enrich(
    candidates: CapabilityCandidate[],
    ctx:        IntelligenceContext
  ): Promise<IntelligenceReport> {
    const t0       = Date.now();
    const reportId = generateId("int");

    // 1. Enriquecer todos os candidatos em paralelo
    const enriched = await Promise.all(
      candidates.map(c => this.enrichCandidate(c, ctx))
    );

    // 2. Simular execução
    const simulation = await this.simulation.simulate(enriched, ctx);

    // 3. Prever custos
    const costPrediction = await this.costPred.predict(enriched, ctx);

    // 4. Calcular confiança da decisão
    const confidence = await this.confidence.calculate(enriched, simulation, ctx);

    // 5. Gerar recomendações
    const recommendations = await this.recommend.generate(enriched, simulation, costPrediction, ctx);

    // 6. Persistir no NegotiationMemory
    const report: IntelligenceReport = {
      reportId, planId: ctx.planId, stepId: ctx.stepId,
      enriched, simulation, costPrediction, confidence, recommendations,
      generatedAt: new Date().toISOString(), durationMs: Date.now() - t0,
    };

    await this.memory.storeIntelligenceReport(report);

    await this.eventBus.publish("capability.intelligence.completed", {
      reportId, planId: ctx.planId, stepId: ctx.stepId,
      candidateCount: candidates.length,
      confidence: confidence.score,
      topConnectorId: enriched.sort((a, b) =>
        b.finalIntelligenceScore - a.finalIntelligenceScore)[0]?.connectorId,
      durationMs: report.durationMs,
    });

    this.metrics.record(report);
    return report;
  }

  private async enrichCandidate(
    c:   CapabilityCandidate,
    ctx: IntelligenceContext
  ): Promise<EnrichedCandidate> {
    const [marketplace, risk, history, behavior] = await Promise.all([
      this.marketplace.getProfile(c.connectorId),
      this.riskEngine.assess(c, ctx),
      this.memory.getPersonalHistory(c.connectorId, ctx.userId),
      this.memory.getBehaviorPattern(c.connectorId, ctx.userId),
    ]);

    const aiProfile = c.isAIConnector
      ? await this.aiProfiler.getProfile(c.connectorId)
      : undefined;

    const costEstimate  = await this.costPred.estimateForCandidate(c, ctx);
    const qualityScore  = this.computeQualityScore(c, marketplace, history);
    const experienceScore = this.computeExperienceScore(history);

    const intelligenceScore: IntelligenceScore = {
      history:    history.successRate,
      context:    this.computeContextFit(c, ctx),
      behavior:   behavior.patternMatchScore,
      learning:   history.learningBonus,
      reputation: marketplace.trustScore,
      risk:       1 - risk.riskScore,
      prediction: risk.successProbability,
      futureCost: 1 - costEstimate.normalizedCost,
      quality:    qualityScore,
      experience: experienceScore,
    };

    const finalIntelligenceScore = this.computeFinalScore(intelligenceScore);

    return {
      connectorId: c.connectorId,
      baseScore:   c.score!,
      intelligenceScore,
      marketplaceProfile: marketplace,
      aiProfile,
      riskAssessment: risk,
      costEstimate,
      qualityScore,
      experienceScore,
      reputationScore: marketplace.trustScore,
      finalIntelligenceScore,
    };
  }

  private computeFinalScore(s: IntelligenceScore): number {
    // Pesos da intelligence layer — complementam os pesos de MDS v1.1
    return (
      s.history    * 0.20 +
      s.context    * 0.15 +
      s.behavior   * 0.10 +
      s.learning   * 0.10 +
      s.reputation * 0.15 +
      s.risk       * 0.15 +
      s.prediction * 0.10 +
      s.quality    * 0.05
    );
  }
}
```

## 1.4 RiskAssessment

```typescript
export interface RiskAssessment {
  connectorId:         string;
  riskScore:           number;         // 0.0 (sem risco) – 1.0 (alto risco)
  successProbability:  number;         // 0.0 – 1.0
  riskFactors:         RiskFactor[];
  riskLevel:           "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mitigations:         string[];
}

export interface RiskFactor {
  type:        RiskFactorType;
  severity:    number;                 // 0.0 – 1.0
  description: string;
  evidence:    string;
}

export type RiskFactorType =
  | "RECENT_INCIDENTS"
  | "HIGH_ERROR_RATE"
  | "CIRCUIT_OPEN_HISTORY"
  | "DEPRECATION_RISK"
  | "VENDOR_INSTABILITY"
  | "VERSION_EOL"
  | "SECURITY_ADVISORY"
  | "SLA_BREACHES"
  | "RATE_LIMIT_PROXIMITY"
  | "MAINTENANCE_SCHEDULED"
  | "GEO_INSTABILITY";

@Injectable()
export class CapabilityRiskEngine {
  async assess(c: CapabilityCandidate, ctx: IntelligenceContext): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];

    // Histórico de incidentes
    const incidents = await this.incidentStore.getRecent(c.connectorId, 30);
    if (incidents.length > 0) factors.push({
      type:     "RECENT_INCIDENTS",
      severity: Math.min(incidents.length * 0.1, 1.0),
      description: `${incidents.length} incidente(s) nos últimos 30 dias`,
      evidence: incidents.map(i => i.title).join("; "),
    });

    // Error rate elevada
    const health = await this.healthMonitor.get(c.connectorId);
    if (health.errorRatePercent > 5) factors.push({
      type:     "HIGH_ERROR_RATE",
      severity: Math.min(health.errorRatePercent / 100, 1.0),
      description: `Taxa de erro de ${health.errorRatePercent}%`,
      evidence: `p95: ${health.p95LatencyMs}ms`,
    });

    // Risco de deprecação
    const marketplace = await this.marketplace.getProfile(c.connectorId);
    if (marketplace.deprecationRisk > 0.5) factors.push({
      type:     "DEPRECATION_RISK",
      severity: marketplace.deprecationRisk,
      description: `Conector com risco de deprecação: ${(marketplace.deprecationRisk * 100).toFixed(0)}%`,
      evidence: `Última versão há ${marketplace.daysSinceLastRelease} dias`,
    });

    const riskScore = factors.reduce((acc, f) => acc + f.severity, 0) / Math.max(factors.length, 1);
    const riskLevel =
      riskScore >= 0.8 ? "CRITICAL" :
      riskScore >= 0.5 ? "HIGH" :
      riskScore >= 0.2 ? "MEDIUM" : "LOW";

    return {
      connectorId: c.connectorId,
      riskScore: Math.min(riskScore, 1.0),
      successProbability: 1 - riskScore,
      riskFactors: factors,
      riskLevel,
      mitigations: this.buildMitigations(factors),
    };
  }
}
```

---

# REVISÃO 2 — MARKETPLACE INTELLIGENCE

---

## 2.1 Interface e Modelo

```typescript
// packages/core/negotiation/intelligence/marketplace-intelligence.ts

export interface MarketplaceProfile {
  connectorId:           string;
  // Reputação
  reputationScore:       number;         // 0.0–1.0 (score composto)
  vendorReputation:      VendorReputation;
  communityRating:       number;         // 0.0–5.0 (estrelas)
  communityReviews:      number;         // total de avaliações
  communityAdoption:     CommunityAdoption;
  // Certificação e Confiança
  certificationLevel:    CertificationLevel;
  trustScore:            number;         // 0.0–1.0 (confiança geral)
  vendorSupportLevel:    SupportLevel;
  // Popularidade
  popularityScore:       number;         // 0.0–1.0
  enterpriseAdoption:    EnterpriseAdoption;
  // Segurança e Histórico
  securityIncidents:     SecurityIncidentSummary;
  securityAuditStatus:   "NONE" | "PENDING" | "PASSED" | "FAILED";
  // Risco e Maturidade
  deprecationRisk:       number;         // 0.0–1.0
  daysSinceLastRelease:  number;
  maintenanceFrequency:  "ACTIVE" | "OCCASIONAL" | "RARE" | "ABANDONED";
  releaseFrequency:      "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "IRREGULAR";
  connectorMaturity:     ConnectorMaturity;
  // Recomendação e Confiança de Marketplace
  marketplaceRecommendation: MarketplaceRecommendation;
  marketplaceConfidenceScore: number;    // 0.0–1.0
  // Metadados
  lastAuditedAt:         string;
  profileVersion:        string;
}

export enum CertificationLevel {
  NONE        = "NONE",
  COMMUNITY   = "COMMUNITY",
  VERIFIED    = "VERIFIED",
  CERTIFIED   = "CERTIFIED",
  ENTERPRISE  = "ENTERPRISE",
}

export enum ConnectorMaturity {
  EXPERIMENTAL = "EXPERIMENTAL",   // alfa/beta, não recomendado para produção
  EARLY        = "EARLY",          // estável mas jovem (<6 meses)
  GROWING      = "GROWING",        // 6–18 meses, adoção crescente
  MATURE       = "MATURE",         // >18 meses, estável, amplamente adotado
  LEGACY       = "LEGACY",         // estável mas sem evolução ativa
}

export interface VendorReputation {
  vendorId:          string;
  vendorName:        string;
  overallScore:      number;       // 0.0–1.0
  responseTime:      "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  issueResolution:   "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  releaseConsistency: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  enterpriseTrust:   number;       // 0.0–1.0 (baseado em contratos enterprise)
  publishedSince:    string;
  totalConnectors:   number;
  activeConnectors:  number;
}

export interface CommunityAdoption {
  activeInstalls:       number;
  monthlyActiveUsers:   number;
  growthRatePercent:    number;      // MoM
  churnRatePercent:     number;
  npsScore:             number;      // -100 a 100
  githubStars?:         number;
  openIssues?:          number;
  closedIssues?:        number;
}

export interface EnterpriseAdoption {
  enterpriseCustomers:  number;
  fortuneCustomers:     number;      // Fortune 500 usando o conector
  avgContractSizeUSD:   number;
  enterpriseNpsScore:   number;
  complianceFrameworks: string[];    // ["SOC2", "ISO27001", "HIPAA"]
}

export interface SecurityIncidentSummary {
  totalIncidents:         number;
  criticalIncidents:      number;
  last12MonthsIncidents:  number;
  avgResolutionDays:      number;
  lastIncidentDate?:      string;
  cveList:                string[];
}

export interface MarketplaceRecommendation {
  level:      "HIGHLY_RECOMMENDED" | "RECOMMENDED" | "NEUTRAL" | "CAUTION" | "NOT_RECOMMENDED";
  reason:     string;
  updatedAt:  string;
}

export enum SupportLevel {
  COMMUNITY   = "COMMUNITY",       // apenas fórum/GitHub
  EMAIL       = "EMAIL",           // suporte por email
  STANDARD    = "STANDARD",        // ticket system, SLA 48h
  PRIORITY    = "PRIORITY",        // ticket system, SLA 8h
  ENTERPRISE  = "ENTERPRISE",      // SLA 4h + TAM dedicado
}
```

## 2.2 MarketplaceIntelligence Service

```typescript
@Injectable()
export class MarketplaceIntelligence {
  private readonly cache = new Map<string, { profile: MarketplaceProfile; expiresAt: number }>();

  async getProfile(connectorId: string): Promise<MarketplaceProfile> {
    const cached = this.cache.get(connectorId);
    if (cached && cached.expiresAt > Date.now()) return cached.profile;

    const profile = await this.fetchProfile(connectorId);
    this.cache.set(connectorId, { profile, expiresAt: Date.now() + 30 * 60 * 1000 }); // 30min TTL

    await this.eventBus.publish("capability.marketplace.updated", {
      connectorId,
      trustScore:    profile.trustScore,
      reputationScore: profile.reputationScore,
      certificationLevel: profile.certificationLevel,
    });

    return profile;
  }

  private async fetchProfile(connectorId: string): Promise<MarketplaceProfile> {
    const [vendor, community, security, adoption, mcis] = await Promise.all([
      this.vendorStore.get(connectorId),
      this.communityStore.get(connectorId),
      this.securityStore.get(connectorId),
      this.adoptionStore.get(connectorId),
      this.mcisRegistry.getConnector(connectorId),
    ]);

    const reputationScore = this.computeReputationScore(vendor, community, security, adoption);
    const trustScore      = this.computeTrustScore(reputationScore, mcis.certificationLevel, security);
    const popularityScore = this.computePopularityScore(community, adoption);
    const deprecationRisk = this.computeDeprecationRisk(mcis, vendor);

    return {
      connectorId,
      reputationScore, trustScore, popularityScore, deprecationRisk,
      vendorReputation:   vendor,
      communityRating:    community.avgRating,
      communityReviews:   community.totalReviews,
      communityAdoption:  community.adoption,
      certificationLevel: mcis.certificationLevel,
      vendorSupportLevel: vendor.supportLevel,
      enterpriseAdoption: adoption.enterprise,
      securityIncidents:  security.summary,
      securityAuditStatus: security.auditStatus,
      daysSinceLastRelease: mcis.daysSinceLastRelease,
      maintenanceFrequency: this.classifyMaintenance(mcis),
      releaseFrequency:    this.classifyReleases(mcis),
      connectorMaturity:   this.classifyMaturity(mcis),
      marketplaceRecommendation: this.buildRecommendation(reputationScore, trustScore, security),
      marketplaceConfidenceScore: this.computeConfidenceScore(vendor, community, security),
      lastAuditedAt: new Date().toISOString(),
      profileVersion: "1.0",
    };
  }

  private computeReputationScore(vendor: any, community: any, security: any, adoption: any): number {
    return (
      (vendor.overallScore               * 0.30) +
      (community.normalizedRating        * 0.25) +
      ((1 - security.normalizedRisk)     * 0.25) +
      (adoption.normalizedAdoption       * 0.20)
    );
  }
}
```

---

# REVISÃO 3 — AI CAPABILITY PROFILE

---

## 3.1 Interface Oficial

```typescript
// packages/core/negotiation/intelligence/ai-capability-profile.ts

export interface AICapabilityProfile {
  connectorId:         string;
  modelId:             string;
  modelFamily:         string;                   // "gpt", "claude", "gemini", "llama"
  provider:            string;
  capabilityVersion:   string;
  // Scores de Capacidade (0.0–1.0)
  scores: {
    reasoning:         number;    // raciocínio lógico e matemático
    coding:            number;    // geração e análise de código
    planning:          number;    // decomposição de tarefas complexas
    toolUse:           number;    // uso de ferramentas e function calling
    vision:            number;    // análise de imagens
    voice:             number;    // processamento de áudio e voz
    audio:             number;    // geração e análise de áudio geral
    imageGeneration:   number;    // geração de imagens
    longContext:       number;    // capacidade de contexto longo
    memoryCompatibility: number;  // compatibilidade com MemoryOS MemoryEngine
    learningCompatibility: number; // compatibilidade com LearningEngine
    explainability:    number;    // capacidade de explicar raciocínio
    safetyScore:       number;    // alinhamento e safety
    complianceScore:   number;    // adequação a ambientes regulados
  };
  // Performance
  performance: {
    avgLatencyMs:       number;
    p95LatencyMs:       number;
    tokensPerSecond:    number;
    contextWindowTokens: number;
    maxOutputTokens:    number;
    reliabilityPercent: number;
    uptimePercent:      number;
  };
  // Custo
  pricing: {
    inputCostPer1kTokens:  number;   // USD
    outputCostPer1kTokens: number;
    batchDiscount:         number;   // 0.0–1.0
    currency:              "USD";
  };
  // Compatibilidade
  compatibility: {
    streamingSupported:    boolean;
    functionCallingV:      string;   // versão do function calling
    visionSupported:       boolean;
    audioSupported:        boolean;
    multimodalSupported:   boolean;
    languagesSupported:    string[];
    finetuningSupported:   boolean;
  };
  // Evolução
  evolution: {
    releaseDate:           string;
    lastUpdateDate:        string;
    nextVersionEta?:       string;
    deprecationDate?:      string;
    changelogUrl:          string;
    benchmarkHistory:      BenchmarkRecord[];
  };
  // Predição e Aprendizado
  predictionAccuracy:    number;    // 0.0–1.0 no contexto do MemoryOS
  learningImpact:        number;    // 0.0–1.0 — quanto contribui ao LearningEngine
  // Metadados
  profileUpdatedAt:      string;
}

export interface BenchmarkRecord {
  date:      string;
  benchmark: string;   // "MMLU", "HumanEval", "MATH", "GSM8K"
  score:     number;
  rank?:     number;
}
```

## 3.2 AICapabilityProfiler

```typescript
@Injectable()
export class AICapabilityProfiler {
  async getProfile(connectorId: string): Promise<AICapabilityProfile> {
    const cached = await this.cache.get(`ai:profile:${connectorId}`);
    if (cached) return cached;

    const profile = await this.buildProfile(connectorId);
    await this.cache.set(`ai:profile:${connectorId}`, profile, { ttl: 60 * 60 }); // 1h
    return profile;
  }

  // Selecionar melhor modelo para um domínio específico
  async selectBestForDomain(
    domain:     string,
    candidates: AICapabilityProfile[]
  ): Promise<AICapabilityProfile> {
    const domainWeights = DOMAIN_SCORE_WEIGHTS[domain] ?? DEFAULT_AI_WEIGHTS;

    return candidates
      .map(p => ({
        profile: p,
        score:   this.computeDomainScore(p, domainWeights),
      }))
      .sort((a, b) => b.score - a.score)[0].profile;
  }

  private computeDomainScore(
    profile:  AICapabilityProfile,
    weights:  AIScoreWeights
  ): number {
    const s = profile.scores;
    return (
      s.reasoning         * (weights.reasoning         ?? 0) +
      s.coding            * (weights.coding            ?? 0) +
      s.planning          * (weights.planning          ?? 0) +
      s.toolUse           * (weights.toolUse           ?? 0) +
      s.vision            * (weights.vision            ?? 0) +
      s.longContext       * (weights.longContext        ?? 0) +
      s.safetyScore       * (weights.safety            ?? 0) +
      s.complianceScore   * (weights.compliance        ?? 0) +
      s.memoryCompatibility * (weights.memoryCompat    ?? 0)
    );
  }
}

// Pesos por domínio
export const DOMAIN_SCORE_WEIGHTS: Record<string, AIScoreWeights> = {
  "ENTERPRISE.FINANCIAL": {
    reasoning: 0.30, planning: 0.20, toolUse: 0.15,
    compliance: 0.20, safety: 0.10, memoryCompat: 0.05,
  },
  "ENTERPRISE.LEGAL": {
    reasoning: 0.35, longContext: 0.20, compliance: 0.25,
    safety: 0.15, memoryCompat: 0.05,
  },
  "PERSONAL.PRODUCTIVITY": {
    planning: 0.30, toolUse: 0.30, memoryCompat: 0.20,
    reasoning: 0.10, safety: 0.10,
  },
  "CREATIVE.CONTENT": {
    coding: 0.10, vision: 0.30, imageGeneration: 0.30,
    reasoning: 0.20, safety: 0.10,
  },
};
```

---

# REVISÃO 4 — NEGOTIATION EXPLAINABILITY ENGINE

---

## 4.1 Interface Principal

```typescript
// packages/core/negotiation/intelligence/negotiation-explainability-engine.ts

export interface INegotiationExplainabilityEngine {
  explain(
    selection:    CapabilitySelectionResult,
    ranking:      RankedCapabilityList,
    intelligence: IntelligenceReport,
    ctx:          ExplainabilityContext
  ): Promise<DecisionReport>;
}

export interface DecisionReport {
  reportId:          string;
  selectionId:       string;
  planId:            string;
  stepId:            string;
  // Selecionado
  selected:          DecisionSummary;
  // Árvore de decisão
  decisionTree:      DecisionTree;
  // Candidatos rejeitados
  rejectedCandidates: RejectedCandidate[];
  // Explicações
  rankingExplanation:  string;
  policyExplanation:   string;
  costExplanation:     string;
  learningExplanation: string;
  riskExplanation:     string;
  // Confiança
  confidence:          DecisionConfidence;
  // Evidências
  evidence:            DecisionEvidence[];
  // Rastreabilidade
  trace:               DecisionTrace[];
  timeline:            DecisionTimeline;
  // Replay
  replayable:          boolean;
  replayPayload:       ReplayPayload;
  // Metadados
  generatedAt:         string;
  audienceLevel:       "TECHNICAL" | "BUSINESS" | "EXECUTIVE";
}

export interface DecisionTree {
  root:     DecisionNode;
  depth:    number;
  branches: number;
}

export interface DecisionNode {
  nodeId:    string;
  type:      "FILTER" | "SCORE" | "POLICY" | "STRATEGY" | "TIE_BREAK" | "FINAL";
  label:     string;
  rationale: string;
  result:    unknown;
  children:  DecisionNode[];
  durationMs: number;
}

export interface RejectedCandidate {
  connectorId:  string;
  connectorName: string;
  rank:         number;
  score:        number;
  rejectionReason: string;
  rejectionType:   "INELIGIBLE" | "OUTSCORED" | "POLICY_BLOCKED" | "BUDGET_EXCEEDED";
  scoreDifference: number;    // diferença de score em relação ao selecionado
  wouldHaveSucceeded: boolean; // simulação indica que teria funcionado?
}

export interface DecisionEvidence {
  source:      string;          // "health_monitor", "history", "marketplace", "policy"
  field:       string;
  value:       unknown;
  weight:      number;          // peso na decisão final
  impact:      "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  description: string;
}

export interface DecisionTrace {
  step:        number;
  component:   string;          // "EligibilityChecker", "CapabilityScorer", etc.
  action:      string;
  result:      string;
  durationMs:  number;
  timestamp:   string;
}

export interface DecisionTimeline {
  started:     string;
  steps: Array<{
    name:      string;
    startedAt: string;
    endedAt:   string;
    durationMs: number;
  }>;
  completed:   string;
  totalMs:     number;
}

export interface ReplayPayload {
  candidates:  CapabilityCandidate[];
  ctx:         NegotiationContext;
  intelligence: IntelligenceReport;
  schemaVersion: string;
}
```

## 4.2 Implementação

```typescript
@Injectable()
export class NegotiationExplainabilityEngine implements INegotiationExplainabilityEngine {
  async explain(
    selection:    CapabilitySelectionResult,
    ranking:      RankedCapabilityList,
    intelligence: IntelligenceReport,
    ctx:          ExplainabilityContext
  ): Promise<DecisionReport> {
    const tree     = this.buildDecisionTree(selection, ranking, intelligence);
    const rejected = this.buildRejectedList(ranking, selection, intelligence);
    const evidence = this.gatherEvidence(selection, intelligence);
    const trace    = this.buildTrace(intelligence, ranking, selection);
    const timeline = this.buildTimeline(trace);
    const confidence = intelligence.confidence;

    const report: DecisionReport = {
      reportId:   generateId("exp"),
      selectionId: selection.selectionId,
      planId:      ctx.planId,
      stepId:      ctx.stepId,
      selected: {
        connectorId:   selection.selected.connectorId,
        connectorName: selection.selected.connectorName,
        score:         selection.selected.score.total,
        strategy:      selection.strategy,
        rank:          selection.selected.rank,
      },
      decisionTree: tree,
      rejectedCandidates: rejected,
      rankingExplanation:  this.explainRanking(ranking, selection),
      policyExplanation:   this.explainPolicy(ranking, selection),
      costExplanation:     this.explainCost(intelligence, selection),
      learningExplanation: this.explainLearning(intelligence, selection),
      riskExplanation:     this.explainRisk(intelligence, selection),
      confidence,
      evidence,
      trace,
      timeline,
      replayable:    true,
      replayPayload: { candidates: ranking.ranked, ctx: ctx.negotiationCtx, intelligence, schemaVersion: "1.0" },
      generatedAt:   new Date().toISOString(),
      audienceLevel: ctx.audienceLevel ?? "TECHNICAL",
    };

    await this.eventBus.publish("capability.explained", {
      reportId:      report.reportId,
      selectionId:   selection.selectionId,
      connectorId:   selection.selected.connectorId,
      confidence:    confidence.score,
      rejectedCount: rejected.length,
    });

    return report;
  }

  private explainRanking(ranking: RankedCapabilityList, sel: CapabilitySelectionResult): string {
    const top = sel.selected;
    const second = ranking.ranked[1];
    if (!second) return `${top.connectorName} foi o único candidato elegível.`;
    const diff = ((top.score.total - second.score.total) * 100).toFixed(1);
    return `${top.connectorName} foi selecionado com score ${(top.score.total * 100).toFixed(1)}%, `
         + `${diff}pp acima do segundo colocado ${second.connectorName} `
         + `(${(second.score.total * 100).toFixed(1)}%).`;
  }
}
```

---

# REVISÃO 5 — CAPABILITY SIMULATION ENGINE

---

## 5.1 Interface e Modelos

```typescript
// packages/core/negotiation/intelligence/capability-simulation-engine.ts

export interface ICapabilitySimulationEngine {
  simulate(
    candidates:  EnrichedCandidate[],
    ctx:         IntelligenceContext
  ): Promise<SimulationReport>;
}

export interface SimulationReport {
  simulationId:     string;
  planId:           string;
  stepId:           string;
  simulations:      CandidateSimulation[];
  recommended:      string;           // connectorId recomendado pela simulação
  confidence:       number;           // 0.0–1.0
  alternativeCount: number;
  timeline:         SimulationTimeline;
  evidence:         string[];
  generatedAt:      string;
  durationMs:       number;
}

export interface CandidateSimulation {
  connectorId:        string;
  connectorName:      string;
  // Predições
  predictedCost:      number;         // créditos estimados
  predictedLatencyMs: number;
  predictedSuccess:   number;         // probabilidade 0.0–1.0
  predictedFailure:   number;         // probabilidade 0.0–1.0
  // Riscos
  predictedRisks:     PredictedRisk[];
  // Alternativas
  alternativeConnectors: AlternativeConnector[];
  // Score da simulação
  simulationScore:    number;         // 0.0–1.0
  simulationConfidence: number;       // 0.0–1.0
  // Evidências
  evidence:           string[];
}

export interface PredictedRisk {
  type:        string;
  probability: number;
  impact:      "LOW" | "MEDIUM" | "HIGH";
  mitigation:  string;
}

export interface AlternativeConnector {
  connectorId:      string;
  connectorName:    string;
  tradeoff:         string;    // "25% mais lento, 40% mais barato"
  recommendedIf:    string;    // "Se custo for prioridade"
  simulationScore:  number;
}

export interface SimulationTimeline {
  phases: Array<{
    phase:       string;
    connectorId: string;
    startMs:     number;
    endMs:       number;
    parallel:    boolean;
  }>;
  criticalPath:    string[];
  totalEstimatedMs: number;
}
```

## 5.2 Implementação

```typescript
@Injectable()
export class CapabilitySimulationEngine implements ICapabilitySimulationEngine {
  async simulate(candidates: EnrichedCandidate[], ctx: IntelligenceContext): Promise<SimulationReport> {
    const t0 = Date.now();

    const simulations = await Promise.all(
      candidates.map(c => this.simulateCandidate(c, ctx))
    );

    const ranked     = simulations.sort((a, b) => b.simulationScore - a.simulationScore);
    const recommended = ranked[0].connectorId;
    const confidence  = this.computeSimulationConfidence(ranked);

    const report: SimulationReport = {
      simulationId:     generateId("sim"),
      planId:           ctx.planId,
      stepId:           ctx.stepId,
      simulations:      ranked,
      recommended,
      confidence,
      alternativeCount: ranked.length - 1,
      timeline:         this.buildTimeline(ranked, ctx),
      evidence:         this.gatherEvidence(ranked),
      generatedAt:      new Date().toISOString(),
      durationMs:       Date.now() - t0,
    };

    await this.eventBus.publish("capability.simulated", {
      simulationId:  report.simulationId,
      planId:        ctx.planId,
      recommended,
      confidence,
      candidateCount: candidates.length,
    });

    return report;
  }

  private async simulateCandidate(c: EnrichedCandidate, ctx: IntelligenceContext): Promise<CandidateSimulation> {
    const history = await this.memory.getPersonalHistory(c.connectorId, ctx.userId);

    // Predição baseada em histórico pessoal (peso maior) + histórico global
    const predictedSuccess   = (history.successRate * 0.7) + ((1 - c.riskAssessment.riskScore) * 0.3);
    const predictedLatencyMs = this.predictLatency(c, history);
    const predictedCost      = c.costEstimate.estimatedCredits;

    return {
      connectorId:          c.connectorId,
      connectorName:        c.connectorId,         // resolvido pelo registry
      predictedCost,
      predictedLatencyMs,
      predictedSuccess:     Math.min(predictedSuccess, 0.99),
      predictedFailure:     1 - predictedSuccess,
      predictedRisks:       this.buildPredictedRisks(c),
      alternativeConnectors: [],                   // preenchido na etapa de recomendação
      simulationScore:      this.computeSimScore(predictedSuccess, predictedLatencyMs, predictedCost),
      simulationConfidence: this.computeCandidateConfidence(history, c),
      evidence:             this.buildEvidence(history, c),
    };
  }

  private predictLatency(c: EnrichedCandidate, history: PersonalHistory): number {
    // EMA: 60% histórico pessoal + 40% saúde atual
    const personalAvg = history.avgLatencyMs ?? c.baseScore.latencyScore * 5000;
    const currentP95  = c.marketplaceProfile.reputationScore * 1000;   // proxy
    return Math.round(personalAvg * 0.6 + currentP95 * 0.4);
  }
}
```

---

# REVISÃO 6 — COST PREDICTION ENGINE

---

## 6.1 Interface e Modelos

```typescript
// packages/core/negotiation/intelligence/cost-prediction-engine.ts

export interface ICostPredictionEngine {
  predict(candidates: EnrichedCandidate[], ctx: IntelligenceContext): Promise<CostPredictionReport>;
  estimateForCandidate(c: CapabilityCandidate, ctx: IntelligenceContext): Promise<CostEstimate>;
}

export interface CostPredictionReport {
  reportId:       string;
  planId:         string;
  candidates:     CostEstimate[];
  cheapest:       string;                // connectorId mais barato
  recommended:    string;                // melhor custo-benefício
  // Previsões de uso
  dailyForecast:  UsageForecast;
  monthlyForecast: UsageForecast;
  yearlyForecast: UsageForecast;
  // Orçamento
  budgetForecast: BudgetForecast;
  // Anomalias
  anomalies:      CostAnomaly[];
  // Otimização
  optimizations:  CostOptimizationSuggestion[];
  // Tendência
  trend:          "INCREASING" | "STABLE" | "DECREASING";
  trendPercent:   number;
  generatedAt:    string;
}

export interface CostEstimate {
  connectorId:     string;
  estimatedCredits: number;              // custo desta execução
  normalizedCost:  number;              // 0.0–1.0 (para scoring)
  breakdown: {
    apiCalls:      number;
    tokensCost?:   number;
    storageCost?:  number;
    transferCost?: number;
  };
  confidence:      number;              // 0.0–1.0
}

export interface UsageForecast {
  period:          "DAY" | "MONTH" | "YEAR";
  estimatedCalls:  number;
  estimatedCredits: number;
  estimatedUSD:    number;
  confidence:      number;
  basedOnDays:     number;             // janela de histórico usada
}

export interface BudgetForecast {
  currentBudget:     number;
  projectedMonthly:  number;
  projectedYearly:   number;
  burnRate:          number;           // créditos/dia
  daysUntilExhaustion?: number;        // null se indefinido
  status:            "SAFE" | "WATCH" | "WARNING" | "CRITICAL";
}

export interface CostAnomaly {
  connectorId:    string;
  type:           "SPIKE" | "DRIFT" | "UNDERUTILIZATION" | "OVERUSE";
  severity:       "LOW" | "MEDIUM" | "HIGH";
  description:    string;
  detectedAt:     string;
  recommendation: string;
}

export interface CostOptimizationSuggestion {
  type:            "SWITCH_CONNECTOR" | "BATCH_REQUESTS" | "CACHE_RESPONSES" | "REDUCE_FREQUENCY";
  description:     string;
  estimatedSaving: number;             // créditos/mês
  effort:          "LOW" | "MEDIUM" | "HIGH";
  priority:        "HIGH" | "MEDIUM" | "LOW";
}
```

## 6.2 Implementação

```typescript
@Injectable()
export class CostPredictionEngine implements ICostPredictionEngine {
  async predict(candidates: EnrichedCandidate[], ctx: IntelligenceContext): Promise<CostPredictionReport> {
    const estimates  = await Promise.all(candidates.map(c => this.estimateForCandidate(c, ctx)));
    const history    = await this.usageStore.getLast90Days(ctx.userId, ctx.orgId);
    const anomalies  = await this.detectAnomalies(estimates, history);
    const trend      = this.computeTrend(history);

    const cheapest    = [...estimates].sort((a, b) => a.estimatedCredits - b.estimatedCredits)[0];
    const recommended = this.selectBestValueConnector(estimates, candidates);

    await this.eventBus.publish("capability.predicted", {
      planId: ctx.planId, cheapestConnectorId: cheapest.connectorId,
      recommendedConnectorId: recommended,
      estimatedCreditRange: { min: cheapest.estimatedCredits, max: Math.max(...estimates.map(e => e.estimatedCredits)) },
    });

    return {
      reportId:        generateId("cst"),
      planId:          ctx.planId,
      candidates:      estimates,
      cheapest:        cheapest.connectorId,
      recommended,
      dailyForecast:   this.buildForecast("DAY",   history, ctx),
      monthlyForecast: this.buildForecast("MONTH", history, ctx),
      yearlyForecast:  this.buildForecast("YEAR",  history, ctx),
      budgetForecast:  this.buildBudgetForecast(history, ctx),
      anomalies,
      optimizations:   this.generateOptimizations(estimates, history, candidates),
      trend,
      trendPercent:    this.computeTrendPercent(history),
      generatedAt:     new Date().toISOString(),
    };
  }
}
```

---

# REVISÃO 7 — NEGOTIATION MEMORY

---

## 7.1 Interface e Modelos

```typescript
// packages/core/negotiation/intelligence/negotiation-memory.ts

export interface INegotiationMemory {
  storeIntelligenceReport(report: IntelligenceReport): Promise<void>;
  storeSelectionResult(result: CapabilitySelectionResult): Promise<void>;
  storeFallbackResult(stepId: string, level: FallbackLevel, success: boolean): Promise<void>;
  storeDecisionReport(report: DecisionReport): Promise<void>;

  getPersonalHistory(connectorId: string, userId: string): Promise<PersonalHistory>;
  getBehaviorPattern(connectorId: string, userId: string): Promise<BehaviorPattern>;
  getNegotiationHistory(userId: string, limit?: number): Promise<NegotiationHistoryEntry[]>;
  replay(selectionId: string): Promise<ReplayResult>;
  getSnapshot(planId: string): Promise<NegotiationSnapshot>;
  getDecisionEvolution(connectorId: string, userId: string): Promise<DecisionEvolution>;
}

export interface PersonalHistory {
  connectorId:      string;
  userId:           string;
  totalCalls:       number;
  successRate:      number;      // 0.0–1.0
  avgLatencyMs:     number;
  avgCostCredits:   number;
  lastUsedAt:       string;
  lastResultStatus: "SUCCESS" | "FAILURE" | "FALLBACK";
  learningBonus:    number;      // bônus acumulado do LearningEngine
  preferenceScore:  number;      // score de preferência implícita
  windowDays:       number;      // janela de cálculo
}

export interface BehaviorPattern {
  connectorId:       string;
  userId:            string;
  patternMatchScore: number;     // 0.0–1.0 — quão bem combina com padrão atual
  frequencyRank:     number;     // 1 = mais usado
  typicalContexts:   string[];   // domínios onde foi bem-sucedido
  typicalHours:      number[];   // horas do dia de uso (0–23)
  typicalDaysOfWeek: number[];   // dias da semana (0=Dom)
  coUsedConnectors:  string[];   // conectores frequentemente usados junto
}

export interface NegotiationHistoryEntry {
  negotiationId:  string;
  planId:         string;
  stepId:         string;
  selectedConnector: string;
  strategy:       SelectionStrategy;
  score:          number;
  fallbackUsed:   boolean;
  fallbackLevel?: FallbackLevel;
  success:        boolean;
  durationMs:     number;
  createdAt:      string;
}

export interface NegotiationSnapshot {
  snapshotId:     string;
  planId:         string;
  capturedAt:     string;
  rankings:       RankedCapabilityList[];
  selections:     CapabilitySelectionResult[];
  intelligence:   IntelligenceReport[];
  decisions:      DecisionReport[];
  totalDurationMs: number;
}

export interface DecisionEvolution {
  connectorId:  string;
  userId:       string;
  history:      Array<{
    date:        string;
    scoreTotal:  number;
    wasSelected: boolean;
    wasSuccess?: boolean;
    rank:        number;
  }>;
  trend:         "IMPROVING" | "STABLE" | "DECLINING";
  trendPercent:  number;
}
```

---

# REVISÃO 8 — DECISION CONFIDENCE ENGINE

---

## 8.1 Interface e Implementação

```typescript
// packages/core/negotiation/intelligence/decision-confidence-engine.ts

export interface DecisionConfidence {
  score:       number;          // 0.0–1.0
  level:       ConfidenceLevel;
  evidence:    ConfidenceEvidence[];
  calculation: ConfidenceCalculation;
  threshold:   number;         // threshold configurado para este contexto
  meetsThreshold: boolean;
  evolution:   ConfidenceEvolution;
}

export enum ConfidenceLevel {
  VERY_HIGH = "VERY_HIGH",   // ≥ 0.90 — decidir automaticamente
  HIGH      = "HIGH",        // ≥ 0.75 — decidir automaticamente com log
  MEDIUM    = "MEDIUM",      // ≥ 0.55 — decidir com aviso ao usuário
  LOW       = "LOW",         // ≥ 0.35 — sugerir ao usuário antes de decidir
  VERY_LOW  = "VERY_LOW",    // < 0.35 — solicitar intervenção humana
}

export interface ConfidenceCalculation {
  components: Array<{
    name:        string;
    value:       number;      // 0.0–1.0
    weight:      number;
    contribution: number;     // value * weight
    description: string;
  }>;
  formula:     string;        // descrição da fórmula em texto
  rawScore:    number;
  adjustments: Array<{ reason: string; delta: number }>;
  finalScore:  number;
}

export interface ConfidenceEvidence {
  type:        string;
  source:      string;
  value:       unknown;
  impact:      "INCREASES" | "DECREASES" | "NEUTRAL";
  magnitude:   number;    // 0.0–1.0
  description: string;
}

export interface ConfidenceEvolution {
  history: Array<{ date: string; score: number; level: ConfidenceLevel }>;
  trend:   "IMPROVING" | "STABLE" | "DECLINING";
  streak:  number;        // dias consecutivos acima do threshold
}

@Injectable()
export class DecisionConfidenceEngine {
  async calculate(
    enriched:   EnrichedCandidate[],
    simulation: SimulationReport,
    ctx:        IntelligenceContext
  ): Promise<DecisionConfidence> {
    const top = enriched.sort((a, b) => b.finalIntelligenceScore - a.finalIntelligenceScore)[0];
    const second = enriched[1];

    const components = [
      {
        name:   "Score Gap",
        value:  second ? Math.min((top.finalIntelligenceScore - second.finalIntelligenceScore) * 5, 1.0) : 1.0,
        weight: 0.25,
        description: "Distância entre o 1º e 2º colocado — maior gap = mais confiante",
      },
      {
        name:   "Simulation Success",
        value:  simulation.simulations.find(s => s.connectorId === top.connectorId)?.predictedSuccess ?? 0.5,
        weight: 0.25,
        description: "Probabilidade de sucesso simulada",
      },
      {
        name:   "History Richness",
        value:  Math.min((await this.memory.getPersonalHistory(top.connectorId, ctx.userId)).totalCalls / 100, 1.0),
        weight: 0.20,
        description: "Volume de histórico pessoal disponível",
      },
      {
        name:   "Risk Inverse",
        value:  1 - top.riskAssessment.riskScore,
        weight: 0.20,
        description: "Inverso do risco avaliado",
      },
      {
        name:   "Marketplace Confidence",
        value:  top.marketplaceProfile.marketplaceConfidenceScore,
        weight: 0.10,
        description: "Confiança do Marketplace no conector",
      },
    ];

    const rawScore = components.reduce((acc, c) => acc + c.value * c.weight, 0);
    const adjustments = this.computeAdjustments(top, ctx);
    const finalScore  = Math.min(Math.max(rawScore + adjustments.reduce((a, adj) => a + adj.delta, 0), 0), 1);
    const level       = this.deriveLevel(finalScore);
    const threshold   = this.resolveThreshold(ctx);

    await this.eventBus.publish("capability.confidence.calculated", {
      planId: ctx.planId, stepId: ctx.stepId,
      score: finalScore, level, meetsThreshold: finalScore >= threshold,
      connectorId: top.connectorId,
    });

    return {
      score:          finalScore,
      level,
      evidence:       this.gatherEvidence(top, simulation, components),
      calculation: {
        components: components.map(c => ({ ...c, contribution: c.value * c.weight })),
        formula:    "Σ(value × weight) + adjustments",
        rawScore,
        adjustments,
        finalScore,
      },
      threshold,
      meetsThreshold: finalScore >= threshold,
      evolution:      await this.memory.getConfidenceEvolution(ctx.userId, top.connectorId),
    };
  }

  private deriveLevel(score: number): ConfidenceLevel {
    if (score >= 0.90) return ConfidenceLevel.VERY_HIGH;
    if (score >= 0.75) return ConfidenceLevel.HIGH;
    if (score >= 0.55) return ConfidenceLevel.MEDIUM;
    if (score >= 0.35) return ConfidenceLevel.LOW;
    return ConfidenceLevel.VERY_LOW;
  }
}
```

---

# REVISÃO 9 — CAPABILITY RECOMMENDATION ENGINE

---

## 9.1 Interface e Modelos

```typescript
// packages/core/negotiation/intelligence/capability-recommendation-engine.ts

export interface ICapabilityRecommendationEngine {
  generate(
    enriched:    EnrichedCandidate[],
    simulation:  SimulationReport,
    cost:        CostPredictionReport,
    ctx:         IntelligenceContext
  ): Promise<CapabilityRecommendation[]>;
}

export interface CapabilityRecommendation {
  recommendationId: string;
  type:             RecommendationType;
  priority:         "HIGH" | "MEDIUM" | "LOW";
  title:            string;
  description:      string;
  rationale:        string;
  estimatedImpact:  RecommendationImpact;
  actionable:       boolean;
  action?:          RecommendationAction;
  confidence:       number;
  expiresAt?:       string;
}

export type RecommendationType =
  | "CONNECTOR_SWITCH"
  | "CAPABILITY_UPGRADE"
  | "MARKETPLACE_CONNECTOR"
  | "COST_REDUCTION"
  | "LATENCY_IMPROVEMENT"
  | "POLICY_RELAXATION"
  | "LEARNING_OPPORTUNITY"
  | "PERFORMANCE_TUNING"
  | "SECURITY_IMPROVEMENT"
  | "ENTERPRISE_UPGRADE";

export interface RecommendationImpact {
  costSavingCredits?:    number;
  latencyReductionMs?:   number;
  reliabilityGain?:      number;   // percentual
  securityImprovement?:  string;
  summary:               string;
}

export interface RecommendationAction {
  type:     "SWITCH_TO" | "UPGRADE_PLAN" | "ENABLE_FEATURE" | "CONTACT_SUPPORT";
  targetId?: string;
  label:    string;
  deepLink?: string;
}
```

## 9.2 Implementação

```typescript
@Injectable()
export class CapabilityRecommendationEngine implements ICapabilityRecommendationEngine {
  async generate(
    enriched:   EnrichedCandidate[],
    simulation: SimulationReport,
    cost:       CostPredictionReport,
    ctx:        IntelligenceContext
  ): Promise<CapabilityRecommendation[]> {
    const recs: CapabilityRecommendation[] = [];

    // R1: Conector mais barato disponível
    if (cost.cheapest !== cost.recommended) {
      const cheaper = enriched.find(e => e.connectorId === cost.cheapest);
      const curr    = enriched.find(e => e.connectorId === cost.recommended);
      if (cheaper && curr) {
        const saving = curr.costEstimate.estimatedCredits - cheaper.costEstimate.estimatedCredits;
        if (saving > 0) recs.push({
          recommendationId: generateId("rec"),
          type:       "COST_REDUCTION",
          priority:   saving > 100 ? "HIGH" : "MEDIUM",
          title:      `Economize ${saving} créditos usando ${cheaper.connectorId}`,
          description: `${cheaper.connectorId} entrega o mesmo resultado ${saving} créditos mais barato neste contexto.`,
          rationale:   `Simulação indica ${(simulation.simulations.find(s => s.connectorId === cheaper.connectorId)?.predictedSuccess ?? 0) * 100}% de sucesso.`,
          estimatedImpact: { costSavingCredits: saving, summary: `${saving} créditos por execução` },
          actionable:  true,
          action:      { type: "SWITCH_TO", targetId: cheaper.connectorId, label: `Usar ${cheaper.connectorId}` },
          confidence:  0.85,
        });
      }
    }

    // R2: Conector mais rápido disponível
    const fastest = enriched.sort((a, b) =>
      a.baseScore.latencyScore - b.baseScore.latencyScore)[0];
    const selected = enriched.sort((a, b) =>
      b.finalIntelligenceScore - a.finalIntelligenceScore)[0];
    if (fastest.connectorId !== selected.connectorId) {
      const latDiff = selected.baseScore.latencyScore - fastest.baseScore.latencyScore;
      if (latDiff > 0.1) recs.push({
        recommendationId: generateId("rec"),
        type:       "LATENCY_IMPROVEMENT",
        priority:   "LOW",
        title:      `${fastest.connectorId} oferece menor latência`,
        description: `Se latência for crítica, ${fastest.connectorId} é 10%+ mais rápido.`,
        rationale:   "Baseado em health metrics e histórico de p95.",
        estimatedImpact: { latencyReductionMs: Math.round(latDiff * 5000), summary: "Redução estimada de latência" },
        actionable:  true,
        action:      { type: "SWITCH_TO", targetId: fastest.connectorId, label: `Usar ${fastest.connectorId}` },
        confidence:  0.75,
      });
    }

    // R3: Conector com melhor reputação no Marketplace
    const bestRep = enriched.sort((a, b) => b.reputationScore - a.reputationScore)[0];
    if (bestRep.connectorId !== selected.connectorId && bestRep.reputationScore > selected.reputationScore + 0.15) {
      recs.push({
        recommendationId: generateId("rec"),
        type:       "MARKETPLACE_CONNECTOR",
        priority:   "MEDIUM",
        title:      `${bestRep.connectorId} tem reputação ${((bestRep.reputationScore - selected.reputationScore) * 100).toFixed(0)}% maior`,
        description: `Considere ${bestRep.connectorId} para ganhar confiabilidade a longo prazo.`,
        rationale:   `Score de reputação: ${(bestRep.reputationScore * 100).toFixed(0)} vs ${(selected.reputationScore * 100).toFixed(0)}.`,
        estimatedImpact: { reliabilityGain: (bestRep.reputationScore - selected.reputationScore) * 100, summary: "Ganho de reputação" },
        actionable:  true,
        action:      { type: "SWITCH_TO", targetId: bestRep.connectorId, label: `Explorar ${bestRep.connectorId}` },
        confidence:  0.70,
      });
    }

    // R4: Alto risco detectado
    const highRisk = enriched.filter(e => e.riskAssessment.riskLevel === "HIGH" || e.riskAssessment.riskLevel === "CRITICAL");
    if (highRisk.some(e => e.connectorId === selected.connectorId)) {
      recs.push({
        recommendationId: generateId("rec"),
        type:       "SECURITY_IMPROVEMENT",
        priority:   "HIGH",
        title:      `Conector selecionado possui risco ${selected.riskAssessment.riskLevel}`,
        description: selected.riskAssessment.riskFactors.map(f => f.description).join(". "),
        rationale:   "Risk Engine identificou fatores de risco relevantes.",
        estimatedImpact: { summary: "Redução de risco operacional" },
        actionable:  false,
        confidence:  0.90,
      });
    }

    await this.eventBus.publish("capability.recommended", {
      planId: ctx.planId, stepId: ctx.stepId,
      recommendationCount: recs.length,
      types: recs.map(r => r.type),
    });

    return recs.sort((a, b) => {
      const p = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return p[b.priority] - p[a.priority];
    });
  }
}
```

---

# REVISÃO 10 — EVENTOS OFICIAIS

---

```typescript
// packages/shared/events/capability-intelligence-events.ts

/**
 * capability.intelligence.completed
 * Producer: CapabilityIntelligenceEngine
 * Consumer:  CapabilityRankingService (enriquece scores), AuditLogger, ObservabilityCollector
 * Retry:     não (observabilidade)
 * Idempotência: reportId como chave
 */
export interface CapabilityIntelligenceCompletedEvent {
  reportId:         string;
  planId:           string;
  stepId:           string;
  candidateCount:   number;
  topConnectorId:   string;
  confidence:       number;
  durationMs:       number;
  completedAt:      string;
}

/**
 * capability.reputation.updated
 * Producer: MarketplaceIntelligence
 * Consumer:  CapabilityIntelligenceEngine (invalida cache), LearningEngine
 * Retry:     sim (idempotente por connectorId + updatedAt)
 * Idempotência: connectorId + updatedAt
 */
export interface CapabilityReputationUpdatedEvent {
  connectorId:       string;
  trustScore:        number;
  reputationScore:   number;
  certificationLevel: string;
  updatedAt:         string;
}

/**
 * capability.simulated
 * Producer: CapabilitySimulationEngine
 * Consumer:  NegotiationExplainabilityEngine, ObservabilityCollector
 * Retry:     não
 * Idempotência: simulationId como chave
 */
export interface CapabilitySimulatedEvent {
  simulationId:    string;
  planId:          string;
  recommendedConnectorId: string;
  confidence:      number;
  candidateCount:  number;
  simulatedAt:     string;
}

/**
 * capability.predicted
 * Producer: CostPredictionEngine
 * Consumer:  GoalValidationEngine (verifica budget), LearningEngine
 * Retry:     sim
 * Idempotência: planId + stepId + predictedAt
 */
export interface CapabilityPredictedEvent {
  planId:                  string;
  cheapestConnectorId:     string;
  recommendedConnectorId:  string;
  estimatedCreditRange: {
    min: number;
    max: number;
  };
  predictedAt:             string;
}

/**
 * capability.explained
 * Producer: NegotiationExplainabilityEngine
 * Consumer:  AuditLogger, NegotiationMemory, NotificationEngine (se low confidence)
 * Retry:     não
 * Idempotência: reportId como chave
 */
export interface CapabilityExplainedEvent {
  reportId:      string;
  selectionId:   string;
  connectorId:   string;
  confidence:    number;
  rejectedCount: number;
  explainedAt:   string;
}

/**
 * capability.confidence.calculated
 * Producer: DecisionConfidenceEngine
 * Consumer:  CapabilitySelectionService (pode solicitar revisão humana se LOW/VERY_LOW),
 *            LearningEngine, ObservabilityCollector
 * Retry:     não
 * Idempotência: planId + stepId + calculatedAt
 */
export interface CapabilityConfidenceCalculatedEvent {
  planId:           string;
  stepId:           string;
  connectorId:      string;
  score:            number;
  level:            ConfidenceLevel;
  meetsThreshold:   boolean;
  calculatedAt:     string;
}

/**
 * capability.recommended
 * Producer: CapabilityRecommendationEngine
 * Consumer:  NotificationEngine (mostra ao usuário), LearningEngine (registra aceitação)
 * Retry:     sim
 * Idempotência: planId + stepId + recommendedAt
 */
export interface CapabilityRecommendedEvent {
  planId:               string;
  stepId:               string;
  recommendationCount:  number;
  types:                RecommendationType[];
  recommendedAt:        string;
}

/**
 * capability.marketplace.updated
 * Producer: MarketplaceIntelligence
 * Consumer:  CapabilityIntelligenceEngine (invalida cache), ConnectorRegistry
 * Retry:     sim (idempotente por connectorId + updatedAt)
 * Idempotência: connectorId + updatedAt
 */
export interface CapabilityMarketplaceUpdatedEvent {
  connectorId:        string;
  trustScore:         number;
  reputationScore:    number;
  certificationLevel: string;
  updatedAt:          string;
}
```

---

# REVISÃO 11 — OBSERVABILIDADE

---

```typescript
// packages/infra/observability/capability-intelligence-metrics.ts

export function setupIntelligenceMetrics(meter: Meter) {
  return {
    // ─── DECISION QUALITY ─────────────────────────────────────────────────
    decisionQualityScore: meter.createObservableGauge("cint_decision_quality_score", {
      description: "Qualidade retrospectiva das decisões (0–1) — calculada após execução",
    }),
    confidenceScore: meter.createHistogram("cint_confidence_score", {
      description: "Score de confiança por decisão (0–1)",
      boundaries:  [0.1, 0.2, 0.35, 0.55, 0.75, 0.90, 1.0],
    }),
    lowConfidenceTotal: meter.createCounter("cint_low_confidence_decisions_total", {
      description: "Decisões com confiança LOW ou VERY_LOW",
    }),

    // ─── PREDICTION ACCURACY ──────────────────────────────────────────────
    predictionAccuracy: meter.createObservableGauge("cint_prediction_accuracy", {
      description: "% de predições corretas (sucesso previsto = sucesso real) — rolling 7d",
    }),
    costPredictionAccuracy: meter.createObservableGauge("cint_cost_prediction_accuracy", {
      description: "% de previsões de custo dentro de ±20% do real — rolling 7d",
    }),
    latencyPredictionAccuracy: meter.createObservableGauge("cint_latency_prediction_accuracy", {
      description: "% de predições de latência dentro de ±30% do real — rolling 7d",
    }),

    // ─── SIMULATION ───────────────────────────────────────────────────────
    simulationAccuracy: meter.createObservableGauge("cint_simulation_accuracy", {
      description: "% de simulações cujo resultado previsto casou com o real — rolling 7d",
    }),
    simulationDuration: meter.createHistogram("cint_simulation_duration_ms", {
      description: "Tempo de execução do CapabilitySimulationEngine",
      unit: "ms", boundaries: [5, 10, 25, 50, 100, 250, 500],
    }),

    // ─── MARKETPLACE ──────────────────────────────────────────────────────
    marketplaceConfidence: meter.createObservableGauge("cint_marketplace_confidence", {
      description: "Score de confiança médio do Marketplace por conector",
    }),  // Labels: connector_id
    vendorReputationScore: meter.createObservableGauge("cint_vendor_reputation_score", {
      description: "Score de reputação do vendor por conector",
    }),  // Labels: connector_id, vendor_id
    deprecationRiskGauge: meter.createObservableGauge("cint_deprecation_risk", {
      description: "Risco de deprecação por conector (0–1)",
    }),  // Labels: connector_id

    // ─── RECOMMENDATION ───────────────────────────────────────────────────
    recommendationAccuracy: meter.createObservableGauge("cint_recommendation_accuracy", {
      description: "% de recomendações aceitas pelo usuário — rolling 30d",
    }),
    recommendationsGenerated: meter.createCounter("cint_recommendations_generated_total", {
      description: "Total de recomendações geradas por tipo",
    }),  // Labels: type
    recommendationsAccepted: meter.createCounter("cint_recommendations_accepted_total", {
      description: "Total de recomendações aceitas",
    }),  // Labels: type

    // ─── LEARNING IMPACT ──────────────────────────────────────────────────
    learningImpact: meter.createObservableGauge("cint_learning_impact", {
      description: "Quanto o LearningEngine melhorou a qualidade das decisões (delta score)",
    }),
    intelligenceDuration: meter.createHistogram("cint_intelligence_engine_duration_ms", {
      description: "Tempo total do CapabilityIntelligenceEngine por step",
      unit: "ms", boundaries: [10, 25, 50, 100, 250, 500, 1000],
    }),
  };
}
```

## 11.1 KPIs de Intelligence

| KPI | Meta | Warning | Critical |
|---|---|---|---|
| Decision Quality Score | > 0.85 | < 0.75 | < 0.60 |
| Prediction Accuracy | > 80% | < 70% | < 55% |
| Cost Prediction Accuracy | > 75% | < 60% | < 45% |
| Simulation Accuracy | > 70% | < 60% | < 45% |
| Recommendation Accuracy | > 65% | < 50% | < 35% |
| Low Confidence Rate | < 5% | > 10% | > 20% |
| Intelligence Engine P95 | < 250ms | > 500ms | > 1000ms |
| Marketplace Confidence | > 0.75 | < 0.60 | < 0.45 |

---

# REVISÃO 12 — CHECKLIST OFICIAL

---

```
CHECKLIST OFICIAL — CAPABILITY INTELLIGENCE LAYER — MDS v1.3
═══════════════════════════════════════════════════════════════════════════════

CAPABILITY INTELLIGENCE ENGINE
  [ ] CapabilityIntelligenceEngine implementado e testado
  [ ] IntelligenceReport gerado com todos os campos obrigatórios
  [ ] EnrichedCandidate com IntelligenceScore (10 dimensões)
  [ ] CapabilityRiskEngine com 11 RiskFactorTypes
  [ ] finalIntelligenceScore combinando base + intelligence scores
  [ ] Integração com CapabilityRanking (MDS v1.2) para enriquecimento de scores

MARKETPLACE INTELLIGENCE
  [ ] MarketplaceProfile com todos os campos documentados
  [ ] VendorReputation com responseTime e issueResolution
  [ ] CommunityAdoption com NPS, growth e churn
  [ ] EnterpriseAdoption com Fortune500 e frameworks de compliance
  [ ] SecurityIncidentSummary com CVE list
  [ ] DeprecationRisk calculado (maintenanceFrequency + daysSinceLastRelease)
  [ ] MarketplaceRecommendation em 5 níveis
  [ ] Cache de 30 minutos por conector
  [ ] Evento capability.marketplace.updated publicado

AI CAPABILITY PROFILE
  [ ] AICapabilityProfile com 14 scores de capacidade
  [ ] Performance (latency, tokens/s, context window)
  [ ] Pricing com inputCost e outputCost por 1k tokens
  [ ] Compatibility (streaming, function calling, vision, audio)
  [ ] BenchmarkHistory com MMLU, HumanEval, MATH, GSM8K
  [ ] DOMAIN_SCORE_WEIGHTS para 4+ domínios
  [ ] Cache de 1 hora por conector

SIMULATION ENGINE
  [ ] CapabilitySimulationEngine produzindo SimulationReport
  [ ] CandidateSimulation com predictedSuccess, cost e latency
  [ ] PredictedRisk com probability e mitigation
  [ ] AlternativeConnectors com tradeoff description
  [ ] SimulationTimeline com criticalPath
  [ ] Evento capability.simulated publicado
  [ ] Simulação não executa Connectors reais

COST PREDICTION ENGINE
  [ ] CostPredictionReport com cheapest e recommended
  [ ] UsageForecast para DAY, MONTH e YEAR
  [ ] BudgetForecast com daysUntilExhaustion
  [ ] CostAnomaly detection (SPIKE, DRIFT, UNDERUTILIZATION, OVERUSE)
  [ ] CostOptimizationSuggestion com estimatedSaving
  [ ] Evento capability.predicted publicado

EXPLAINABILITY ENGINE
  [ ] DecisionReport com todos os campos documentados
  [ ] DecisionTree com nós FILTER, SCORE, POLICY, STRATEGY, TIE_BREAK, FINAL
  [ ] RejectedCandidate com rejectionType e scoreDifference
  [ ] rankingExplanation em linguagem natural
  [ ] DecisionTrace com passo-a-passo auditável
  [ ] DecisionTimeline com duração por fase
  [ ] ReplayPayload preservado para replay futuro
  [ ] audienceLevel suportando TECHNICAL, BUSINESS, EXECUTIVE
  [ ] Evento capability.explained publicado

NEGOTIATION MEMORY
  [ ] PersonalHistory por (connectorId, userId) com janela configurável
  [ ] BehaviorPattern com typicalContexts, hours e days
  [ ] NegotiationSnapshot por planId
  [ ] DecisionEvolution com trend e history
  [ ] Replay funcional via replayPayload
  [ ] Retenção mínima de 90 dias
  [ ] Isolamento por tenant (orgId)

DECISION CONFIDENCE ENGINE
  [ ] DecisionConfidence com 5 ConfidenceLevels
  [ ] ConfidenceCalculation com 5 components e weights
  [ ] ConfidenceEvolution com histórico e trend
  [ ] VERY_LOW confidence dispara revisão humana automática
  [ ] Threshold configurável por contexto
  [ ] Evento capability.confidence.calculated publicado

RECOMMENDATION ENGINE
  [ ] 10 RecommendationTypes implementados
  [ ] RecommendationImpact com estimativas quantitativas
  [ ] RecommendationAction com deepLink quando aplicável
  [ ] Priorização HIGH > MEDIUM > LOW
  [ ] Expiração de recomendações configurável
  [ ] Evento capability.recommended publicado
  [ ] Tracking de aceitação para recommendation accuracy

EVENTOS
  [ ] capability.intelligence.completed — producer e consumer definidos
  [ ] capability.reputation.updated — idempotência por connectorId + updatedAt
  [ ] capability.simulated — payload com confidence
  [ ] capability.predicted — payload com estimatedCreditRange
  [ ] capability.explained — payload com rejectedCount
  [ ] capability.confidence.calculated — payload com meetsThreshold
  [ ] capability.recommended — payload com types[]
  [ ] capability.marketplace.updated — consumer invalida cache

OBSERVABILIDADE
  [ ] cint_decision_quality_score instrumentado e calculado retrospectivamente
  [ ] cint_confidence_score histograma ativo
  [ ] cint_prediction_accuracy calculado rolling 7d
  [ ] cint_simulation_accuracy calculado rolling 7d
  [ ] cint_recommendation_accuracy calculado rolling 30d
  [ ] cint_marketplace_confidence por connector_id
  [ ] cint_intelligence_engine_duration_ms instrumentado
  [ ] Alertas configurados para todos os KPIs críticos
  [ ] Dashboard "Capability Intelligence Overview" criado

CONTRATOS E SCHEMAS
  [ ] IntelligenceReport com schema Zod
  [ ] MarketplaceProfile com schema Zod
  [ ] AICapabilityProfile com schema Zod
  [ ] DecisionReport com schema Zod
  [ ] SimulationReport com schema Zod
  [ ] CostPredictionReport com schema Zod
  [ ] DecisionConfidence com schema Zod
  [ ] Backward compatibility garantida (campos opcionais para novos atributos)

COMPLIANCE
  [ ] Audit trail de toda explicação via DecisionReport
  [ ] PII ausente dos payloads de eventos
  [ ] Dados de intelligence anonymizados por tenant
  [ ] ReplayPayload não contém credentials de Connectors
  [ ] Retenção de logs mínima de 90 dias
  [ ] LGPD: dados pessoais em PersonalHistory com consentimento
```

---

# DECLARAÇÃO FINAL — MDS v1.3

---

Esta revisão transforma o **Capability Negotiation Engine** em um **mecanismo inteligente de tomada de decisão** com capacidade plena de:

| Capacidade | Componente |
|---|---|
| **Avaliar** | CapabilityIntelligenceEngine — 10 dimensões de inteligência |
| **Comparar** | MarketplaceIntelligence — reputação, maturidade, confiança |
| **Explicar** | NegotiationExplainabilityEngine — DecisionTree + Trace + Replay |
| **Prever** | CostPredictionEngine — custo, latência, sucesso |
| **Simular** | CapabilitySimulationEngine — sem execução real |
| **Recomendar** | CapabilityRecommendationEngine — 10 tipos de otimização |
| **Aprender** | NegotiationMemory + PersonalHistory + BehaviorPattern |
| **Evoluir** | DecisionConfidenceEngine + ConfidenceEvolution |

Todos os componentes permanecem **desacoplados, orientados a eventos, compatíveis com MAS, MCF, MCIS, MGIS, MDS v1.1 e MDS v1.2**.

---

**MDS v1.3 — Capability Intelligence Layer**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.2 · **Série:** MDS v1.0 → v1.1 → v1.2 → v1.3