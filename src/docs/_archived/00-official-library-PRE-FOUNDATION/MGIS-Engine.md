# MGIS-Engine — Goal Graph Engine, Registry, Lifecycle, Contexto e Memória

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 2 de 4 do MGIS

---

# CAPÍTULO 6 — GOAL LIFECYCLE

---

## 6.1 Estados Oficiais do Goal

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GOAL LIFECYCLE STATES                           │
└─────────────────────────────────────────────────────────────────────┘

           intent recebida
ABSENT ───────────────────────► CREATED
                                    │
                        understand() + decompose()
                                    │
                             ┌──────┴──────────┐
                             │                 │
                  clarification needed?    all clear?
                             │                 │
                      CLARIFYING          WAITING
                             │                 │
                  user responds         policy check
                             │                 │
                             └────────┬────────┘
                                      │
                               policy approved?
                               ┌──────┴──────┐
                               │             │
                           BLOCKED       PLANNING
                               │             │
                         policy resolves  buildGoalPlan()
                               │             │
                               └────────►APPROVED
                                             │
                                     user confirms
                                     (se necessário)
                                             │
                                        EXECUTING
                                             │
                          ┌──────────────────┼───────────────────┐
                          │                  │                   │
                      user pauses      all done           error occurs
                          │                  │                   │
                       PAUSED           COMPLETED            FAILED
                          │                  │                   │
                    user resumes       archiveAfter()       retryable?
                          │                  │            ┌──────┴──────┐
                          └──► EXECUTING   ARCHIVED      YES           NO
                                                          │             │
                                                      RECOVERING    CANCELLED
                                                          │
                                                      EXECUTING (retry)
```

## 6.2 Transições Válidas

| De | Para | Condição |
|---|---|---|
| ABSENT | CREATED | Intent recebida |
| CREATED | CLARIFYING | Ambiguidade detectada |
| CREATED | WAITING | Goal compreendido, aguarda Policy |
| CLARIFYING | WAITING | Usuário esclareceu |
| WAITING | BLOCKED | Policy Engine negou |
| WAITING | PLANNING | Policy Engine aprovou |
| BLOCKED | PLANNING | Restrição removida |
| PLANNING | APPROVED | GoalPlan gerado |
| APPROVED | EXECUTING | Usuário confirmou (ou autostart) |
| EXECUTING | PAUSED | Usuário pausou ou dependência bloqueou |
| EXECUTING | COMPLETED | Todos os objetivos atingidos |
| EXECUTING | FAILED | Falha não recuperável |
| PAUSED | EXECUTING | Retomada |
| FAILED | RECOVERING | Falha recuperável detectada |
| RECOVERING | EXECUTING | Recovery bem-sucedido |
| FAILED | CANCELLED | Falha irrecuperável ou usuário cancelou |
| COMPLETED | ARCHIVED | Após TTL ou explicitamente |

---

# CAPÍTULO 7 — GOAL CONTEXT

---

## 7.1 Como o Contexto Altera a Execução Mantendo o Mesmo Goal

O mesmo Goal pode resultar em Workflows completamente diferentes dependendo do contexto do usuário.

```
GOAL: "Enviar dinheiro para alguém"

┌────────────────────────────────────────────────────────────────┐
│             VARIAÇÕES PELO CONTEXTO                            │
├────────────────────────┬───────────────────────────────────────┤
│ Contexto               │ Resolução pelo MGIS                   │
├────────────────────────┼───────────────────────────────────────┤
│ Brasil + conta corrente│ PIX via Open Banking Connector        │
│ Brasil + crypto wallet │ Phantom/MetaMask → Blockchain         │
│ Viagem internacional   │ Remessa via Wise / Swift              │
│ Empresa → fornecedor   │ Transferência bancária com nota fiscal │
│ Emergência (urgente)   │ PIX instantâneo prioritário           │
│ Valor acima de limite  │ → Policy Engine → aprovação gerencial │
│ Menor de idade         │ → Policy Engine → BLOCKED             │
└────────────────────────┴───────────────────────────────────────┘
```

## 7.2 Interface de Contexto do Goal

```typescript
interface GoalContext {
  // Usuário
  userId: string;
  userProfile: {
    age?: number;
    country: string;
    language: string;
    timezone: string;
    plan: MemoryOSPlan;
    role: string;
    organizationId?: string;
    departmentId?: string;
  };

  // Localização e tempo
  location?: GeoLocation;
  localTime: string;
  isBusinessHours: boolean;
  urgencyLevel: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

  // Estado financeiro (se relevante)
  budgetContext?: {
    availableBudget: number;
    currency: string;
    dailyLimit?: number;
    monthlyLimit?: number;
  };

  // Estado tecnológico
  connectedServices: string[];    // Connectors já autenticados
  activeGoals: string[];          // Goals em execução simultânea

  // Memória aplicada
  recentGoals: GoalHistoryEntry[];
  preferences: UserGoalPreferences;
  knownEntities: KnownEntity[];   // João, Empresa X, Projeto Y — da memória

  // Org context
  approvalRequired: boolean;
  approvalChain?: ApprovalChain;
}
```

## 7.3 Contexto Enriquecido pela Memória

```
Usuário diz: "Envie o relatório para a equipe"

SEM memória contextual:
  → Ambíguo: Qual relatório? Qual equipe? Qual canal?
  → MGIS pede clarificação

COM memória contextual:
  → Memory Engine injeta:
     - "equipe" = [maria@..., joao@..., carlos@...] (contexto recente)
     - "relatório" = último relatório gerado (documento recente)
     - canal preferido = Gmail (histórico)
  → MGIS resolve automaticamente
  → Goal: SEND_EMAIL com relatório_vendas.pdf para 3 destinatários
  → Zero clarificação necessária
```

---

# CAPÍTULO 8 — GOAL MEMORY

---

## 8.1 Tipos de Memória de Goals

```typescript
interface GoalMemoryManager {
  // Goals ativos em execução
  getActive(userId: string): ActiveGoal[];

  // Goals concluídos recentemente
  getRecent(userId: string, days: number): CompletedGoal[];

  // Goals que se repetem periodicamente
  getRecurrent(userId: string): RecurrentGoalPattern[];

  // Goals que o usuário prefere resolver de determinada forma
  getPreferred(userId: string, domain: GoalDomain): PreferredGoalPattern[];

  // Goals aprendidos por observação
  getLearned(userId: string): LearnedGoalPattern[];

  // Goals compartilhados com equipe/organização
  getShared(organizationId: string): SharedGoal[];

  // Goals esquecidos (abandonados sem conclusão)
  getForgotten(userId: string): ForgottenGoal[];

  // Recuperar goal interrompido
  getInterrupted(userId: string): InterruptedGoal[];
}
```

## 8.2 Goal Memory — Fluxo de Aprendizado

```
Goal concluído com sucesso
       │
       ▼
GoalOutcome registrado:
  { goalId, success: true, duration, connectors, approach, userSatisfaction }
       │
       ▼
GoalMemoryManager.learn():
  1. Incrementar peso do approach utilizado
  2. Registrar padrão de contexto → approach
  3. Detectar se é recorrente (mesmo goal + mesmo contexto periódico)
  4. Atualizar PreferredGoalPattern
  5. Ajustar PredictionModel

Resultado:
  Próxima vez que o goal similar surgir:
  → MGIS reconhece padrão
  → Sugere o mesmo approach com alta confiança
  → Pode executar automaticamente (se autostart habilitado)
```

---

# CAPÍTULO 9 — GOAL PRIORITIZATION

---

## 9.1 Algoritmo de Priorização

```typescript
interface GoalPrioritizationEngine {
  prioritize(
    goals: Goal[],
    context: GoalContext
  ): PrioritizedGoal[];
}

// Cálculo do score de prioridade
function calculatePriorityScore(goal: Goal, context: GoalContext): number {
  const urgencyScore    = goal.urgency * 0.30;     // 30% do peso
  const impactScore     = goal.impact * 0.25;      // 25% do peso
  const timeScore       = timeConstraintScore(goal) * 0.20; // 20%
  const riskScore       = riskPenalty(goal) * 0.10;         // 10%
  const dependencyScore = dependencyBonus(goal) * 0.10;     // 10%
  const preferenceScore = userPreference(goal, context) * 0.05; // 5%

  return urgencyScore + impactScore + timeScore +
         riskScore + dependencyScore + preferenceScore;
}
```

## 9.2 Fatores de Priorização

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FATORES DE PRIORIZAÇÃO                            │
├─────────────────┬────────┬───────────────────────────────────────────┤
│ Fator           │ Peso   │ Descrição                                 │
├─────────────────┼────────┼───────────────────────────────────────────┤
│ Urgência        │ 30%    │ Deadline, SLA, impacto do atraso          │
│ Impacto         │ 25%    │ Magnitude do resultado positivo           │
│ Tempo           │ 20%    │ Janela de execução disponível             │
│ Risco           │ 10%    │ Consequência de não executar              │
│ Dependências    │ 10%    │ Outros goals aguardam este                │
│ Preferência     │ 5%     │ Histórico de preferência do usuário       │
└─────────────────┴────────┴───────────────────────────────────────────┘

Urgência — automaticamente elevada quando:
  - Deadline < 24h: +0.8
  - Envolvimento financeiro crítico: +0.6
  - Meta detectada como CRITICAL pelo usuário: +1.0
  - Background goal com trigger ativado: +0.7
  - Usuário está em viagem e precisa de info urgente: +0.5

Disponibilidade — considera:
  - Connectors necessários estão HEALTHY?
  - Horário comercial para ações que exigem atendimento humano?
  - Rate limits dos Connectors disponíveis?
```

---

# CAPÍTULO 10 — GOAL CONFLICT RESOLUTION

---

## 10.1 Tipos de Conflito

```typescript
type GoalConflictType =
  | "RESOURCE_CONFLICT"        // Dois goals competem pelo mesmo recurso (tempo, dinheiro)
  | "VALUE_CONFLICT"           // Goals com valores opostos
  | "TIME_CONFLICT"            // Goals que não cabem na mesma janela temporal
  | "PERMISSION_CONFLICT"      // Goal requer permissão que conflita com outra política
  | "BUDGET_CONFLICT"          // Soma dos custos excede orçamento
  | "CAPABILITY_CONFLICT"      // Connector necessário para A e B não suporta execução simultânea
  | "DATA_CONFLICT";           // Output de A invalida input esperado por B
```

## 10.2 Exemplos e Resoluções

```
CONFLITO 1: RESOURCE_CONFLICT — Orçamento

  Goal A: "Economizar dinheiro este mês"   (prioridade: 0.7)
  Goal B: "Comprar equipamento novo"        (prioridade: 0.4)
  Conflito: Budget insuficiente para ambos

  Resolução pelo MGIS:
    Estratégia: PRIORITY_WINS
    → Goal A tem maior prioridade
    → Goal B: status → WAITING(condição: budget_available)
    → MGIS propõe: "Parcelar o equipamento? Isso preservaria o goal de economia."
    → Usuário decide

─────────────────────────────────────────────────────────────

CONFLITO 2: TIME_CONFLICT — Agenda

  Goal A: "Dormir cedo às 22h"             (RECURRENT, alta preferência)
  Goal B: "Assistir série — episódio novo" (INSTANT, baixa prioridade)
  Conflito: Série termina às 01h

  Resolução pelo MGIS:
    Estratégia: SUGGEST_COMPROMISE
    → "São 21:40. A série dura ~1h20. Você dormirá às 01h.
       Isso entra em conflito com seu objetivo de dormir às 22h.
       Deseja: [Assistir mesmo assim] [Agendar para amanhã] [Assistir metade]"

─────────────────────────────────────────────────────────────

CONFLITO 3: PERMISSION_CONFLICT — Empresa

  Goal A: "Aprovar pagamento de R$85.000 a fornecedor"
  Policy: "Pagamentos acima de R$50.000 requerem aprovação do CFO"
  Conflito: Usuário não tem permissão suficiente

  Resolução pelo MGIS:
    Estratégia: ESCALATE
    → Goal A: status → BLOCKED
    → MGIS cria Goal Derivado: "Solicitar aprovação CFO para pagamento #XYZ"
    → GmailConnector envia pedido de aprovação ao CFO
    → Goal A retoma quando aprovação chega

─────────────────────────────────────────────────────────────

CONFLITO 4: VALUE_CONFLICT — Criança

  Goal: "Comprar cerveja artesanal premium"
  Context: userId → age: 16
  Policy: LGPD + Proteção ao Menor

  Resolução pelo MGIS:
    Estratégia: HARD_BLOCK
    → Goal: status → CANCELLED
    → MGIS: "Não é possível processar este objetivo."
    → Não pode ser desbloqueado pelo usuário
```

## 10.3 Interface de Resolução de Conflitos

```typescript
interface ConflictResolutionEngine {
  detect(goals: Goal[], context: GoalContext): GoalConflict[];
  resolve(
    conflict: GoalConflict,
    strategy: ConflictStrategy
  ): ConflictResolution;
  suggest(conflict: GoalConflict): ConflictSuggestion[];
}

type ConflictStrategy =
  | "PRIORITY_WINS"       // Goal de maior prioridade prossegue
  | "SUGGEST_COMPROMISE"  // Propor ao usuário uma solução intermediária
  | "DEFER_LOWER"         // Adiar o goal de menor prioridade
  | "ESCALATE"            // Elevar para aprovação humana
  | "SPLIT_BUDGET"        // Dividir recurso entre goals
  | "HARD_BLOCK";         // Bloquear permanentemente (compliance)
```

---

# CAPÍTULO 11 — GOAL REGISTRY

---

## 11.1 Estrutura do Goal Registry

```typescript
interface GoalRegistry {
  // Registro
  register(goal: GoalTemplate): void;
  registerAlias(goalId: string, alias: string, language: string): void;

  // Busca
  findByOntologyDomain(domain: GoalDomain): GoalTemplate[];
  findByNaturalLanguage(query: string): RankedGoalTemplate[];
  findEquivalents(goalId: string): GoalTemplate[];
  findByKeyword(keyword: string): GoalTemplate[];

  // Versionamento
  getVersion(goalId: string, version: string): GoalTemplate;
  getLatest(goalId: string): GoalTemplate;

  // Discovery
  discoverNew(context: GoalContext): GoalTemplate[];
}

interface GoalTemplate {
  templateId: string;
  name: string;
  domain: GoalDomain;
  complexity: GoalComplexity;
  horizon: GoalHorizon;

  // Aliases em múltiplos idiomas
  aliases: Record<string, string[]>;
  // Ex: { "pt-BR": ["viajar", "ir de férias"], "en-US": ["travel", "go on vacation"] }

  // Decomposição padrão
  defaultDecomposition: GoalDecompositionTemplate;

  // Connectors tipicamente usados (via MCIS)
  typicalDomains: OntologyDomain[];

  // Versão
  version: string;
  createdAt: string;
}
```

---

# CAPÍTULO 12 — GOAL METRICS

---

## 12.1 Métricas Oficiais

```typescript
interface GoalMetrics {
  goalId: string;
  userId: string;
  period: MetricsPeriod;

  // Tempo
  avgCompletionTimeMs: number;
  minCompletionTimeMs: number;
  maxCompletionTimeMs: number;
  p95CompletionTimeMs: number;

  // Sucesso
  completionRate: number;           // % concluídos com sucesso
  failureRate: number;
  cancellationRate: number;
  recoverySuccessRate: number;

  // Reutilização
  reuseCount: number;               // Quantas vezes este template foi usado
  automatedExecutionCount: number;  // Vezes executado sem intervenção humana

  // Valor gerado
  estimatedTimeSavedHours: number;
  estimatedCostSaved: number;

  // Impacto
  connectorCallsGenerated: number;
  workflowsTriggered: number;
  memoryUpdatesGenerated: number;

  // Aprendizado
  predictionAccuracy: number;       // % de predições corretas
  patternMatchRate: number;         // % resolvidos com padrão existente
}
```

---

# CAPÍTULO 13 — GOAL MARKETPLACE

---

## 13.1 Connectors Anunciam Goals, Não APIs

Esta é uma das principais inovações do MGIS sobre o MCIS:

```
ANTES (MCIS):
  Conector anuncia: "Tenho a action SEARCH_FLIGHTS que aceita
                    origin, destination, date, passengers..."

DEPOIS (MGIS + MCIS):
  Conector anuncia: "Posso resolver o Goal TRAVEL.SEARCH_FLIGHTS
                    no contexto de: turismo pessoal, viagem executiva,
                    reserva corporativa, emergência médica..."
                    
  E adicionalmente:
    "Quando o usuário quer 'viajar para [destino]', 
     posso contribuir com subgoals:
       - Pesquisa de voos
       - Verificação de disponibilidade
       - Bloqueio de assento"
```

## 13.2 Goal Marketplace — Interface

```typescript
interface GoalMarketplace {
  // Connectors anunciam os Goals que podem resolver
  announceGoalCapability(
    connectorId: string,
    goalCapability: GoalCapabilityAnnouncement
  ): void;

  // Core busca Connectors que resolvem um Goal
  findConnectorsForGoal(
    goalDomain: GoalDomain,
    subDomain?: string
  ): GoalCapabilityAnnouncement[];

  // Sugestão de novos Connectors ao usuário baseada em Goals não resolvidos
  suggestConnectors(
    unmetGoals: Goal[]
  ): ConnectorSuggestion[];
}

interface GoalCapabilityAnnouncement {
  connectorId: string;
  resolvedGoalDomains: GoalDomain[];
  resolvedGoalTemplates: string[];
  contextualConditions: ContextCondition[];
  // Ex: "Resolvo TRAVEL.SEARCH_FLIGHTS quando contexto é Sul-Americano"
}
```

---

**Documento Oficial:** MGIS-Engine  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 2 de 4 do MGIS