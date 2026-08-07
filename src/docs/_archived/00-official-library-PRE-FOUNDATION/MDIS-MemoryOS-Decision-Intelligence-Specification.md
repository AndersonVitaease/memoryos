# MDIS — MemoryOS Decision Intelligence Specification
## Decision Architecture, Reasoning & Cognitive Orchestration

**Versão:** 1.0  
**Status:** Documento Oficial da Inteligência do MemoryOS — Aprovado  
**Data:** 2026-07-10  
**Tipo:** Especificação de Inteligência Decisória  
**Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MCS · MDS Arch. Principles

---

## Declaração

Este documento define oficialmente **como o MemoryOS toma decisões**.

| Documento | Define |
|---|---|
| **MV** | A visão estratégica |
| **MPS** | O que o produto representa |
| **MAS** | Como o sistema é construído |
| **MDS** | Como implementá-lo |
| **MRS** | Como funciona em runtime |
| **MCS** | O que é o Core e seus limites |
| **MDIS** | Como a plataforma raciocina, decide e escolhe estratégias |

**Não altera:** Arquitetura · Roadmap · Runtime  
**Formaliza:** O comportamento decisório do MemoryOS.

---

# CAPÍTULO 1 — FILOSOFIA DA DECISÃO

## O MemoryOS não executa comandos cegamente

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FILOSOFIA DECISÓRIA                                    │
│                                                                             │
│  O MemoryOS NÃO é um executor de comandos.                                 │
│  O MemoryOS É um agente inteligente que compreende, raciocina e decide.    │
│                                                                             │
│  Antes de qualquer ação, o MemoryOS:                                       │
│                                                                             │
│    1.  COMPREENDE    — o que foi solicitado                                │
│    2.  INTERPRETA    — qual é a real intenção                              │
│    3.  CONTEXTUALIZA — qual é a situação atual                             │
│    4.  RECORDA       — o que já foi aprendido sobre este objetivo          │
│    5.  PLANEJA       — qual é a melhor sequência de ações                  │
│    6.  AVALIA RISCOS — quais impactos a ação pode causar                   │
│    7.  VERIFICA      — políticas e permissões                              │
│    8.  CONSIDERA     — objetivos de longo prazo do usuário                 │
│    9.  DECIDE        — com base em todos os fatores anteriores             │
│   10.  JUSTIFICA     — toda decisão é explicável                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Princípio Central

> **Toda decisão tomada pelo MemoryOS deve ser justificável.**

Uma decisão injustificável é uma decisão incorreta, independentemente do resultado.

## O que distingue o MemoryOS de um executor simples

| Executor Simples | MemoryOS |
|---|---|
| Recebe comando → executa | Recebe objetivo → compreende → decide → executa |
| Não considera contexto | Contexto é parte central da decisão |
| Não considera histórico | Memória informa toda decisão |
| Falha sem aviso | Avalia risco antes de agir |
| Não explica | Toda decisão é rastreável e explicável |
| Ignora políticas | Políticas são restrições imutáveis |

---

# CAPÍTULO 2 — DECISION PIPELINE

## Pipeline Completo de Decisão

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DECISION PIPELINE — MDIS v1.0                           │
└─────────────────────────────────────────────────────────────────────────────┘

  Objetivo do usuário
          │
          ▼
  ┌────────────────────┐
  │  Contexto Atual    │  Identity Context · Session · Working Memory
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Working Memory    │  Estado temporário · Outputs de steps anteriores
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Long-Term Memory  │  Histórico do usuário · Decisões passadas
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Knowledge Graph   │  Fatos · Relações · Ontologias · Domínio
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Identity Context  │  PF / PJ / Projeto · Permissões por contexto
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Policies          │  Approval · Retention · Risk · Business Rules
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Permission        │  RBAC · Least Privilege · Governance
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Risk Assessment   │  Impacto · Reversibilidade · Confiança
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Capability Negot. │  Capabilities disponíveis · Ranking · Score
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Planner           │  Steps · Dependências · Prioridades
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Simulation        │  Simular resultado antes de executar
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Decision          │  Selecionar melhor estratégia com base no score
  └────────────────────┘
          │
          ├── requiresApproval? → Human Approval → Confirmar / Rejeitar
          │
          ▼
  ┌────────────────────┐
  │  Execution         │  Sprint 17 · Rollback · Retry · Audit
  └────────────────────┘
          │
          ▼
  ┌────────────────────┐
  │  Learning          │  Aprender com o resultado da decisão
  └────────────────────┘
```

## Invariantes do Pipeline

| Invariante | Descrição |
|---|---|
| **Contexto primeiro** | Working Memory sempre carregada antes da decisão |
| **Memória antes da repetição** | Long-Term consultada antes de solicitar ao usuário |
| **Políticas antes da execução** | Nenhuma ação sem verificar políticas e permissões |
| **Simulação antes da ação** | Resultado simulado antes de ações de alto impacto |
| **Auditoria de toda decisão** | Cada etapa registrada no AuditTrail |
| **Learning após toda decisão** | Learning Engine notificado após cada conclusão |

---

# CAPÍTULO 3 — GOAL REASONING

## Como detectar objetivos

```
Entrada do usuário (texto / voz / ação)
          ↓
Goal Detection Engine
  ├── Objetivo explícito?        → classificar diretamente
  ├── Objetivo implícito?        → inferir a partir do contexto
  ├── Objetivo ambíguo?          → solicitar esclarecimento
  └── Objetivo conflitante?      → priorização e decomposição
          ↓
GoalRecord {
  goalId, type, title, description,
  priority, complexity, subGoals,
  parentGoalId, journeyId,
  confidenceScore
}
```

## Priorização de Objetivos

| Critério | Peso | Descrição |
|---|---|---|
| Urgência | 0.35 | Deadline explícito ou implícito |
| Impacto | 0.30 | Consequência do objetivo para o usuário |
| Dependência | 0.20 | Outros objetivos aguardam este |
| Contexto ativo | 0.15 | Alinhado ao contexto de identidade atual |

## Decomposição de Grandes Objetivos

```
Objetivo complexo detectado (complexity ≥ HIGH)
          ↓
DecompositionEngine
  ├── Identificar subobjetivos independentes
  ├── Identificar subobjetivos sequenciais
  └── Criar GoalTree {
        root: GoalRecord,
        children: GoalRecord[],
        executionOrder: "parallel" | "sequential" | "mixed"
      }
```

## Objetivos Concorrentes

```
Usuário tem 2+ objetivos ativos simultaneamente
          ↓
PriorityManager
  ├── Calcular score de urgência + impacto por objetivo
  ├── Detectar bloqueios mútuos (deadlock prevention)
  └── Ordenar fila de execução por score
```

---

# CAPÍTULO 4 — CONTEXT REASONING

## Dimensões de Contexto

| Dimensão | Fonte | Peso Padrão |
|---|---|---|
| **Contexto Atual** | Working Memory da sessão corrente | 0.35 |
| **Contexto Histórico** | Long-Term Memory do usuário | 0.25 |
| **Contexto Organizacional** | Organizational Experience Engine | 0.15 |
| **Contexto de Identidade** | Identity Context ativo (PF/PJ/Projeto) | 0.15 |
| **Contexto Temporal** | Data, hora, prazo, sazonalidade | 0.05 |
| **Contexto Geográfico** | Localização, fuso horário, regulação regional | 0.05 |

## Fusão de Contextos

```typescript
interface ContextBundle {
  current:        WorkingMemorySnapshot;      // peso: 0.35
  historical:     HistoricalContext;          // peso: 0.25
  organizational: OrgExperienceSnapshot;      // peso: 0.15
  identity:       IdentityContext;            // peso: 0.15
  temporal:       TemporalContext;            // peso: 0.05
  geographic:     GeographicContext;          // peso: 0.05
  merged:         MergedContext;              // resultado final
  conflictFlags:  ContextConflict[];          // conflitos detectados
}
```

## Resolução de Conflitos de Contexto

```
Conflito detectado entre dimensões
          ↓
  ├── Temporal > Histórico (informação mais recente prevalece)
  ├── Identity > Organizational (contexto pessoal > padrão organizacional)
  ├── Explícito > Inferido (declarado pelo usuário > deduzido pela IA)
  └── Auditoria: conflito registrado no AuditTrail
```

---

# CAPÍTULO 5 — MEMORY REASONING

## Hierarquia de Consulta à Memória

```
Decisão necessita de informação
          ↓
1. Working Memory (TTL ativo) — O(1), resposta < 5ms
          ↓ (não encontrado)
2. Short-Term Memory (sessão recente) — O(log n), < 20ms
          ↓ (não encontrado)
3. Long-Term Memory (histórico do usuário) — O(log n), < 50ms
          ↓ (não encontrado)
4. Knowledge Graph (fatos e relações) — O(depth), < 100ms
          ↓ (não encontrado)
5. Organizational Experience — O(log n), < 100ms
          ↓ (não encontrado)
6. Solicitar ao usuário ou pesquisar externamente
```

## Regra "Memory Before Repetition"

```
Antes de solicitar ao usuário qualquer informação:
  ├── Verificar Working Memory → encontrou? → usar sem perguntar
  ├── Verificar Long-Term Memory → encontrou? → confirmar silenciosamente
  └── Não encontrou → então perguntar ao usuário
```

## Uso do Knowledge Graph

```
Knowledge Graph consultado para:
  ├── Verificar fatos antes de afirmar
  ├── Descobrir relações entre entidades
  ├── Aplicar ontologia do domínio
  ├── Validar consistência de decisão
  └── Enriquecer contexto sem perguntar ao usuário
```

---

# CAPÍTULO 6 — DECISION SCORING

## Modelo de Pontuação

```typescript
interface DecisionScore {
  confidence:       number;   // 0.0–1.0  Certeza na decisão
  precision:        number;   // 0.0–1.0  Alinhamento com o objetivo
  availability:     number;   // 0.0–1.0  Recursos disponíveis
  latency:          number;   // 0.0–1.0  Velocidade estimada (1.0 = mais rápido)
  cost:             number;   // 0.0–1.0  Custo estimado (1.0 = mais barato)
  userPreference:   number;   // 0.0–1.0  Histórico de preferência do usuário
  historicalSuccess:number;   // 0.0–1.0  Taxa de sucesso histórica
  policyCompliance: number;   // 0.0–1.0  Conformidade com políticas (0 = bloqueado)
  riskLevel:        number;   // 0.0–1.0  (1.0 = sem risco; 0.0 = risco máximo)
  finalScore:       number;   // média ponderada
}
```

## Pesos por Dimensão

| Dimensão | Peso | Justificativa |
|---|---|---|
| `confidence` | 0.20 | Certeza é base de qualquer decisão |
| `precision` | 0.20 | Alinhamento ao objetivo é crítico |
| `policyCompliance` | 0.20 | Políticas são restrições imutáveis |
| `riskLevel` | 0.15 | Segurança antes da conveniência |
| `userPreference` | 0.10 | Personalização melhora experiência |
| `historicalSuccess` | 0.10 | Aprendizado contínuo |
| `availability` | 0.03 | Recurso disponível |
| `latency` | 0.01 | Velocidade |
| `cost` | 0.01 | Custo computacional |

## Regra de Bloqueio

```
policyCompliance = 0 → decisão BLOQUEADA independentemente dos outros scores
riskLevel < 0.3     → requiresApproval = true (Human Approval obrigatório)
confidence < 0.4    → solicitar esclarecimento antes de prosseguir
```

---

# CAPÍTULO 7 — CONFLICT RESOLUTION

## Tipos de Conflito

| Tipo | Exemplo | Estratégia |
|---|---|---|
| **Connector vs Connector** | Gmail e Outlook oferecem mesma capability | Score decisório + userPreference |
| **Specialist vs Specialist** | Medical e Pharma divergem em diagnóstico | Federation + confidence weighting |
| **Knowledge vs Knowledge** | Dois fatos contraditórios no Knowledge Graph | SOURCE_PRIORITY + timestamp |
| **Policy vs Policy** | ApprovalPolicy e SpeedPolicy conflitantes | SafetyPolicy sempre prevalece |
| **Prioridade vs Prioridade** | Dois objetivos urgentes simultâneos | PriorityManager + urgência + impacto |

## Algoritmo de Resolução

```
Conflito detectado
          ↓
Classificar tipo de conflito
          ↓
  ┌──────────────────────────────────────────────────────────────┐
  │  CONNECTOR CONFLICT                                          │
  │    → Score decisório (MDIS Capítulo 6)                       │
  │    → Desempate: userPreference → historicalSuccess → latency │
  └──────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────┐
  │  SPECIALIST CONFLICT                                         │
  │    → Federation Engine: combinar com confidence weighting    │
  │    → Divergência alta: solicitar Human Approval             │
  │    → Registrar divergência no AuditTrail                    │
  └──────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────┐
  │  KNOWLEDGE CONFLICT                                          │
  │    → SOURCE_PRIORITY: oficial > inferido > histórico         │
  │    → Timestamp: mais recente prevalece (exceto fontes legais)│
  │    → Conflito persistente: registrar como KnowledgeConflict  │
  └──────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────┐
  │  POLICY CONFLICT                                             │
  │    → Ordem: Security > Governance > ApprovalPolicy > outros │
  │    → Política de segurança NUNCA cede                        │
  └──────────────────────────────────────────────────────────────┘
          ↓
Decisão tomada → AuditTrail: conflito + resolução registrados
```

---

# CAPÍTULO 8 — UNCERTAINTY MANAGEMENT

## Níveis de Incerteza

| Nível | Score de Confiança | Ação |
|---|---|---|
| **ALTO** | ≥ 0.80 | Prosseguir automaticamente |
| **MÉDIO** | 0.60–0.79 | Prosseguir + notificar decisão tomada |
| **BAIXO** | 0.40–0.59 | Solicitar confirmação antes de prosseguir |
| **MUITO BAIXO** | < 0.40 | Parar + solicitar esclarecimento do usuário |

## Árvore de Decisão para Incerteza

```
Informação incerta detectada
          ↓
  ├── Verificar Working Memory → encontrado com confiança alta? → usar
  │
  ├── Verificar Long-Term Memory → encontrado? → verificar freshness
  │         ├── freshness > 0.7 → usar com confiança
  │         └── freshness < 0.7 → pesquisar atualização
  │
  ├── Consultar Knowledge Graph → fonte oficial disponível? → usar
  │
  ├── Simular resultado com incerteza → risco aceitável? → prosseguir
  │
  └── Nenhuma fonte suficiente
            ├── Ação de baixo impacto? → assumir + registrar incerteza
            ├── Ação de alto impacto?  → solicitar confirmação humana
            └── Ação irreversível?     → PARAR + solicitar esclarecimento
```

## Quando Perguntar vs Assumir

| Situação | Decisão |
|---|---|
| Informação está na memória recente | Assumir — não perguntar |
| Informação está na memória, mas desatualizada | Confirmar silenciosamente |
| Ação de baixo impacto com incerteza média | Assumir + registrar |
| Ação de alto impacto com qualquer incerteza | Perguntar sempre |
| Ambiguidade de objetivo | Perguntar sempre (clareza > velocidade) |
| Múltiplas interpretações possíveis | Apresentar opções ao usuário |

---

# CAPÍTULO 9 — EXPLANATION ENGINE

## Toda decisão deve ser explicável

```typescript
interface DecisionExplanation {
  decisionId:       string;
  decision:         string;       // o que foi decidido
  reason:           string;       // por que foi escolhido
  alternatives:     Alternative[]; // o que foi descartado e por quê
  sourcesUsed:      Source[];     // quais fontes foram consultadas
  memoriesUsed:     MemoryRef[];  // quais memórias influenciaram
  policiesApplied:  Policy[];     // quais políticas foram verificadas
  riskAssessment:   RiskReport;   // avaliação de risco realizada
  confidence:       number;       // grau de certeza
  auditRef:         string;       // referência no AuditTrail
  timestamp:        string;
}
```

## Perguntas que o MemoryOS deve ser capaz de responder

| Pergunta | Fonte da Resposta |
|---|---|
| "Por que escolheu este Connector?" | DecisionScore + userPreference |
| "Por que descartou a outra alternativa?" | alternatives[] com score comparativo |
| "Qual informação utilizou?" | memoriesUsed[] + sourcesUsed[] |
| "Qual fonte consultou?" | sourcesUsed[] com SOURCE_PRIORITY |
| "Qual política aplicou?" | policiesApplied[] |
| "Qual era o risco?" | riskAssessment.level + justificativa |
| "Por que pediu aprovação?" | requiresApproval reason |
| "Por que não pediu aprovação?" | riskLevel + policyCompliance |

## Nível de Detalhe por Audiência

```
Usuário final:
  "Escolhi enviar o email pelo Gmail porque você usou essa conta
   nas últimas 3 vezes para este tipo de mensagem."

Auditoria técnica:
  DecisionExplanation completo com scores, alternatives, sources,
  memories, policies e riskAssessment.
```

---

# CAPÍTULO 10 — DECISION SAFETY

## Camadas de Segurança Decisória

```
Toda decisão passa OBRIGATORIAMENTE por:

  1. Permission Engine
     └── Usuário tem permissão para esta ação neste contexto?
         ├── SIM → continua
         └── NÃO → BLOQUEADO + AuditTrail

  2. Risk Engine
     └── Qual é o impacto desta ação?
         ├── LOW    → prosseguir automaticamente
         ├── MEDIUM → prosseguir + notificar
         ├── HIGH   → requiresApproval = true
         └── CRITICAL → requiresApproval + justificativa obrigatória

  3. Governance Engine
     └── Ação viola alguma política de retenção, LGPD ou compliance?
         ├── Não viola → continua
         └── Viola → BLOQUEADO + explicação ao usuário

  4. Security Intelligence
     └── Padrão anômalo detectado?
         ├── Não detectado → continua
         └── Detectado → bloqueio temporário + incidente

  5. Human Approval (quando requiresApproval = true)
     └── Confirmação explícita do usuário
         ├── Confirmado → Execution autorizada
         └── Rejeitado  → Cancelamento + AuditTrail
```

## Hierarquia de Segurança

```
Security Intelligence  (nível mais alto — nunca ignorado)
        ↑
Governance Engine
        ↑
Risk Engine
        ↑
Permission Engine      (nível base — verificado primeiro)
```

---

# CAPÍTULO 11 — SPECIALIST COOPERATION

## Modelo de Cooperação

```
Planner identifica necessidade de múltiplos Specialists
          ↓
Federation Engine ativado
          ↓
Specialists executam em paralelo (independentes)
          ↓
  ┌──────────────────────────────────────────────────────────────┐
  │  Specialist A    Specialist B    Specialist C                │
  │  (Jurídico)      (Financeiro)    (Tributário)               │
  │      ↓                ↓               ↓                     │
  │  KnowledgePackage  KnowledgePackage  KnowledgePackage       │
  └──────────────────────────────────────────────────────────────┘
          ↓
Federation Engine: merge por confidence weighting
          ↓
ConflictDetector: divergências identificadas?
          │
          ├── Sem divergência → KnowledgeBundle entregue ao Planner
          │
          └── Com divergência → DocumentedDivergence
                ├── Impacto baixo  → tomar decisão pela maior confidence
                ├── Impacto médio  → apresentar ambas ao usuário
                └── Impacto alto   → Human Approval + justificativa de cada Specialist
```

## Registro de Divergências

```typescript
interface DocumentedDivergence {
  topic:          string;
  specialists:    SpecialistOpinion[];  // cada Specialist + sua posição
  resolution:     "majority" | "human_approval" | "confidence_weighted";
  finalPosition:  string;
  auditRef:       string;
}
```

---

# CAPÍTULO 12 — CONNECTOR NEGOTIATION

## Quando múltiplos Connectors oferecem a mesma Capability

```
Capability necessária identificada
          ↓
MCIS Registry → listar Connectors com capability disponível
          ↓
Capability Negotiation Engine
  ├── Score por: confiança, latência, custo, preferência do usuário,
  │              histórico de sucesso, disponibilidade atual
  │
  ├── Filtrar: Connectors com policyCompliance = 0 → EXCLUÍDOS
  │
  └── Ranquear: finalScore DESC
          ↓
Connector selecionado (maior score)
          ↓
  ┌──────────────────────────────────────────────────────────────┐
  │  Execution                                                   │
  │                                                              │
  │  SUCESSO            TIMEOUT           FALHA                 │
  │    ↓                   ↓                ↓                    │
  │  AuditOK           Retry policy     Fallback Connector       │
  │  Learning+              ↓                ↓                   │
  │                     Esgotado?        Disponível?             │
  │                         ↓                ↓                   │
  │                     Fallback         Novo Score              │
  │                     Connector        + Execução              │
  └──────────────────────────────────────────────────────────────┘
```

## Critérios de Seleção

| Critério | Peso | Fonte |
|---|---|---|
| `historicalSuccess` | 0.30 | Learning Engine |
| `latency` | 0.20 | ConnectorSimulator / histórico |
| `userPreference` | 0.20 | Long-Term Memory |
| `availability` | 0.15 | Health Check em tempo real |
| `cost` | 0.10 | ConnectorMetadata |
| `policyCompliance` | 0.05 | Governance Engine |

---

# CAPÍTULO 13 — ADAPTIVE DECISION

## Como adaptar decisões ao perfil do usuário

```
Contexto de decisão montado
          ↓
AdaptationEngine consulta:
  ├── UserProfile → idioma, nível técnico, preferências explícitas
  ├── Long-Term Memory → padrões de comportamento
  ├── Identity Context → PF / PJ / Projeto (modo de comunicação)
  ├── Historical Decisions → o que funcionou antes
  └── Domain → ontologia do domínio ativo
          ↓
Ajustes aplicados:
  ├── Nível de detalhe da resposta
  ├── Tom de comunicação (formal / informal)
  ├── Formato de saída (lista / parágrafo / ação)
  ├── Connector preferido (quando empate no score)
  └── Nível de confirmação solicitada
```

## Dimensões de Adaptação

| Dimensão | Exemplos |
|---|---|
| **Idioma** | pt-BR, en-US, es — detectado automaticamente |
| **Experiência** | Novato: explica mais; Especialista: resposta direta |
| **Domínio** | Vocabulário técnico adaptado por Specialist |
| **Histórico** | Connector usado com sucesso → preferido |
| **Modo** | Texto / Voz — profundidade da resposta adaptada |
| **Contexto de identidade** | PF: linguagem pessoal; PJ: linguagem corporativa |

---

# CAPÍTULO 14 — LEARNING FROM DECISIONS

## O que pode ser aprendido automaticamente

| Tipo de Aprendizado | Fonte | Validação |
|---|---|---|
| Preferência de Connector | Escolha repetida (≥ 3x) | Não necessária |
| Padrão de objetivo recorrente | Histórico de goals | Não necessária |
| Connector com alta performance | ExecutionRecord histórico | Não necessária |
| Tom de comunicação preferido | Feedback explícito | Não necessária |
| Domínio mais frequente | Estatísticas de sessão | Não necessária |

## O que NUNCA pode ser aprendido automaticamente

| Aprendizado Proibido | Motivo |
|---|---|
| Regras jurídicas / fiscais | Requerem fonte oficial + validação humana |
| Dados médicos ou de saúde | Risco crítico — validação obrigatória |
| Permissões de acesso | Governança — aprovação administrativa |
| Políticas de compliance | ADR + aprovação arquitetural |
| Informações de terceiros sobre o usuário | Privacy by design (LGPD) |

## Fluxo de Aprendizado Seguro

```
Decisão concluída
          ↓
Learning Engine: candidatos extraídos
          ↓
ValidationEngine
  ├── confidence ≥ threshold?
  ├── Tipo de aprendizado permitido?
  ├── Fonte verificável?
  └── Conflita com conhecimento existente?
          ↓
  ├── APROVADO → Consolidar em Long-Term Memory
  └── REPROVADO → Descartar + registrar razão + log
```

---

# CAPÍTULO 15 — DECISION PRINCIPLES

## Os 7 Princípios Imutáveis da Decisão

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DECISION PRINCIPLES — MDIS v1.0                        │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ P1: Contexto antes da ação   │ Working Memory carregada antes de decidir    │
│ P2: Memória antes da repet.  │ Verificar memória antes de perguntar         │
│ P3: Segurança antes da conv. │ Security Gate nunca ignorado                 │
│ P4: Jornadas antes das conv. │ Decisão sempre vinculada a objetivo maior    │
│ P5: Transparência            │ Toda decisão explicável e rastreável         │
│ P6: Fontes oficiais          │ Conhecimento verificado → fontes confiáveis  │
│ P7: Aprovação para críticos  │ Human Approval obrigatório para alto impacto │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

## Conflito entre Princípios

Quando dois princípios colidem, a hierarquia é:

```
P3 (Segurança) > P7 (Aprovação) > P6 (Fontes) > P1 (Contexto) > P2 (Memória) > P4 (Jornadas) > P5 (Transparência)
```

Segurança sempre prevalece sobre conveniência.

---

# CAPÍTULO 16 — DECISION QUALITY

## Indicadores de Qualidade Decisória

| Indicador | Definição | Meta |
|---|---|---|
| **Precisão** | % de decisões que atingiram o objetivo | > 90% |
| **Consistência** | Mesma entrada → mesma decisão | 100% (determinístico) |
| **Explicabilidade** | % de decisões com DecisionExplanation gerada | 100% |
| **Tempo de decisão** | Latência P95 do pipeline decisório | < 500ms |
| **Taxa de retrabalho** | % de decisões que precisaram ser refeitas | < 5% |
| **Feedback positivo** | % de aprovações explícitas do usuário | > 80% |
| **Aprovações desnecessárias** | Human Approval solicitado sem necessidade | < 2% |
| **Conflitos não resolvidos** | Conflitos no AuditTrail sem resolução | 0 |

## Monitoramento

```
Toda decisão → DecisionMetrics emitido no Event Bus
          ↓
MetricsAggregator → dashboards em tempo real
          ↓
AlertEngine → alertas quando indicadores ficam abaixo da meta
          ↓
Learning Engine → feedback automático para melhorar scoring
```

---

# CAPÍTULO 17 — COGNITIVE LIMITS

## O MemoryOS não inventa. O MemoryOS não substitui.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COGNITIVE LIMITS — OBRIGATÓRIO                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  O MemoryOS NÃO:                                                           │
│                                                                             │
│  ✗ INVENTA fatos — toda informação é verificável ou declarada incerta      │
│  ✗ CRIA documentos oficiais — apenas auxilia na criação                    │
│  ✗ SUBSTITUI profissionais — Specialists informam, não prescrevem          │
│  ✗ IGNORA permissões — sem exceção, independente do objetivo               │
│  ✗ VIOLA políticas — políticas são restrições, não sugestões               │
│  ✗ EXECUTA ações críticas sem aprovação — Human Approval é obrigatório     │
│  ✗ APRENDE dados proibidos — aprendizado tem limites explícitos            │
│  ✗ MISTURA contextos — cada Identity Context é completamente isolado       │
│  ✗ RETÉM dados além do permitido — Governance Engine aplica TTLs           │
│  ✗ DECIDE por médicos, advogados ou contadores — orienta, não decide       │
│                                                                             │
│  O MemoryOS É:                                                              │
│                                                                             │
│  ✓ Um agente de suporte à decisão                                          │
│  ✓ Uma memória persistente e inteligente                                   │
│  ✓ Um orquestrador de especialistas                                        │
│  ✓ Um executor confiável de planos aprovados                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# CAPÍTULO 18 — CHECKLIST DE CONFORMIDADE

## Obrigatório em toda Sprint que envolva lógica decisória

```
CHECKLIST — MDIS v1.0 — DECISÃO
═══════════════════════════════════════════════════════════════════════════════

CONTEXTO E MEMÓRIA
  [ ] A decisão utiliza Working Memory da sessão corrente?
  [ ] A decisão consulta Long-Term Memory antes de perguntar ao usuário?
  [ ] O Knowledge Graph foi consultado para fatos relevantes?

POLÍTICAS E SEGURANÇA
  [ ] Permission Engine foi verificado?
  [ ] Risk Engine avaliou o impacto?
  [ ] Governance Engine verificou compliance?
  [ ] Security Intelligence analisou padrão anômalo?
  [ ] requiresApproval configurado corretamente?

QUALIDADE DA DECISÃO
  [ ] DecisionScore calculado para todas as alternativas?
  [ ] Conflitos detectados e resolvidos com AuditTrail?
  [ ] Incertezas tratadas (não assumidas silenciosamente)?
  [ ] DecisionExplanation gerada?

AUDITORIA E RASTREABILIDADE
  [ ] Decisão registrada no AuditTrail?
  [ ] DecisionExplanation com alternatives, sources, memories, policies?
  [ ] AuditRef gerado e linkado à execução?

APRENDIZADO
  [ ] Learning Engine notificado após conclusão?
  [ ] Candidatos de aprendizado passaram pela ValidationEngine?
  [ ] Aprendizado proibido foi corretamente descartado?

LIMITES COGNITIVOS
  [ ] MemoryOS nunca inventou fatos?
  [ ] MemoryOS nunca violou permissões?
  [ ] MemoryOS nunca prescreveu em domínios críticos (saúde, direito)?

SE QUALQUER ITEM ESTIVER DESMARCADO → REVISAR ANTES DE APROVAR A PR.
```

---

# Declaração Final

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Toda decisão tomada pelo MemoryOS é:                                      │
│                                                                             │
│    CONTEXTUAL      — considera toda a situação atual e histórica           │
│    AUDITÁVEL       — registrada e rastreável do início ao fim              │
│    REPRODUZÍVEL    — mesma entrada → mesma decisão (determinismo)          │
│    JUSTIFICÁVEL    — explicável em linguagem natural e técnica             │
│    SEGURA          — Security Gate verificado antes de toda ação           │
│    TRANSPARENTE    — o usuário pode questionar qualquer decisão            │
│    ORIENTADA       — sempre em direção aos objetivos do usuário            │
│                                                                             │
│  O comportamento decisório permanece consistente independentemente do:     │
│    • mercado                                                               │
│    • idioma                                                                │
│    • domínio                                                               │
│    • quantidade de Connectors disponíveis                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**MDIS — MemoryOS Decision Intelligence Specification v1.0**  
**Data:** 2026-07-10 · **Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MCS · MDS Arch. Principles