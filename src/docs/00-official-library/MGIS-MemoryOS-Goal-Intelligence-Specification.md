# MemoryOS Goal Intelligence Specification (MGIS)

**Versão:** 1.0  
**Status:** Oficial  
**Tipo:** Documento Arquitetural — Goal Intelligence  
**Posição na Biblioteca:** MV → MPS → MAS → MES → MCF → MCIS → **MGIS** → MDS  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MCF 1.0 · MCIS 1.0  
**Referência Cruzada:** MGIS-Engine · MGIS-Lifecycle · MGIS-Flows

---

## Declaração de Propósito

Este documento define a **camada de compreensão de objetivos** do MemoryOS.

O MGIS é posicionado entre o Intent Understanding e o Planner. Ele recebe intenções humanas brutas e as transforma em objetivos estruturados, decompostos, hierarquizados, contextualizados e priorizados — prontos para serem planejados e executados.

O MGIS **não executa**. Não escolhe Connectors. Não chama APIs.  
Ele apenas compreende e estrutura objetivos.

> **Princípio Central:** O usuário descreve um objetivo. O MemoryOS compreende a intenção. O **MGIS estrutura o objetivo**. O Planner cria o plano. O MCIS descobre as capacidades. Os Connectors executam. A Memória aprende continuamente.

---

## Posição Oficial no Pipeline (MAS §5 — expandido)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PIPELINE OFICIAL MEMORYOS                        │
│                      (MAS + MGIS atualizado)                        │
└─────────────────────────────────────────────────────────────────────┘

  Usuário
    │  "Quero viajar para Londres"
    ▼
  Intent Understanding
    │  intent: TRAVEL | confidence: 0.97
    ▼
  ██ GOAL INTELLIGENCE (MGIS) ██
    │  → decompõe em subgoals
    │  → aplica contexto e memória
    │  → prioriza e hierarquiza
    │  → resolve conflitos
    │  → entrega GoalPlan estruturado
    ▼
  Planner
    │  → transforma GoalPlan em ExecutionPlan
    ▼
  MCIS (Connector Intelligence)
    │  → descobre capacidades para cada step
    ▼
  Connector Manager
    │  → seleciona os Connectors adequados
    ▼
  Execution Engine
    │  → executa os steps
    ▼
  Connectors
    │  → chamam sistemas externos
    ▼
  Memory Engine
    │  → aprende com o resultado
    ▼
  Resposta ao Usuário
```

---

## Índice do MGIS

- **MGIS** (este arquivo) — Filosofia, Definições, Goal Graph, Decomposição, Hierarquia
- **MGIS-Engine** — Goal Graph Engine, Registry, Lifecycle, Contexto, Memória, Priorização
- **MGIS-Lifecycle** — Conflito, Aprendizado, Predição, Composição, Discovery, Ontologia, Métricas
- **MGIS-Flows** — Integrações, Casos Reais, UML, C4, Sequências, Exemplos Completos

---

# CAPÍTULO 1 — FILOSOFIA

---

## 1.1 O MemoryOS Recebe Objetivos, Não Comandos

A distinção fundamental do MemoryOS em relação a assistentes tradicionais é que ele nunca interpreta o usuário como alguém emitindo um **comando técnico**. Ele sempre interpreta como alguém expressando um **objetivo humano**.

```
ASSISTENTE TRADICIONAL:
  "Pesquise passagens para Londres"
   → executa: buscar passagens
   → retorna lista de voos
   → FIM

MEMORYOS + MGIS:
  "Quero viajar para Londres"
   → compreende: objetivo complexo de viagem internacional
   → decompõe automaticamente:
       ✈️  Pesquisar voos (Sabre, Amadeus, Galileo)
       🏨  Pesquisar hotéis
       🔒  Consultar seguro viagem
       ☁️  Consultar clima em Londres
       💱  Consultar câmbio BRL/GBP
       📋  Verificar validade do passaporte
       🛂  Verificar requisitos de visto
       💰  Consultar orçamento disponível
       📅  Verificar calendário e férias disponíveis
       💉  Verificar requisitos sanitários
   → prioriza por urgência e dependências
   → entrega GoalPlan completo ao Planner
```

### 1.2 Princípio da Intencionalidade Expansiva

Um objetivo humano sempre possui **dimensões implícitas** que o usuário não verbalizou mas que o MemoryOS deve compreender automaticamente.

```
"Organize minha empresa"
   → não significa: reorganizar uma pasta
   → significa: objetivo multi-domínio de longo prazo

   DIMENSÕES IMPLÍCITAS detectadas pelo MGIS:
   ├── Financeiro: fluxo de caixa, contas, impostos
   ├── RH: contratos, folha, benefícios
   ├── Jurídico: compliance, contratos, LGPD
   ├── Compras: fornecedores, pedidos
   ├── Fiscal: NF-e, obrigações acessórias
   ├── Marketing: presença digital, campanhas
   ├── Estoque: inventário, reposição
   ├── CRM: clientes, relacionamento
   ├── ERP: integração sistêmica
   └── Vendas: pipeline, metas
```

### 1.3 O MGIS Não Decide Como — Apenas Estrutura O Quê

Separação de responsabilidades (MAS §3.1 aplicado ao MGIS):

```
MGIS responde: "O QUÊ precisa ser alcançado?"
Planner responde: "COMO será organizada a execução?"
MCIS responde: "QUAIS capacidades serão usadas?"
Connectors respondem: "QUEM executa na prática?"
```

---

# CAPÍTULO 2 — DEFINIÇÕES OFICIAIS

---

## 2.1 Hierarquia Conceitual Oficial

```
┌─────────────────────────────────────────────────────────────────────┐
│               HIERARQUIA CONCEITUAL MGIS                           │
│                 (do mais abstrato ao mais concreto)                 │
└─────────────────────────────────────────────────────────────────────┘

  MISSION          Propósito de vida ou estratégico de longo prazo
    │              Ex: "Construir patrimônio financeiro sólido"
    ▼
  GOAL             Objetivo concreto derivado de uma Mission
    │              Ex: "Investir em ativos de renda fixa"
    ▼
  OBJECTIVE        Resultado específico e mensurável de um Goal
    │              Ex: "Aplicar R$5.000 em Tesouro Direto em 30 dias"
    ▼
  WORKFLOW         Sequência estruturada de Tasks para atingir um Objective
    │              Ex: [Verificar saldo] → [Escolher título] → [Aplicar]
    ▼
  TASK             Unidade de trabalho atômica e delimitada
    │              Ex: "Verificar saldo na conta corrente"
    ▼
  ACTION           Operação específica em um sistema externo
    │              Ex: "Consultar extrato bancário via Open Banking"
    ▼
  OPERATION        Chamada técnica atômica a um Connector
    │              Ex: OpenBankingConnector.GET_BALANCE({ account })
    ▼
  CAPABILITY       Capacidade declarada por um Connector (MCIS)
    │              Ex: "READ_BALANCE" declarada no CapabilityRegistry
    ▼
  EXECUTION        Resultado da chamada ao sistema externo
                   Ex: { balance: 12400.00, currency: "BRL" }
```

## 2.2 Definições Formais

```typescript
// INTENT — A expressão bruta do usuário antes da compreensão
interface Intent {
  intentId: string;
  rawText: string;           // Ex: "quero viajar pra londres"
  detectedLanguage: string;
  confidence: number;        // 0.0 a 1.0
  ambiguous: boolean;
  clarificationNeeded: boolean;
  detectedAt: string;
}

// GOAL — Objetivo estruturado produzido pelo MGIS
interface Goal {
  goalId: string;
  intentId: string;          // Origem
  title: string;             // Ex: "Viagem a Londres"
  description: string;
  ontologyDomain: GoalDomain;
  complexity: GoalComplexity; // INSTANT | SIMPLE | MODERATE | COMPLEX | EPIC
  horizon: GoalHorizon;       // INSTANT | SHORT | MEDIUM | LONG | PERMANENT
  subGoals: Goal[];
  objectives: Objective[];
  context: GoalContext;
  priority: GoalPriority;
  state: GoalState;
  constraints: GoalConstraint[];
  dependencies: GoalDependency[];
  memoryContext: GoalMemoryContext;
  createdAt: string;
  targetDate?: string;
}

// OBJECTIVE — Resultado mensurável de um Goal
interface Objective {
  objectiveId: string;
  goalId: string;
  description: string;
  measurable: boolean;
  successCriteria: string[];
  workflows: string[];       // IDs dos Workflows no WorkflowRegistry (MCIS)
  estimatedDuration: string;
}

// MISSION — Propósito estratégico de longo prazo
interface Mission {
  missionId: string;
  userId: string;
  title: string;
  description: string;
  domain: GoalDomain;
  horizon: "LIFETIME" | "DECADE" | "MULTI_YEAR";
  derivedGoals: string[];    // IDs de Goals derivados desta Mission
  active: boolean;
}

// TASK — Unidade atômica de trabalho
interface Task {
  taskId: string;
  workflowId: string;
  action: string;            // Action do MCIS ActionRegistry
  connectorId?: string;      // Resolvido pelo MCIS
  inputMapping: DataMapping;
  outputMapping: DataMapping;
  optional: boolean;
  estimatedMs: number;
}
```

---

# CAPÍTULO 3 — GOAL GRAPH

---

## 3.1 Modelo Oficial do Goal Graph

O Goal Graph representa as relações de derivação, dependência, composição e equivalência entre objetivos.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GOAL GRAPH                                   │
└─────────────────────────────────────────────────────────────────────┘

Nós = Goals / Objectives / Tasks
Arestas:
  ──DECOMPOSES──►   Goal pai → subGoals
  ──REQUIRES──►     A só pode começar após B concluir
  ──ENABLES──►      Completar A habilita B
  ──CONFLICTS──►    A e B são mutuamente excludentes
  ──EQUIVALENT──►   A e B atingem o mesmo resultado por caminhos diferentes
  ──RECURRENT──►    A é recorrência periódica de B
  ──DERIVED──►      A foi derivado automaticamente de B pelo MGIS

Exemplo: "Comprar um carro"

  COMPRAR_CARRO (Goal)
        │ DECOMPOSES
        ├──► PESQUISAR_VEICULOS
        │         │ ENABLES
        │         └──► COMPARAR_PRECOS
        │                   │ ENABLES
        │                   └──► NEGOCIAR_PRECO
        │
        ├──► CONSULTAR_FINANCIAMENTO
        │         │ REQUIRES (COMPARAR_PRECOS)
        │         └──► SIMULAR_PARCELAS
        │
        ├──► CONSULTAR_SEGURO
        │         │ REQUIRES (PESQUISAR_VEICULOS)
        │         └──► COMPARAR_APOLICES
        │
        ├──► CONSULTAR_DOCUMENTACAO
        │         │ ENABLES
        │         └──► TRANSFERIR_PROPRIEDADE
        │
        └──► EXECUTAR_COMPRA
                  │ REQUIRES (NEGOCIAR_PRECO + SIMULAR_PARCELAS + COMPARAR_APOLICES)
                  └──► REGISTRAR_VEICULO
```

## 3.2 Interface do Goal Graph Engine

```typescript
interface GoalGraphEngine {
  // Construção
  addGoal(goal: Goal): void;
  addEdge(from: string, to: string, relation: GoalRelation, weight?: number): void;
  removeGoal(goalId: string): void;

  // Navegação
  getSubGoals(goalId: string): Goal[];
  getParent(goalId: string): Goal | null;
  getDependencies(goalId: string): GoalDependency[];
  getBlockedGoals(goalId: string): Goal[];

  // Descoberta
  findPath(fromGoal: string, toGoal: string): GoalPath[];
  findEquivalents(goalId: string): Goal[];
  discoverHiddenGoals(goal: Goal, context: GoalContext): Goal[];

  // Análise
  detectConflicts(goals: Goal[]): GoalConflict[];
  detectCircularDependencies(): CircularGoalDependency[];
  estimateComplexity(goal: Goal): ComplexityEstimate;
  criticalPath(goal: Goal): CriticalPathResult;
}
```

---

# CAPÍTULO 4 — GOAL DECOMPOSITION

---

## 4.1 Algoritmo Oficial de Decomposição

```
ALGORITMO: DecomposeGoal(goal, context, memory)

INPUT:
  goal    — Goal raiz (pode ser vago e complexo)
  context — Contexto atual do usuário (perfil, projetos, etc.)
  memory  — Memória do usuário (histórico, preferências, decisões)

OUTPUT:
  GoalDecompositionResult — Árvore de subgoals estruturados

PASSOS:

1. CLASSIFY(goal)
   → Identificar domínio ontológico (GoalDomain)
   → Identificar complexidade (INSTANT | SIMPLE | MODERATE | COMPLEX | EPIC)
   → Identificar horizonte temporal

2. EXPAND(goal, domain)
   → Consultar GoalOntology para dimensões implícitas do domínio
   → Gerar candidatos a subgoals via ontologia
   → Filtrar candidatos por relevância ao contexto

3. ENRICH(subgoals, memory)
   → Aplicar memória: quais subgoals o usuário já resolveu antes?
   → Aplicar preferências: quais Connectors prefere?
   → Aplicar restrições: budget, tempo, permissões

4. PRIORITIZE(subgoals)
   → Aplicar algoritmo de priorização (ver Capítulo 9)
   → Detectar dependências entre subgoals
   → Ordenar por: urgência + impacto + dependências

5. VALIDATE(decomposition)
   → Verificar completude: todos os aspectos do goal foram cobertos?
   → Verificar conflitos (ver Capítulo 10)
   → Verificar viabilidade: MCIS tem capacidades para todos os subgoals?

6. RETURN GoalDecompositionResult
```

## 4.2 Exemplo — "Organize minha empresa"

```
INPUT: "Organize minha empresa"
  domain: ENTERPRISE
  complexity: EPIC
  horizon: LONG

DECOMPOSIÇÃO GERADA:

  ORGANIZAR_EMPRESA (Goal Raiz — EPIC)
  │
  ├── DOMÍNIO FINANCEIRO (Goal — COMPLEX)
  │   ├── Estruturar fluxo de caixa (MODERATE)
  │   ├── Automatizar contas a pagar (MODERATE) → BlingConnector
  │   ├── Automatizar contas a receber (MODERATE) → BlingConnector
  │   └── Configurar planejamento tributário (COMPLEX) → Specialist Fiscal
  │
  ├── DOMÍNIO RH (Goal — MODERATE)
  │   ├── Digitalizar contratos (SIMPLE)
  │   ├── Configurar folha de pagamento (MODERATE) → TOTVSConnector
  │   └── Implementar controle de ponto (SIMPLE) → ZebraConnector
  │
  ├── DOMÍNIO JURÍDICO (Goal — MODERATE)
  │   ├── Verificar compliance regulatório (MODERATE) → Specialist Jurídico
  │   ├── Auditar contratos com fornecedores (SIMPLE)
  │   └── Implementar política LGPD (MODERATE)
  │
  ├── DOMÍNIO COMERCIAL (Goal — COMPLEX)
  │   ├── Configurar CRM (MODERATE) → Connectors CRM
  │   ├── Integrar marketplace (SIMPLE) → ShopifyConnector / MLConnector
  │   └── Automatizar pipeline de vendas (COMPLEX)
  │
  └── DOMÍNIO TECNOLÓGICO (Goal — MODERATE)
      ├── Integrar sistemas via ERP (COMPLEX) → TOTVSConnector
      ├── Configurar integrações automáticas (MODERATE) → MCIS
      └── Implementar analytics (SIMPLE) → GoogleAnalyticsConnector
```

---

# CAPÍTULO 5 — GOAL HIERARCHY

---

## 5.1 Tipos Oficiais de Goal por Horizonte

```typescript
type GoalHorizon =
  | "INSTANT"     // < 1 minuto — "Que horas são em Londres?"
  | "SHORT"       // Minutos a horas — "Enviar relatório hoje"
  | "MEDIUM"      // Dias a semanas — "Preparar apresentação para reunião na sexta"
  | "LONG"        // Meses a anos — "Lançar produto no mercado"
  | "PERMANENT";  // Contínuo — "Monitorar saúde financeira da empresa"
```

### 5.2 Tipos por Natureza

```typescript
type GoalNature =
  | "ACTIVE"      // Em execução agora
  | "BACKGROUND"  // Rodando em segundo plano continuamente
  | "RECURRENT"   // Repete-se periodicamente
  | "CONDITIONAL" // Ativado quando condição se torna verdadeira
  | "DERIVED"     // Gerado automaticamente pelo MGIS a partir de outro Goal
  | "INTERRUPTED" // Foi pausado e aguarda retomada
  | "RECOVERED"   // Foi recuperado após falha
  | "PERMANENT";  // Nunca é completado — monitoramento contínuo
```

### 5.3 Goal Hierarchy — Diagrama Completo

```
MISSION (lifetime)
  │
  └──► LONG GOAL (anos)
         │
         ├──► MEDIUM GOAL (meses)
         │      │
         │      ├──► SHORT GOAL (dias/semanas)
         │      │      │
         │      │      ├──► INSTANT GOAL (minutos)
         │      │      │      │
         │      │      │      └──► TASK (atômica)
         │      │      │              │
         │      │      │              └──► ACTION (Connector)
         │      │      │
         │      │      └──► BACKGROUND GOAL (contínuo paralelo)
         │      │
         │      └──► RECURRENT GOAL (toda semana/mês)
         │
         └──► PERMANENT GOAL (monitoramento)
```

---

# CAPÍTULO 6 — DEFINIÇÕES ONTOLÓGICAS E CONTRATOS BASE

---

## 6.1 Interface Principal do MGIS

```typescript
interface GoalIntelligenceEngine {
  // ─── Compreensão ──────────────────────────────────────────────
  understand(intent: Intent): Promise<GoalUnderstandingResult>;
  clarify(intent: Intent): Promise<ClarificationRequest | null>;

  // ─── Decomposição ─────────────────────────────────────────────
  decompose(goal: Goal, context: GoalContext): Promise<GoalDecompositionResult>;
  discoverHidden(goal: Goal): Promise<Goal[]>;

  // ─── Hierarquia ───────────────────────────────────────────────
  buildHierarchy(goals: Goal[]): GoalHierarchy;
  prioritize(goals: Goal[], context: GoalContext): PrioritizedGoal[];

  // ─── Conflitos ────────────────────────────────────────────────
  detectConflicts(goals: Goal[]): GoalConflict[];
  resolveConflict(conflict: GoalConflict): ConflictResolution;

  // ─── Entrega ao Planner ───────────────────────────────────────
  buildGoalPlan(goal: Goal): GoalPlan;

  // ─── Aprendizado ──────────────────────────────────────────────
  learn(goalId: string, outcome: GoalOutcome): void;
  predict(userId: string, context: GoalContext): PredictedGoal[];
  suggest(userId: string): GoalSuggestion[];
}
```

## 6.2 Contrato de Entrega ao Planner

O MGIS entrega ao Planner um `GoalPlan` — não uma lista de tasks, mas um objetivo estruturado e contextualizado:

```typescript
interface GoalPlan {
  goalPlanId: string;
  originalIntent: Intent;
  rootGoal: Goal;
  decomposition: GoalDecompositionResult;
  hierarchy: GoalHierarchy;
  prioritizedGoals: PrioritizedGoal[];
  resolvedConflicts: ConflictResolution[];
  context: GoalContext;
  constraints: GoalConstraint[];
  estimatedComplexity: ComplexityEstimate;
  suggestedApproach: string;
  alternativeApproaches: string[];
  userConfirmationRequired: boolean;
  generatedAt: string;
}
```

---

# CAPÍTULO 7 — GOAL COMPLEXITY

---

## 7.1 Classificação de Complexidade

```
┌──────────────────────────────────────────────────────────────────────┐
│                  CLASSIFICAÇÃO DE COMPLEXIDADE                       │
├───────────┬───────────────┬─────────────────────────────────────────┤
│ Nível     │ Subgoals      │ Exemplos                                │
├───────────┼───────────────┼─────────────────────────────────────────┤
│ INSTANT   │ 0             │ "Que horas são em Tóquio?"              │
│ SIMPLE    │ 1-3           │ "Enviar e-mail para João"                │
│ MODERATE  │ 4-10          │ "Planejar viagem a SP"                  │
│ COMPLEX   │ 11-30         │ "Lançar produto no Shopify"             │
│ EPIC      │ 31+           │ "Abrir empresa / Organizar empresa"     │
└───────────┴───────────────┴─────────────────────────────────────────┘
```

## 7.2 UML — Diagrama de Classes Principal do MGIS

```
┌──────────────────────────────────────────────────────────────────────┐
│                    GoalIntelligenceEngine                            │
├──────────────────────────────────────────────────────────────────────┤
│ + understand(intent): GoalUnderstandingResult                        │
│ + decompose(goal, ctx): GoalDecompositionResult                      │
│ + prioritize(goals, ctx): PrioritizedGoal[]                          │
│ + detectConflicts(goals): GoalConflict[]                             │
│ + buildGoalPlan(goal): GoalPlan                                      │
│ + predict(userId, ctx): PredictedGoal[]                              │
│ + learn(goalId, outcome): void                                       │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ uses
       ┌───────────────────┼───────────────────────────┐
       │                   │                           │
┌──────▼──────┐   ┌────────▼──────┐         ┌─────────▼──────┐
│ GoalGraph   │   │ GoalOntology  │         │ GoalMemory     │
│ Engine      │   │ Engine        │         │ Manager        │
├─────────────┤   ├───────────────┤         ├────────────────┤
│ addGoal()   │   │ classify()    │         │ getHistory()   │
│ decompose() │   │ expand()      │         │ getRecurrent() │
│ findPath()  │   │ mapDomain()   │         │ learn()        │
│ conflicts() │   │ getAliases()  │         │ predict()      │
└─────────────┘   └───────────────┘         └────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                      GoalPlan                               │
├─────────────────────────────────────────────────────────────┤
│ goalPlanId · rootGoal · decomposition · hierarchy           │
│ prioritizedGoals · resolvedConflicts · context              │
│ constraints · estimatedComplexity · generatedAt             │
└─────────────────────────────────────────────────────────────┘
                      │ delivered to
               ┌──────▼──────┐
               │   Planner   │  (MAS §4.7)
               └─────────────┘
```

---

**Documento Oficial:** MGIS — MemoryOS Goal Intelligence Specification  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 1 de 4 — Filosofia, Definições, Goal Graph, Decomposição, Hierarquia