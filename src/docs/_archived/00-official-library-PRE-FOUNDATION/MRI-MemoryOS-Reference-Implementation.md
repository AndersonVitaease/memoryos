# MRI — MemoryOS Reference Implementation
## Official Engineering Validation & First End-to-End Implementation

**Versão:** 1.0  
**Status:** Documento Oficial de Implementação de Referência — Aprovado  
**Data:** 2026-07-10  
**Tipo:** Especificação de Implementação de Referência  
**Complementa:** Todos os documentos da Biblioteca Oficial

---

## Declaração

Este documento inaugura a **segunda grande fase do projeto MemoryOS**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FASE 1 — CONCLUÍDA                                 │
│                                                                             │
│  MV   MPS   MAS   MDS (v1.0–v1.6 + Arch.Principles)                       │
│  MRS  MCS   MDIS  MIES   MDPS   MGFS                                       │
│                                                                             │
│  Toda a Biblioteca Oficial está formalizada.                               │
│  A arquitetura foi definida. Os contratos foram estabelecidos.             │
│  Os processos de governança foram documentados.                            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                         FASE 2 — INICIA AQUI                               │
│                                                                             │
│  MRI — MemoryOS Reference Implementation                                   │
│                                                                             │
│  Objetivo: validar toda a arquitetura através de software funcionando.     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Não altera:** MV · MPS · MAS · MDS · MRS · MCS · MDIS · MIES · MDPS · MGFS  
**Demonstra:** Como todos esses documentos são aplicados na prática.

---

# CAPÍTULO 1 — OBJETIVOS DA IMPLEMENTAÇÃO DE REFERÊNCIA

## O que o MRI valida

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OBJETIVOS DO MRI v1.0                                 │
│                                                                             │
│  NÃO é objetivo:                                                           │
│    ✗ Construir um produto completo                                         │
│    ✗ Implementar todos os Connectors possíveis                             │
│    ✗ Cobrir todos os casos de uso                                          │
│                                                                             │
│  É objetivo:                                                               │
│    ✓ Validar que a arquitetura funciona end-to-end                        │
│    ✓ Confirmar que as Interfaces do Core são implementáveis               │
│    ✓ Provar que Connectors externos seguem o SDK sem acesso ao Core       │
│    ✓ Demonstrar que Journeys persistem entre sessões                      │
│    ✓ Verificar que o Event Bus desacopla os motores                       │
│    ✓ Confirmar que o Security Gate é inviolável                           │
│    ✓ Validar que o AuditTrail é completo e imutável                       │
│    ✓ Provar que o Learning Engine aprende com execuções reais             │
│    ✓ Servir como referência permanente para futuros desenvolvedores       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Dimensões de Validação

| Dimensão | O que valida | Critério de aprovação |
|---|---|---|
| **Arquitetura** | Baixo acoplamento, MCS compliance | Zero imports diretos no Core |
| **Interfaces** | IConnector, ISpecialist, IMemory... | 100% implementáveis |
| **SDKs** | Connector SDK, Specialist SDK | Desenvolvedor externo consegue usar |
| **Runtime** | MRS Chapters 1–18 | Todos os lifecycles operacionais |
| **Core** | MCS Chapters 1–15 | Nenhuma regra de negócio no Core |
| **Connectors** | MCF + MDPS | Execute, rollback, healthCheck |
| **Specialists** | MDPS Capítulo 4 | KnowledgePackage retornado corretamente |
| **Journey Engine** | MRS Capítulo 2 | Persistência entre sessões |
| **Event Bus** | MRS Capítulo 5 | Desacoplamento total |
| **Security** | MRS Capítulo 12 | Gate inviolável |
| **Governance** | MGFS | RFC → ADR → impl → release |

---

# CAPÍTULO 2 — ESCOPO DO MVP

## O mínimo necessário para validar a arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MVP SCOPE — MRI v1.0                               │
├──────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  CORE MÍNIMO (MCS)                                                         │
│    ✓ Context Management                                                    │
│    ✓ Working Memory Engine (TTL + eviction)                                │
│    ✓ Long-Term Memory Engine (store + retrieve)                            │
│    ✓ Universal Event Bus (publish + subscribe + DLQ)                       │
│    ✓ Goal Detection Engine (básico)                                        │
│    ✓ Planner Engine (steps + dependências)                                 │
│    ✓ Execution Engine (sequential + parallel + rollback)                   │
│    ✓ Identity Context Manager (1 contexto por usuário para MVP)            │
│    ✓ Audit Trail Engine (imutável)                                         │
│    ✓ Security Gate (Permission + Risk)                                     │
│    ✓ Human Approval (pausa + retomada)                                     │
│    ✓ Journey Manager (create + pause + resume + complete)                  │
│    ✓ Session Manager (create + restore)                                    │
│                                                                             │
│  FORA DO MVP (futuras versões)                                             │
│    ○ Capability Negotiation Engine completo                                │
│    ○ Federation Engine para múltiplos Specialists                          │
│    ○ Organizational Experience Engine                                      │
│    ○ Full Learning Engine (validação + consolidação)                       │
│    ○ Knowledge Graph Engine completo                                       │
│    ○ Multiple Identity Contexts                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Estrutura de Diretórios da Referência

```
src/
└── lib/
    └── memoryos-core/
        ├── context/
        │   ├── ContextManager.ts
        │   └── IdentityContext.ts
        ├── memory/
        │   ├── WorkingMemoryEngine.ts
        │   └── LongTermMemoryEngine.ts
        ├── event-bus/
        │   ├── UniversalEventBus.ts
        │   ├── DeadLetterQueue.ts
        │   └── PriorityScheduler.ts
        ├── planning/
        │   ├── GoalDetectionEngine.ts
        │   └── PlannerEngine.ts
        ├── execution/
        │   ├── ExecutionEngine.ts
        │   ├── SecurityGate.ts
        │   └── HumanApprovalEngine.ts
        ├── journey/
        │   └── JourneyManager.ts
        ├── audit/
        │   └── AuditTrailEngine.ts
        ├── interfaces/
        │   ├── IConnector.ts
        │   ├── ISpecialist.ts
        │   ├── IMemoryProvider.ts
        │   └── IEventPublisher.ts
        └── index.ts              ← ponto de entrada público do Core
```

---

# CAPÍTULO 3 — PRIMEIROS CONNECTORS OFICIAIS

## Connectors de Referência

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  REFERENCE CONNECTORS — MRI v1.0                          │
├──────────────────────┬───────────────────────────────────────────────────── │
│ Connector             │ O que valida                                       │
├──────────────────────┼───────────────────────────────────────────────────── │
│ FileSystemConnector   │ I/O local, rollback via backup, healthCheck simples│
│ HttpConnector         │ REST APIs externas, timeout, retry, auth headers   │
│ EmailConnector        │ SMTP/IMAP, rollback conceitual, rate limiting      │
│ CalendarConnector     │ CRUD eventos, conflitos, timezone, recorrência     │
│ DatabaseConnector     │ CRUD, transações, rollback real via SQL ROLLBACK   │
│ GovConnector*         │ Auth por certificado, múltiplos endpoints, fallback│
└──────────────────────┴───────────────────────────────────────────────────── │
  * GovConnector: implementado quando APIs governamentais permitirem.
```

## Template Canônico de Connector de Referência

```typescript
// src/lib/memoryos-connectors/FileSystemConnector.ts

import type { IConnector, ConnectorResult, ExecutionContext } from "@memoryos/core";

export class FileSystemConnector implements IConnector {
  connectorId  = "com.memoryos.filesystem";
  capabilityId = "filesystem.file.read";

  // Execução principal
  async execute(input: FileReadInput, ctx: ExecutionContext): Promise<ConnectorResult> {
    const validation = this.validate(input);
    if (!validation.valid) throw new ConnectorError(validation.error);

    // Backup para rollback
    const backupRef = await this.createBackup(input.path);

    const content = await fs.readFile(input.path, "utf-8");

    return {
      connectorId:  this.connectorId,
      capabilityId: this.capabilityId,
      status:       "success",
      outputData:   { content, path: input.path, sizeBytes: content.length },
      executionRef: { backupRef, originalPath: input.path },
      auditData:    {
        action:    "file.read",
        resource:  input.path,
        timestamp: new Date().toISOString(),
        userId:    ctx.userId
      }
    };
  }

  // Rollback via backup
  async rollback(executionRef: FileRef, ctx: ExecutionContext) {
    await this.restoreFromBackup(executionRef.backupRef, executionRef.originalPath);
    return { status: "rolled_back", executionRef };
  }

  // Validação sem I/O
  validate(input: unknown): ValidationResult {
    if (!input?.path) return { valid: false, error: "path is required" };
    return { valid: true };
  }

  // Health sem dados do usuário
  async healthCheck() {
    const start = Date.now();
    await fs.access(process.env.FS_BASE_PATH ?? "/tmp");
    return {
      status:      "healthy",
      latencyMs:   Date.now() - start,
      version:     "1.0.0",
      timestamp:   new Date().toISOString(),
      dependencies: [{ name: "filesystem", status: "ok" }]
    };
  }

  getMetadata() {
    return {
      connectorId:        this.connectorId,
      capabilityId:       this.capabilityId,
      supportsRollback:   true,
      estimatedLatencyMs: 50,
      version:            "1.0.0"
    };
  }
}
```

---

# CAPÍTULO 4 — PRIMEIROS SPECIALISTS

## Specialists de Referência

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   REFERENCE SPECIALISTS — MRI v1.0                        │
├───────────────────────┬───────────────────────────────────────────────────── │
│ Specialist             │ Domínio / O que valida                            │
├───────────────────────┼───────────────────────────────────────────────────── │
│ GeneralAssistant       │ Consultas gerais · Validação do Specialist SDK    │
│ GovernmentSpecialist   │ Documentos, CPF, CNPJ, benefícios gov.br          │
│ TourismSpecialist      │ Reservas, destinos, regulamentos de viagem        │
│ KnowledgeSpecialist    │ Consulta ao Knowledge Graph, ontologias           │
│ SupportSpecialist      │ Diagnóstico de problemas, escalação               │
└───────────────────────┴───────────────────────────────────────────────────── │
```

## Template Canônico de Specialist de Referência

```typescript
// src/lib/memoryos-specialists/KnowledgeSpecialist.ts

import type { ISpecialist, SpecialistRequest, SpecialistResponse } from "@memoryos/core";

export class KnowledgeSpecialist implements ISpecialist {
  specialistId = "com.memoryos.knowledge-specialist";
  domain       = "knowledge";
  capabilities = ["knowledge.graph.search", "knowledge.fact.validate"];

  async process(request: SpecialistRequest): Promise<SpecialistResponse> {
    // 1. Consultar Knowledge Graph via Interface (nunca diretamente)
    const nodes = await request.knowledgeProvider.search({
      query:  request.query,
      domain: this.domain,
      limit:  20
    });

    // 2. Aplicar ontologia do domínio
    const enriched = this.applyOntology(nodes);

    // 3. Retornar KnowledgePackage — NUNCA retornar ao usuário diretamente
    return {
      specialistId:    this.specialistId,
      domain:          this.domain,
      facts:           enriched.facts,
      reasoning:       enriched.reasoning,
      recommendations: enriched.recommendations,
      confidence:      enriched.averageConfidence,
      sources:         enriched.sources,
      limitations:     [
        "Conhecimento limitado à base carregada",
        "Não acessa fontes externas em tempo real"
      ]
    };
  }

  getMetadata() {
    return {
      specialistId: this.specialistId,
      domain:       this.domain,
      version:      "1.0.0",
      languages:    ["pt-BR", "en-US"]
    };
  }
}
```

---

# CAPÍTULO 5 — PRIMEIRAS JOURNEYS

## Journeys de Referência

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   REFERENCE JOURNEYS — MRI v1.0                           │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Journey                       │ O que valida                               │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ ConsultaGov                   │ GovConnector · KnowledgeSpecialist ·       │
│                               │ Human Approval · Audit                     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ ReservaViagem                 │ CalendarConnector · TourismSpecialist ·    │
│                               │ Multi-step · Rollback · Working Memory     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ AtendimentoSuporte            │ SupportSpecialist · EmailConnector ·       │
│                               │ Escalação · Error Lifecycle                │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ PesquisaDocumental            │ FileSystemConnector · DatabaseConnector ·  │
│                               │ KnowledgeSpecialist · Long-Term Memory     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ OrganizacaoPessoal            │ CalendarConnector · FileSystemConnector ·  │
│                               │ Journey persistence · Context switching    │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

## O que cada Journey deve demonstrar

Cada Journey de referência é aprovada somente quando comprova:

| Critério | Verificação |
|---|---|
| **Contexto** | Working Memory carregada antes do Planner |
| **Memória** | Long-Term Memory consultada antes de perguntar ao usuário |
| **Planejamento** | Steps com dependências e prioridades corretas |
| **Execução** | Sequential e parallel steps funcionando |
| **Auditoria** | AuditTrail completo do início ao fim |
| **Continuidade** | Journey pausada e retomada entre sessões |
| **Rollback** | Falha parcial → rollback dos steps anteriores |
| **Learning** | Resultado disponível para o Learning Engine |

---

# CAPÍTULO 6 — FLUXOS END-TO-END

## Fluxo de Referência Completo

```
USUÁRIO INICIA
  "Quero verificar meu CPF no sistema gov.br"
          ↓
IDENTITY CONTEXT
  Verificar contexto ativo: PF
  Carregar Working Memory da sessão
          ↓
GOAL DETECTION
  goal: { type: "VERIFICATION", title: "Consulta CPF gov.br", complexity: "LOW" }
          ↓
INTENT VERIFICATION
  Confirmação do objetivo — sem ambiguidade
          ↓
LONG-TERM MEMORY CHECK
  CPF já armazenado? → SIM → usar sem perguntar
  Última consulta: quando? → há mais de 30 dias → reconsultar
          ↓
PLANNER
  step_1: GovConnector.cpf.validate (input: CPF da memória)
  step_2: KnowledgeSpecialist.process (contexto: resultado step_1)
  step_3: LongTermMemory.store (resultado validado)
          ↓
SECURITY GATE
  Permission: usuário tem permissão? ✓
  Risk:       LOW → execução automática
          ↓
EXECUTION ENGINE
  step_1 → GovConnector.execute()
    → resultado: { valid: true, owner: "João Silva", status: "REGULAR" }
  step_2 → KnowledgeSpecialist.process()
    → KnowledgePackage { facts: [...], confidence: 0.97 }
  step_3 → LongTermMemory.store(result)
          ↓
AUDIT TRAIL
  Registro imutável: userId + journeyId + executionId + cada step
          ↓
EVENT BUS
  execution.completed → Learning Engine
  memory.stored       → Context Manager
          ↓
LEARNING ENGINE
  GovConnector + consulta CPF = padrão de sucesso registrado
          ↓
RESPOSTA AO USUÁRIO
  "Seu CPF está REGULAR. Última atualização: hoje."
```

## Fluxo com Falha e Rollback

```
EXECUÇÃO EM ANDAMENTO
  step_1: FileSystemConnector → cria arquivo → SUCCESS
  step_2: DatabaseConnector   → insere registro → TIMEOUT
          ↓
ERRO DETECTADO
  errorType: TIMEOUT
  retryable: true
          ↓
RETRY (3 tentativas com exponential backoff)
  tentativa_1: TIMEOUT
  tentativa_2: TIMEOUT
  tentativa_3: TIMEOUT
          ↓
ESGOTADO → ROLLBACK
  step_2: DatabaseConnector.rollback() → "não inserido" = nada a fazer
  step_1: FileSystemConnector.rollback() → arquivo deletado
          ↓
AUDIT TRAIL
  Falha + retries + rollback registrados
          ↓
EVENTO PUBLICADO
  execution.failed + execution.rolled_back
          ↓
USUÁRIO NOTIFICADO
  "Não foi possível concluir a operação. Tudo foi desfeito."
```

---

# CAPÍTULO 7 — VALIDAÇÃO DOS SDKs

## Critério: desenvolvedor externo consegue expandir sem tocar no Core

```
VALIDAÇÃO DO CONNECTOR SDK

  Cenário: desenvolvedor externo cria um novo Connector
  sem acesso ao código fonte do Core.

  Passos:
    1. Instalar @memoryos/sdk
    2. Implementar IConnector
    3. Preencher manifesto
    4. Executar: memorios lint → zero erros
    5. Executar: memorios simulate → execução bem-sucedida
    6. Executar: memorios certify → Community badge aprovado
    7. Registrar no ConnectorRegistry do Core

  Critério de aprovação:
    Desenvolvedor externo completa os 7 passos sem acessar nenhum arquivo
    do Core diretamente — apenas APIs públicas do SDK.
```

```
VALIDAÇÃO DO SPECIALIST SDK

  Cenário: desenvolvedor externo cria um Specialist para domínio jurídico
  sem código interno.

  Passos:
    1. Implementar ISpecialist
    2. Declarar expertise com fontes verificáveis
    3. Retornar KnowledgePackage com limitations[] preenchidas
    4. Testar com MockKnowledgeProvider
    5. Registrar no SpecialistRegistry

  Critério de aprovação:
    Federation Engine combina resultado do novo Specialist com outros
    sem nenhuma modificação no Core.
```

```
VALIDAÇÃO DO KNOWLEDGE PACKAGE SDK

  Cenário: criar biblioteca de conhecimento sobre direito trabalhista.

  Passos:
    1. Criar nodes[] com KnowledgeNodeType.RULE
    2. Declarar sources[] com fontes oficiais (CLT, TST)
    3. Definir ontologia com sinônimos (CLT, consolidação, lei)
    4. Publicar no Marketplace
    5. KnowledgeSpecialist carrega automaticamente

  Critério de aprovação:
    KnowledgeSpecialist encontra fatos do novo package em buscas semânticas.
```

```
VALIDAÇÃO DO WORKFLOW SDK

  Cenário: criar template de Workflow para "Declaração de IR".

  Passos:
    1. Declarar WorkflowTemplate com 5 steps
    2. Incluir ApprovalGate para step de envio
    3. Incluir RollbackPlan para steps reversíveis
    4. Instanciar via Journey Manager
    5. Executar end-to-end

  Critério de aprovação:
    Journey completa todos os 5 steps com Human Approval funcionando.
```

---

# CAPÍTULO 8 — VALIDAÇÃO DA GOVERNANÇA

## Executar o processo MGFS completo ao menos 1 vez

```
RFC ABERTO
  "RFC-0001 — Adicionar suporte a CalendarConnector recorrente"
          ↓
PERÍODO DE DISCUSSÃO (simulado: 14 dias)
  Feedback documentado, incorporado
          ↓
AVALIAÇÃO TÉCNICA
  Viabilidade confirmada
          ↓
AVALIAÇÃO ARQUITETURAL
  Alinhamento com IConnector confirmado
  Nenhuma mudança necessária no Core
          ↓
ADR CRIADO
  ADR-0001 — CalendarConnector com suporte a recorrência
  Status: Accepted
          ↓
IMPLEMENTAÇÃO
  CalendarConnector.execute() com recurringRule
          ↓
CERTIFICAÇÃO
  memorios certify → Verified badge
          ↓
PUBLICAÇÃO
  Marketplace v1.1.0
          ↓
VERSIONAMENTO
  CalendarConnector 1.0.0 → 1.1.0 (MINOR: nova feature)
          ↓
ROLLBACK TESTADO
  CalendarConnector.rollback() → evento deletado
          ↓
VALIDAÇÃO:
  O processo RFC → ADR → Impl → Certif → Publish funcionou sem alterar o Core.
```

---

# CAPÍTULO 9 — VALIDAÇÃO DO CORE

## Checklist de Integridade do Core

```
ARCHITECTURAL INTEGRITY CHECK — MRI v1.0
═══════════════════════════════════════════════════════════════════════════════

BAIXO ACOPLAMENTO
  [ ] Core importa apenas Interfaces (IConnector, ISpecialist, ...)?
  [ ] Nenhum motor chama outro motor diretamente?
  [ ] Toda comunicação entre motores usa o Event Bus?
  [ ] Zero imports de Connectors ou Adapters concretos no Core?

MODULARIDADE
  [ ] Cada motor tem responsabilidade única?
  [ ] ExecutionEngine não planeja?
  [ ] PlannerEngine não executa?
  [ ] LearningEngine não decide?

ESTABILIDADE
  [ ] Interfaces públicas são todas implementáveis externamente?
  [ ] Core funciona com qualquer Connector que implemente IConnector?
  [ ] Core funciona com qualquer Specialist que implemente ISpecialist?

REGRAS DE NEGÓCIO
  [ ] ZERO regras de domínio específico no Core?
  [ ] Nenhuma referência a "turismo", "saúde", "juridico" no Core?
  [ ] Nenhuma referência a APIs externas específicas no Core?

APROVAÇÃO:
  Todos os itens ✓ → Core está íntegro.
  Qualquer item ✗ → RFC obrigatório antes de prosseguir.
```

---

# CAPÍTULO 10 — VALIDAÇÃO DO RUNTIME

## Testes por Lifecycle (MRS)

```
SESSION LIFECYCLE (MRS Capítulo 3)
  ✓ Criar nova sessão → Session ID gerado
  ✓ Restaurar sessão existente → Working Memory carregada
  ✓ Sessão expirada → nova sessão + Journey preservada
  ✓ Context Switching → Working Memory persistida + carregada

JOURNEY LIFECYCLE (MRS Capítulo 2)
  ✓ Journey DRAFT → ACTIVE (confirmação do objetivo)
  ✓ Journey ACTIVE → PAUSED (encerramento da sessão)
  ✓ Journey PAUSED → ACTIVE (retomada)
  ✓ Journey ACTIVE → BLOCKED (aguarda ação externa)
  ✓ Journey ACTIVE → COMPLETED (objetivo atingido)
  ✓ Journey COMPLETED → ARCHIVED

EVENT LIFECYCLE (MRS Capítulo 5)
  ✓ publish() → subscribers recebem em < 50ms
  ✓ Retry com backoff → 3 tentativas, intervalo dobrado
  ✓ DLQ → evento irrecuperável vai para Dead Letter Queue
  ✓ Idempotência → evento duplicado processado 1 vez

CONNECTOR LIFECYCLE (MRS Capítulo 6)
  ✓ execute() → SUCCESS → auditOK
  ✓ execute() → TIMEOUT → retry → fallback
  ✓ rollback() → estado restaurado
  ✓ healthCheck() → status reportado corretamente

LEARNING LIFECYCLE (MRS Capítulo 9)
  ✓ Execução concluída → Learning Engine notificado via Event Bus
  ✓ Candidate extraído → ValidationEngine executa
  ✓ confidence ≥ threshold → consolidado em Long-Term Memory
  ✓ confidence < threshold → descartado + log

ERROR LIFECYCLE (MRS Capítulo 10)
  ✓ USER_ERROR → solicitação de correção ao usuário
  ✓ CONNECTOR_ERROR → retry → fallback → DLQ
  ✓ UNEXPECTED → AuditTrail + incidente automático

SUPPORT LIFECYCLE (MRS Capítulo 11)
  ✓ Incidente detectado → chamado aberto com contexto completo
  ✓ Análise automática → hipóteses geradas
  ✓ Solução aceita → aplicada → chamado fechado
```

---

# CAPÍTULO 11 — TESTES

## Estratégia de Testes da Referência

```
UNITÁRIOS (por componente)
  Escopo: cada motor do Core isolado
  Cobertura: ≥ 95% de statements
  Ferramentas: Jest / Vitest
  Isolamento: mocks para Event Bus e todas as Interfaces

INTEGRAÇÃO (entre componentes)
  Escopo: pares de motores (Planner + Execution, Memory + Context)
  Cobertura: todos os contratos de Interface
  Ferramentas: ConnectorSimulator + MockSpecialist

CONTRATOS (API contracts)
  Escopo: toda Interface pública do Core
  Critério: Connector externo implementa IConnector → funciona sem modificação
  Ferramentas: Contract Test Suite do MDPS

CARGA (performance)
  Escopo: execução de 100 plans simultâneos
  Critério: P95 < 2000ms, zero memory leaks
  Ferramentas: k6 / Artillery

SEGURANÇA (security tests)
  Escopo: Security Gate, Permission Engine, sandbox
  Critério: zero bypass encontrado
  Casos: injection, privilege escalation, sandbox escape

RECUPERAÇÃO (chaos tests)
  Escopo: Connector failure, DLQ overflow, Memory overflow
  Critério: rollback correto, DLQ populado, Working Memory eviction
  Ferramentas: Chaos Engineering tool

OBSERVABILIDADE (tracing tests)
  Escopo: AuditTrail completo em cada execução
  Critério: correlação userId → sessionId → journeyId → executionId → stepId
  Verificação: nenhuma operação sem AuditEntry correspondente
```

---

# CAPÍTULO 12 — MÉTRICAS

## KPIs da Implementação de Referência

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       METRICS — MRI v1.0                                   │
├──────────────────────────────┬────────────────────────────────────────────  │
│ Métrica                       │ Meta                                       │
├──────────────────────────────┼────────────────────────────────────────────  │
│ Tempo de resposta P50         │ < 200ms (sem Connector externo)            │
│ Tempo de resposta P95         │ < 2000ms (com Connector externo)           │
│ Working Memory load           │ < 20ms P99                                 │
│ Long-Term Memory store        │ < 50ms P99                                 │
│ Event Bus latência            │ < 50ms P99                                 │
│ Rollback latência             │ < 5000ms P95                               │
│                               │                                            │
│ Uso de memória (Core)         │ < 100MB por sessão                         │
│ Memory leak                   │ Zero após 1000 execuções                   │
│                               │                                            │
│ Taxa de sucesso de execução   │ ≥ 95%                                      │
│ Taxa de rollback bem-sucedido │ 100% dos cenários testados                 │
│ Taxa de AuditTrail cobertura  │ 100% das operações                         │
│                               │                                            │
│ Throughput (Event Bus)        │ ≥ 1000 eventos/segundo                     │
│ Reutilização de Journey       │ Retomada em < 500ms após pausa             │
│                               │                                            │
│ Taxa de aprendizado válido    │ ≥ 80% dos candidatos aprovados             │
│ Satisfação (Human Approval)   │ Tempo de resposta ao usuário < 3s          │
└──────────────────────────────┴────────────────────────────────────────────  │
```

## Dashboard de Monitoramento

```
OBRIGATÓRIO durante a Referência:

  execution_overview:   latência, sucesso, falhas por motor
  journey_health:       ativas, pausadas, bloqueadas, concluídas
  memory_usage:         working / short-term / long-term por usuário
  connector_health:     disponibilidade e erro por Connector
  event_bus_status:     throughput, lag, DLQ size
  security_events:      tentativas bloqueadas, risk levels
  audit_coverage:       % de operações auditadas (meta: 100%)
```

---

# CAPÍTULO 13 — LIÇÕES APRENDIDAS

## Processo obrigatório para dificuldades encontradas

```
DIFICULDADE IDENTIFICADA durante a implementação
  (qualquer obstáculo técnico, arquitetural ou de processo)
          ↓
NUNCA alterar arquitetura diretamente ou "contornar" o problema
          ↓
ISSUE CRIADA
  Campos: o que aconteceu, contexto, impacto, reprodução
          ↓
RFC ABERTO (se impacto arquitetural)
  Proposta de solução dentro dos princípios da Biblioteca Oficial
          ↓
ADR CRIADO (se mudança necessária)
  Decisão documentada com alternativas e justificativa
          ↓
CORREÇÃO IMPLEMENTADA
  Seguindo o processo do MGFS
          ↓
DOCUMENTAÇÃO ATUALIZADA
  Documento afetado da Biblioteca Oficial revisado

PRINCÍPIO:
  A implementação serve para encontrar falhas na especificação.
  Falhas encontradas MELHORAM a especificação — nunca a contornam.
```

## Registro de Lições (exemplos esperados)

| Lição | Tipo | Ação |
|---|---|---|
| Interface IConnector precisava de campo X | Especificação incompleta | RFC + ADR + MCS atualizado |
| TTL de Working Memory insuficiente para Journey longa | Tuning de parâmetro | ADR com novos defaults |
| Human Approval bloqueou execução paralela | Comportamento não especificado | RFC + MRS atualizado |
| Rollback de DatabaseConnector falhou silenciosamente | Bug de implementação | Issue + fix + teste |

---

# CAPÍTULO 14 — CRITÉRIOS DE APROVAÇÃO

## A implementação é aprovada quando todos os critérios são atendidos

```
CRITÉRIOS DE APROVAÇÃO — MRI v1.0
═══════════════════════════════════════════════════════════════════════════════

MOTORES
  [ ] Working Memory Engine: store, retrieve, eviction, TTL funcionando
  [ ] Long-Term Memory Engine: store, retrieve, deduplication funcionando
  [ ] Universal Event Bus: publish, subscribe, DLQ, retry funcionando
  [ ] Goal Detection Engine: detecta objetivos a partir de linguagem natural
  [ ] Planner Engine: cria planos com steps e dependências
  [ ] Execution Engine: sequential, parallel, rollback funcionando
  [ ] Identity Context Manager: contexto isolado por usuário
  [ ] Audit Trail Engine: 100% de cobertura de operações
  [ ] Security Gate: Permission + Risk — inviolável nos testes
  [ ] Human Approval: pausa, notificação, retomada, rejeição funcionando
  [ ] Journey Manager: create, pause, resume, complete, archive funcionando
  [ ] Session Manager: create, restore, context-switch funcionando

SDKs
  [ ] Connector SDK: desenvolvedor externo cria Connector sem tocar o Core
  [ ] Specialist SDK: desenvolvedor externo cria Specialist sem tocar o Core
  [ ] Knowledge Package SDK: package carregado e consultado pelo KnowledgeSpecialist
  [ ] Workflow SDK: Workflow instanciado e executado end-to-end

FLUXOS
  [ ] ConsultaGov: end-to-end com GovConnector + Human Approval
  [ ] ReservaViagem: multi-step com rollback parcial
  [ ] AtendimentoSuporte: escalação + EmailConnector
  [ ] PesquisaDocumental: Long-Term Memory + Knowledge Graph
  [ ] OrganizacaoPessoal: Journey pausada e retomada entre sessões

GOVERNANÇA
  [ ] RFC → ADR → Impl → Release executados ao menos 1 vez
  [ ] Certification pipeline executado ao menos 1 Connector
  [ ] Versioning: PATCH e MINOR executados com changelog

QUALIDADE
  [ ] Cobertura de testes Core ≥ 95%
  [ ] Todos os KPIs de métricas atingidos
  [ ] AuditTrail: 100% das operações auditadas
  [ ] Zero imports proibidos no Core
  [ ] Zero regras de domínio específico no Core

ARQUITETURA
  [ ] Acoplamento: zero imports diretos entre motores
  [ ] Event Bus: único canal de comunicação entre motores
  [ ] Interfaces: 100% usadas via abstração no Core
  [ ] Todos os 10 Foundation Principles (MGFS) verificáveis na implementação

APROVAÇÃO FINAL:
  Todos os itens ✓ → MRI v1.0 APROVADO
  Qualquer item ✗ → Issue criada → processo MGFS → correção
```

---

# CAPÍTULO 15 — DECLARAÇÃO FINAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  O MRI representa a primeira implementação oficial de referência do        │
│  MemoryOS.                                                                 │
│                                                                             │
│  Seu objetivo é validar, através de software funcionando, todas as        │
│  decisões arquiteturais documentadas na Biblioteca Oficial.                │
│                                                                             │
│  Toda melhoria identificada durante a implementação retorna ao processo   │
│  oficial de governança:                                                    │
│                                                                             │
│    OBSERVAÇÃO → ISSUE → RFC → ADR → DOCUMENTAÇÃO → IMPLEMENTAÇÃO          │
│                                                                             │
│  O MemoryOS evolui sempre a partir de evidências obtidas na prática,      │
│  preservando a estabilidade, a qualidade e a coerência de sua             │
│  arquitetura.                                                              │
│                                                                             │
│  Esta implementação serve como referência permanente para:                │
│    • Desenvolvedores que queiram criar Connectors ou Specialists          │
│    • Parceiros que queiram integrar o MemoryOS                            │
│    • A equipe interna nas próximas fases de desenvolvimento               │
│    • Futuras gerações de mantenedores                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Status de Implementação

```
COMPONENTES DO CORE
  [✓] Execution Engine              (Sprint 17 — lib/execution-engine/)
  [✓] Cognitive Orchestrator        (lib/cognitive-engine/)
  [✓] Memory Engine                 (lib/memory-engine/)
  [✓] Event Bus                     (lib/universal-event-bus/)
  [✓] Connector SDK                 (lib/connector-sdk/)
  [✓] Connector Registry            (lib/connector-registry/)
  [✓] Connector Simulator           (lib/connector-simulator/)
  [✓] Planning Engine               (lib/cognitive-engine/planning/)
  [✓] Decision Engine               (lib/cognitive-engine/decisionEngine.js)
  [✓] Reasoning Engine              (lib/cognitive-engine/reasoningEngine.js)
  [✓] Learning Engine               (lib/cognitive-engine/learning/)
  [✓] Memory Integration            (lib/memory-integration/)
  [✓] Long-Term Retrieval           (lib/memory-engine/long-term-retrieval/)
  [✓] Hybrid Retrieval              (lib/memory-engine/hybridRetrievalManager.js)
  [✓] Semantic Search               (lib/memory-engine/semanticRetrievalManager.js)
  [✓] Vector Index                  (lib/memory-engine/memoryVectorIndex.js)
  [✓] Embedding Manager             (lib/memory-engine/memoryEmbeddingManager.js)
  [✓] Enterprise Integration        (lib/enterprise-integration/)
  [~] Journey Manager               (integrado ao ChatPage / em evolução)
  [○] GovConnector                  (planejado — aguarda APIs oficiais)

LEGENDA: ✓ implementado · ~ parcial · ○ planejado
```

---

**MRI — MemoryOS Reference Implementation v1.0**  
**Data:** 2026-07-10 · **Inaugura:** Fase 2 — Validação da Arquitetura