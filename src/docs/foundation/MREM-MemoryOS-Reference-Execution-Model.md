# MREM — MemoryOS Reference Execution Model
## Official Runtime Execution Flow

**Version:** 1.0  
**Status:** Official Reference  
**Foundation:** v1.0.0  
**Date:** 2026-07-10  

> **Nota:** Este documento explica COMO o sistema executa uma jornada completa.  
> Para arquitetura: MAS. Para runtime spec: MRS. Para core boundaries: MCS.  
> Para APIs públicas: MPAR. Para engineering: MDH. Para governança: MPEGS.

---

## Capítulo 1 — Filosofia da Execução

O MemoryOS é orientado por **eventos e jornadas**. Toda solicitação do usuário percorre um pipeline previsível e determinístico. Nenhum componente executa ações fora desse pipeline.

### Cinco Garantias Imutáveis

| Garantia | Descrição |
|---|---|
| **Determinístico** | Dado o mesmo input e contexto, o mesmo pipeline é executado |
| **Auditável** | Toda ação é registrada no AuditTrail antes de qualquer resposta |
| **Seguro** | Nenhuma ação externa ocorre sem avaliação pelo SecurityGate |
| **Rastreável** | Cada etapa carrega correlationId que une Journey → Execution → Step |
| **Reproduzível** | O AuditTrail permite replay completo de qualquer execução |

### Orientação a Eventos

Nenhum engine chama outro engine diretamente. Toda comunicação ocorre via EventBus. Isso garante desacoplamento, testabilidade e observabilidade.

### Jornada como Unidade Central

Toda execução pertence a uma Journey. Não existe execução orphan. A Journey é o container que une sessões, contexto, eventos e resultados ao longo do tempo.

---

## Capítulo 2 — Execution Pipeline

O pipeline completo de uma requisição percorre 16 etapas em sequência determinística:

```
┌─────────────────────────────────────────────────────────┐
│                     USUÁRIO                             │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 1 — INPUT RECEIVER                               │
│  Recebe: texto, voz, arquivo, link, API call            │
│  Normaliza para: InputPayload { content, type, meta }   │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 2 — CONTEXT BUILDER                              │
│  Recupera: sessão ativa, histórico recente              │
│  Constrói: SessionContext { userId, sessionId, history }│
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 3 — IDENTITY CONTEXT                             │
│  Resolve: identityContext (pessoal, empresa, projeto)   │
│  Garante: isolamento total entre contextos              │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 4 — JOURNEY MANAGER                              │
│  Verifica: Journey existente ou cria nova               │
│  Carrega: contexto acumulado, eventos anteriores        │
│  Transição: draft → active                              │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 5 — PLANNER                                      │
│  Analisa: intenção do input                             │
│  Seleciona: Specialists candidatos                      │
│  Gera: ExecutionPlan com PlanStep[]                     │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 6 — CAPABILITY REGISTRY                          │
│  Verifica: Connectors disponíveis e saudáveis           │
│  Valida: capabilities necessárias vs. registradas       │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 7 — SECURITY GATE                                │
│  Avalia: Permission → Risk → Policy                     │
│  Decide: authorized | requiresApproval | blocked        │
│  Registra: AuditRecord para toda decisão                │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 8 — EXECUTION ENGINE                             │
│  Executa: PlanStep[] em sequência (ou paralelo)         │
│  Gerencia: timeout, retry, rollback por step            │
│  Publica: eventos no EventBus a cada transição          │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 9 — EVENT BUS                                    │
│  Propaga: eventos de execução para subscribers          │
│  Prioriza: CRITICAL > HIGH > NORMAL > LOW               │
│  Gerencia: DLQ para eventos com falha persistente       │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 10 — WORKING MEMORY                              │
│  Armazena: resultados intermediários com TTL            │
│  Isola: por identityContext                             │
│  Promove: dados relevantes para Long Term Memory        │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 11 — AUDIT TRAIL                                 │
│  Registra: AuditRecord imutável para cada ação          │
│  Inclui: correlationId que une todos os componentes     │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 12 — LONG TERM MEMORY                            │
│  Persiste: conhecimento extraído da execução            │
│  Indexa: para recuperação futura                        │
│  Evolui: base de conhecimento do usuário                │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ETAPA 13 — RESPONSE BUILDER                            │
│  Agrega: resultados dos steps                           │
│  Formata: resposta final contextualizada                │
│  Atualiza: Journey com summary                          │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                     USUÁRIO                             │
└─────────────────────────────────────────────────────────┘
```

### Correlação entre Etapas

Cada requisição recebe um `correlationId` na Etapa 1 que é propagado por todas as etapas. Isso permite reconstruir o histórico completo de qualquer execução consultando o AuditTrail por `correlationId`.

---

## Capítulo 3 — Lifecycle

### Estados de uma Requisição

```
Created ──→ Queued ──→ Planning ──→ Executing
                                        │
              ┌─────────────────────────┤
              ↓         ↓              ↓
           Waiting   Retrying      Completed
              │                        │
              ↓                     (→ Archived)
           Paused
              │
              ↓
           Failed / Cancelled
```

### Descrição dos Estados

| Estado | Quem define | Evento publicado |
|---|---|---|
| **Created** | Input Receiver ao receber requisição | `request.created` |
| **Queued** | Runtime ao enfileirar para execução | `request.queued` |
| **Planning** | Planner ao iniciar análise de intenção | `planner.started` |
| **Executing** | ExecutionEngine ao iniciar steps | `execution.started` |
| **Waiting** | Journey pausada aguardando input externo | `journey.paused` |
| **Paused** | Journey pausada por Human Approval | `security.approval.required` |
| **Retrying** | ExecutionEngine tentando re-executar step | `execution.step.retrying` |
| **Completed** | ExecutionEngine após último step bem-sucedido | `execution.completed` |
| **Failed** | Step required falhou sem possibilidade de retry | `execution.failed` |
| **Cancelled** | Usuário ou timeout cancelou a Journey | `journey.cancelled` |
| **Archived** | Journey moved para arquivo após período de inatividade | `journey.archived` |

### Transições Proibidas

- `Completed → Executing` — nunca; uma Journey completa não retrocede
- `Archived → Executing` — nunca; Journey arquivada é read-only
- `Failed → Completed` — nunca; use uma nova Journey

---

## Capítulo 4 — Event Flow

### Taxonomia de Eventos

Todos os eventos seguem o padrão: `{domínio}.{entidade}.{ação}`

### Sequência de Eventos em Execução Normal

```
request.created
  └→ context.built
       └→ identity.resolved
            └→ journey.created  (ou journey.resumed)
                 └→ planner.started
                      └→ planner.completed
                           └→ connector.selected
                                └→ security.evaluated
                                     └→ execution.started
                                          └→ execution.step.started
                                               └→ connector.executed
                                                    └→ memory.updated
                                                         └→ audit.recorded
                                                              └→ execution.step.completed
                                                                   └→ execution.completed
                                                                        └→ memory.promoted
                                                                             └→ response.generated
                                                                                  └→ journey.completed
```

### Catálogo de Eventos

| Evento | Origem | Consumidores | Prioridade |
|---|---|---|---|
| `request.created` | Input Receiver | ContextBuilder, AuditTrail | HIGH |
| `context.built` | ContextBuilder | JourneyManager | NORMAL |
| `identity.resolved` | IdentityResolver | JourneyManager, WorkingMemory | NORMAL |
| `journey.created` | JourneyManager | Planner, AuditTrail | HIGH |
| `journey.status.changed` | JourneyManager | AuditTrail, EventBus | HIGH |
| `planner.started` | Planner | AuditTrail | NORMAL |
| `planner.completed` | Planner | ExecutionEngine | NORMAL |
| `connector.selected` | Planner | ExecutionEngine | NORMAL |
| `security.evaluated` | SecurityGate | ExecutionEngine, AuditTrail | CRITICAL |
| `security.action.blocked` | SecurityGate | JourneyManager, AuditTrail | CRITICAL |
| `security.approval.required` | SecurityGate | JourneyManager | CRITICAL |
| `execution.started` | ExecutionEngine | AuditTrail, WorkingMemory | HIGH |
| `execution.step.started` | ExecutionEngine | AuditTrail | NORMAL |
| `execution.step.completed` | ExecutionEngine | WorkingMemory, AuditTrail | NORMAL |
| `execution.step.failed` | ExecutionEngine | AuditTrail, JourneyManager | HIGH |
| `execution.step.retrying` | ExecutionEngine | AuditTrail | NORMAL |
| `execution.completed` | ExecutionEngine | JourneyManager, LongTermMemory | HIGH |
| `execution.rolled_back` | ExecutionEngine | JourneyManager, AuditTrail | HIGH |
| `connector.executed` | ConnectorAdapter | AuditTrail | NORMAL |
| `memory.updated` | WorkingMemory | AuditTrail | LOW |
| `memory.promoted` | WorkingMemory | LongTermMemory | LOW |
| `audit.recorded` | AuditTrail | — (terminal) | LOW |
| `response.generated` | ResponseBuilder | JourneyManager | HIGH |
| `journey.completed` | JourneyManager | LongTermMemory, AuditTrail | HIGH |
| `journey.archived` | JourneyManager | AuditTrail | LOW |

---

## Capítulo 5 — Connector Execution

### Fluxo de Execução de um Connector

```
ExecutionEngine recebe PlanStep
         ↓
1. Verifica connector registrado
         ↓
2. Verifica healthCheck()
   → "down" → falha imediata (CONNECTOR_UNAVAILABLE)
   → "degraded" → tenta com timeout reduzido
   → "healthy" → continua
         ↓
3. SecurityGate.evaluate() — OBRIGATÓRIO
   → blocked → ConnectorResult { status: "failure", errorCode: "PERMISSION_DENIED" }
   → requiresApproval → Journey.pause() + aguarda evento
   → authorized → continua
         ↓
4. connector.execute(input, ctx) com timeout
   → AbortController ativo
   → ctx.timeoutMs respeita PlanStep.timeout
         ↓
5. Resultado:
   → "success" → WorkingMemory.store(), AuditTrail.record()
   → "failure" (required=true) → verifica retry
   → "failure" (required=false) → continua plano, loga warning
         ↓
6. Retry (se configurado):
   → backoff exponencial: 100ms, 200ms, 400ms
   → máximo 3 tentativas default
   → após max_retries → ROLLBACK (se isReversible)
         ↓
7. Rollback (se isReversible=true e step anterior falhou):
   → connector.rollback(previousState, ctx)
   → em ordem inversa dos steps executados
   → steps com isReversible=false são ignorados
         ↓
8. AuditTrail.record() em qualquer resultado
```

### Circuit Breaker (Padrão via healthCheck)

```
Requisições acumulam failures no ConnectorResult
    ↓
Após N failures consecutivos → marcar connector como "degraded"
    ↓
healthCheck() retorna "degraded" → ExecutionEngine usa fallback ou falha graciosamente
    ↓
Após período de espera → healthCheck() normaliza → retorna a "healthy"
```

---

## Capítulo 6 — Specialist Collaboration

### Seleção de Specialists

O Planner consulta todos os Specialists registrados via `specialist.canHandle(query)`:
1. Chama `canHandle()` em todos os Specialists (ordem de prioridade do registry)
2. Coleta candidatos onde `canHandle() === true`
3. Cria um PlanStep por Specialist candidato
4. ExecutionEngine executa em paralelo (se `parallel=true`) ou sequencial

### Pipeline Multi-Specialist

```
Planner analisa: "Preciso viajar para Lisboa — qual o melhor contrato de câmbio e seguro?"
        ↓
canHandle() returns true para:
  ├── TravelSpecialist    (keyword: "viajar", "Lisboa")
  ├── FinancialSpecialist (keyword: "câmbio", "contrato")
  └── LegalSpecialist     (keyword: "contrato", "seguro")
        ↓
ExecutionEngine cria PlanStep[] paralelos:
  ├── step-1: TravelSpecialist.process()     [parallel=true]
  ├── step-2: FinancialSpecialist.process()  [parallel=true]
  └── step-3: LegalSpecialist.process()      [parallel=true]
        ↓
Promise.all([step-1, step-2, step-3])
        ↓
Aggregator recebe SpecialistResult[] (confiança > 0.7)
        ↓
ResponseBuilder combina por relevância e confiança
        ↓
Resposta final contextualizada
```

### Critérios de Seleção

| Critério | Regra |
|---|---|
| `canHandle()` | Deve retornar `true` |
| `confidence` | Resultado com confidence < 0.5 é descartado |
| `domain` | Domains não conflitantes são combinados |
| Prioridade | Specialist mais específico prevalece sobre GeneralSpecialist |
| Fallback | Se nenhum Specialist aceita → GeneralSpecialist sempre aceita |

---

## Capítulo 7 — Memory Flow

### Fluxo de Dados na Memória

```
INPUT (texto, voz, arquivo)
        ↓
WorkingMemory.store()
  TTL: 1h default (NORMAL priority)
  Isolamento: identityContext
        ↓
Execution ocorre (Connectors, Specialists)
        ↓
Resultados → WorkingMemory.store()
  TTL: 30min default para resultados de execução
        ↓
Critérios de Promoção:
  • accessCount > 3 (dado foi acessado múltiplas vezes)
  • priority = "HIGH" ou "CRITICAL"
  • Explicitamente marcado via WorkingMemory.promote()
        ↓
LongTermMemory.store()
  Sem TTL
  Indexed para busca semântica futura
        ↓
KnowledgeNode criado/atualizado
  • confidence calculada por frequência de uso
  • relations detectadas automaticamente
        ↓
Recuperação futura via IKnowledgeProvider.search()
```

### Tiering de Memória

| Tier | Onde | TTL | Busca |
|---|---|---|---|
| **active** | WorkingMemory | 1h–4h | Direto por key |
| **historical** | LongTermMemory | 90 dias | Semântica |
| **archived** | LongTermMemory | Indefinido | Semântica + export |

---

## Capítulo 8 — Security Flow

### Pipeline Completo do SecurityGate

```
SecurityRequest { userId, sessionId, action, resource, estimatedImpact, isReversible }
        ↓
ETAPA 1 — Permission Check
  • Verifica se userId tem permissão para `action` em `resource`
  • Se não → { authorized: false, reason: "PERMISSION_DENIED" }
        ↓
ETAPA 2 — Risk Analysis
  • Calcula riskLevel: LOW | MEDIUM | HIGH | CRITICAL
  • Baseado em: estimatedImpact + isReversible + histórico
        ↓
ETAPA 3 — Policy Engine
  • Executa todas as IPolicy registradas em sequência
  • Se alguma retorna blocked=true → { authorized: false }
  • Se alguma retorna requiresApproval=true → pausa Journey
        ↓
ETAPA 4 — Human Approval Gate
  • Acionado quando: riskLevel=HIGH ou CRITICAL, ou requiresApproval=true
  • Journey.pause(reason="awaiting_human_approval")
  • Aguarda evento externo de aprovação
  • Timeout configurável (default 24h)
        ↓
ETAPA 5 — Execution (se authorized=true e !requiresApproval)
        ↓
ETAPA 6 — Audit (sempre, independente do resultado)
  • AuditTrail.record({ action, outcome: "success"|"failure"|"blocked" })
```

### Quando Bloquear

| Situação | Ação |
|---|---|
| Permission negada | Bloquear imediatamente, registrar audit |
| riskLevel=CRITICAL | Exigir aprovação humana |
| Policy bloqueou | Bloquear, registrar policyId no audit |
| riskLevel=HIGH + isReversible=false | Exigir aprovação humana |
| Máximo de tentativas bloqueadas no mesmo dia | Bloquear sessão temporariamente |

---

## Capítulo 9 — Error Flow

### Árvore de Decisão de Erros

```
ConnectorResult { status: "failure" }
        ↓
É VALIDATION_ERROR?
  → Sim → Retornar imediatamente (não tem retry)
  → Não → Continua ↓

É recuperável? (TIMEOUT, EXTERNAL_API_ERROR, CONNECTOR_DEGRADED)
  → Não → Vai para ROLLBACK
  → Sim → RETRY ↓

RETRY:
  retry < maxRetries?
    → Sim → backoff exponencial → tenta novamente
    → Não → esgotou tentativas → ROLLBACK ↓

ROLLBACK:
  step.isReversible?
    → Sim → connector.rollback(prev, ctx) em ordem inversa
    → Não → registra no audit "non-reversible step skipped"
  Todos os steps revertidos → Journey.status = "failed"
        ↓
HUMAN INTERVENTION:
  Journey.pause(reason="requires_human_intervention")
  Notificação enviada ao usuário
  Usuário pode: retomar, cancelar, ou escalar
        ↓
FAILURE FINAL:
  Journey.status = "failed"
  AuditTrail.record({ outcome: "failure", details: { errorCode, attempts } })
  EventBus.publish({ type: "execution.failed", priority: "HIGH" })
```

### Cenários de Erro Comuns

| Cenário | errorCode | Ação |
|---|---|---|
| Campo obrigatório ausente | `MISSING_FIELD` | Retorno imediato, sem retry |
| Serviço externo fora do ar | `CONNECTOR_UNAVAILABLE` | Retry 3x + fallback |
| Timeout na chamada | `TIMEOUT` | Retry com backoff |
| Permissão negada | `PERMISSION_DENIED` | Bloquear, sem retry |
| Aprovação necessária | `APPROVAL_REQUIRED` | Pausar Journey |
| Rollback falhou | `ROLLBACK_FAILED` | Alerta CRITICAL, intervenção humana |

---

## Capítulo 10 — Observabilidade

### Correlation ID

Cada requisição recebe um `correlationId` (UUID v4) na entrada. Ele é propagado para:
- `ExecutionContext.executionId`
- Todo `AuditRecord`
- Todo `BusEvent`
- Todo `JourneyEvent`
- Todo `ConnectorResult.resourceRef`

Isso permite reconstruir qualquer execução com: `audit.query({ correlationId })`

### Logs Estruturados

```typescript
// Formato padrão de log
{
  level:         "info" | "warn" | "error",
  timestamp:     "ISO-8601",
  correlationId: "uuid",
  component:     "ExecutionEngine",
  action:        "step.completed",
  stepId:        "step-1",
  duration:      120,    // ms
  outcome:       "success"
}
```

### Métricas Chave

| Métrica | Tipo | Target |
|---|---|---|
| `execution.duration_ms` | Histogram | p95 < 500ms |
| `connector.latency_ms` | Histogram | p95 < 300ms |
| `memory.store_ms` | Histogram | p95 < 10ms |
| `security.evaluate_ms` | Histogram | p95 < 5ms |
| `execution.success_rate` | Gauge | > 99% |
| `dlq.size` | Gauge | < 10 |
| `journey.active_count` | Gauge | monitorar |

### Health Checks

Cada componente expõe health check:
```typescript
GET /health
{
  status: "healthy" | "degraded" | "down",
  components: {
    workingMemory:   "healthy",
    eventBus:        "healthy",
    executionEngine: "healthy",
    auditTrail:      "healthy",
    securityGate:    "healthy",
  },
  uptime: 86400,
  version: "1.0.0"
}
```

### Dead Letter Queue

Eventos que falharam após 3 tentativas vão para DLQ:
```typescript
const dlq = eventBus.getDLQ();
// Investigar: dlq[i].type, dlq[i].error, dlq[i].attempts
await eventBus.replayDLQ();  // após correção
```

---

## Capítulo 11 — Reference Scenarios

### Cenário 1: Consulta de CPF

```
Input: "Qual a situação do CPF 123.456.789-00?"
        ↓
Context: sessionId=sess-001, userId=user-123, identityContext="pessoal"
        ↓
Journey: criada — "Consulta CPF 123.456.789-00"
        ↓
Planner: detecta intent="gov.cpf.query", seleciona GovernmentSpecialist
        ↓
Security: riskLevel=LOW → authorized=true
        ↓
Execution:
  step-1: GovernmentConnector.execute({ cpf: "123.456.789-00" })
    → healthCheck: healthy
    → timeout: 15s
    → resultado: { status: "regular", nome: "João Silva" }
        ↓
Memory: WorkingMemory.store("cpf:123.456.789-00:status", { status: "regular" })
        ↓
Audit: action="connector.execute", outcome="success"
        ↓
Response: "CPF 123.456.789-00 — Situação: Regular"
        ↓
Journey: completed
```

### Cenário 2: Reserva Aérea (Journey Longa)

```
Input: "Quero viajar para Lisboa em outubro"
        ↓
Journey: criada — "Reserva Lisboa Outubro"
        ↓
Planner: multi-step — 4 steps
  step-1: TravelSpecialist.process (pesquisa voos) [parallel]
  step-2: FinancialSpecialist.process (câmbio) [parallel]
  step-3: Promise.all([step-1, step-2])
  step-4: GovernmentConnector (documentação necessária)
        ↓
Security step-4: riskLevel=MEDIUM → authorized=true
        ↓
Execution:
  step-1 ✓ → 3 voos encontrados
  step-2 ✓ → cotação EUR/BRL = 6.20
  step-4 → aguarda step-3
        ↓
Journey: paused (aguarda seleção do usuário)
        ↓
[ Usuário seleciona voo ]
        ↓
Journey: resumed
        ↓
Security: riskLevel=HIGH (compra irreversível) → requiresApproval=true
        ↓
Journey: paused → Human Approval Gate
        ↓
[ Usuário confirma ]
        ↓
step-5: BookingConnector.execute() [isReversible=true, rollback disponível]
        ↓
Audit: action="booking.execute", outcome="success"
        ↓
Journey: completed — summary="Voo Lisboa confirmado: TP1234"
```

### Cenário 3: Análise de Contrato

```
Input: [PDF] "Analise este contrato de prestação de serviços"
        ↓
step-1: DocumentConnector.extract(pdf) → texto extraído
step-2: LegalSpecialist.process(texto) → cláusulas identificadas
step-3: FinancialSpecialist.process(texto) → valores e multas
        ↓
Aggregator: combina por confiança
  Legal confidence: 0.92 ✓
  Financial confidence: 0.88 ✓
        ↓
LongTermMemory: KnowledgeNode criado para "Contrato Prestação Serviços #001"
        ↓
Response: análise completa com cláusulas, riscos e valores
```

### Cenário 4: Envio de Documento (com Rollback)

```
Input: "Enviar proposta comercial para cliente@empresa.com"
        ↓
Security: riskLevel=HIGH (envio irreversível) → requiresApproval=true
        ↓
Journey: paused
[ Usuário aprova ]
        ↓
step-1: EmailConnector.execute() — falha após 3 tentativas (SMTP down)
        ↓
Rollback não necessário (envio falhou, nenhum side-effect)
        ↓
Journey: paused(reason="email_service_unavailable")
        ↓
Notificação: "Falha no envio. Tente novamente em 30 minutos."
```

### Cenário 5: Atualização de CRM

```
Input: "Atualizar status do cliente Acme para Ativo"
        ↓
Security: riskLevel=MEDIUM → authorized=true
        ↓
step-1: CRMConnector.execute({ clientId: "acme", status: "active" })
  isReversible=true → rollback guardará estado anterior
        ↓
Audit: action="crm.update", outcome="success", details={prev:"prospect", next:"active"}
        ↓
WorkingMemory: atualiza cache do cliente
LongTermMemory: registra evento "status_changed" na timeline
        ↓
Journey: completed
```

---

## Capítulo 12 — Sequence Diagrams

### Consulta Simples

```
User       Input   Context  Journey  Planner  Security  Execution  Memory  Audit
 │           │       │        │        │         │          │         │      │
 │──request→ │       │        │        │         │          │         │      │
 │           │─build→│        │        │         │          │         │      │
 │           │       │─load──→│        │         │          │         │      │
 │           │       │        │─plan──→│         │          │         │      │
 │           │       │        │        │─evaluate→         │          │      │
 │           │       │        │        │         │─execute─→│         │      │
 │           │       │        │        │         │          │─store──→│      │
 │           │       │        │        │         │          │         │─rec─→│
 │←response─ │       │        │        │         │          │         │      │
```

### Journey Longa com Pausa

```
User       Journey  Security  Execution  User(Approval)
 │           │        │          │              │
 │──input──→ │        │          │              │
 │           │─start─→│          │              │
 │           │        │─execute─→│              │
 │           │        │          │──high risk──→│
 │           │←paused─│          │              │
 │←awaiting─ │        │          │              │
 │           │        │          │        ←approve
 │           │─resume→│          │              │
 │           │        │─execute─→│              │
 │←completed─│        │          │              │
```

### Execução Paralela

```
Planner     ExecEngine   Specialist1  Specialist2  Aggregator
   │             │            │            │            │
   │──plan──────→│            │            │            │
   │             │──parallel─→│            │            │
   │             │────────────────────────→│            │
   │             │            │─result────→│            │
   │             │            │            │─result────→│
   │             │←──────────────combined──────────────│
```

### Rollback

```
ExecEngine  Step1  Step2  Step3(fail)
     │        │      │        │
     │──exec─→│      │        │
     │        │─ok──→│        │
     │        │      │──exec─→│
     │        │      │        │✗ failure
     │        │      │←rollback
     │        │←rollback      │
     │  all rolled back        │
```

---

## Capítulo 13 — Debugging Guide

### Onde Procurar por Problema

| Sintoma | Onde Investigar | O que buscar |
|---|---|---|
| Resposta incorreta | AuditTrail | `connector.execute` → `outputData` |
| Execução lenta | EventBus history | Latência entre eventos do mesmo correlationId |
| Step falhando | ExecutionEngine stepResults | `errorCode`, `attempts`, `auditLog` |
| Journey travada | JourneyManager | `journey.status`, último `JourneyEvent` |
| Memória desatualizada | WorkingMemory | TTL expirado? `accessCount`? |
| Connector fora do ar | HealthCheck | `connector.healthCheck()` → status |
| Eventos perdidos | DLQ | `eventBus.getDLQ()` → falhas acumuladas |

### Passo a Passo de Investigação

```bash
# 1. Identificar correlationId da requisição problemática
const records = audit.query({ userId: "user-123", since: timestamp });

# 2. Reconstruir pipeline pelo correlationId
const timeline = audit.query({ correlationId: "uuid-abc" });

# 3. Verificar Journey
const journey = journeyManager.get(journeyId);
console.log(journey.status, journey.events);

# 4. Verificar eventos do EventBus
const events = eventBus.getHistory({ since: timestamp });

# 5. Checar DLQ
const dlq = eventBus.getDLQ();

# 6. Verificar health dos connectors
const health = await connector.healthCheck();
```

### Checklist de Debugging

```
□ correlationId propagado em todos os logs?
□ AuditTrail contém todos os steps esperados?
□ EventBus contém sequência completa de eventos?
□ Journey.status é o esperado?
□ WorkingMemory não expirou dados críticos?
□ SecurityGate bloqueou alguma ação?
□ DLQ tem eventos acumulados?
□ Connector healthCheck retorna "healthy"?
```

---

## Capítulo 14 — Performance

### Execução Paralela

```typescript
// Steps independentes devem ser parallel=true
const plan: ExecutionPlan = {
  steps: [
    { stepId: "s1", connectorId: "specialist-a", parallel: true, ... },
    { stepId: "s2", connectorId: "specialist-b", parallel: true, ... },
    // s1 e s2 executam simultaneamente
    { stepId: "s3", connectorId: "aggregator", parallel: false, ... },
    // s3 aguarda s1 e s2
  ],
};
```

### Cache via WorkingMemory

```typescript
// Verificar cache antes de qualquer Connector externo
const cached = memory.get(`cpf:${cpf}:status`, identityContext);
if (cached && !isExpired(cached)) return cached;

// Executar e cachear
const result = await connector.execute({ cpf }, ctx);
await memory.store({ key: `cpf:${cpf}:status`, value: result, ttl: 300_000 }); // 5min
```

### Timeouts Recomendados

| Operação | Timeout | Notas |
|---|---|---|
| WorkingMemory | 1s | Nunca deve exceder |
| Specialist.process() | 5s | LLM pode ser lento |
| HTTP Connector | 30s | Depende do serviço |
| Gov Connector | 60s | Serviços públicos lentos |
| Journey total | 5min | Configurable |

### Lazy Loading

```typescript
// Não pré-carregar knowledge que pode não ser usado
// Carregar apenas quando Specialist.canHandle() === true
const knowledge = canHandle(query)
  ? ctx.knowledgeProvider.getByDomain(domain)
  : [];
```

### Backpressure

Quando o EventBus está sobrecarregado (queue > threshold):
1. Novas publicações de prioridade LOW são dropped
2. Novas publicações de prioridade NORMAL são enfileiradas
3. CRITICAL e HIGH sempre passam

---

## Capítulo 15 — Execution Principles

Estes princípios são **imutáveis** e se aplicam a toda implementação:

| # | Princípio | Regra |
|---|---|---|
| 1 | **Nenhuma execução sem Journey** | Toda requisição pertence a uma Journey ativa |
| 2 | **Nenhuma ação externa sem Security Gate** | `security.evaluate()` antes de todo Connector |
| 3 | **Nenhuma mutação sem Audit** | `audit.record()` para toda ação de escrita |
| 4 | **Nenhuma memória sem Identity Context** | `identityContext` em todo store/get |
| 5 | **Nenhuma evolução sem Evento** | Toda transição de estado publica evento |
| 6 | **Nenhuma resposta sem rastreabilidade** | `correlationId` propagado do início ao fim |
| 7 | **Nenhum Connector sem healthCheck** | Verificar antes de executar |
| 8 | **Nenhum rollback silencioso** | Toda tentativa de rollback é auditada |

---

## Capítulo 16 — Implementation Checklist

Toda implementação de feature que envolva execução deverá responder:

```
PIPELINE
□ O fluxo segue o pipeline oficial das 13 etapas?
□ Existe Journey para esta execução?
□ O correlationId é propagado por todos os componentes?

EVENTOS
□ Todos os eventos do catálogo são publicados?
□ As prioridades estão corretas (CRITICAL/HIGH/NORMAL/LOW)?
□ O DLQ está sendo monitorado?

SEGURANÇA
□ SecurityGate.evaluate() é chamado antes de toda ação externa?
□ Human Approval Gate está configurado para risco HIGH/CRITICAL?
□ Identity Context está sendo respeitado?

AUDITORIA
□ AuditTrail.record() para toda mutação?
□ correlationId no AuditRecord?
□ outcome registrado (success/failure/blocked)?

RESILIÊNCIA
□ Existe rollback para steps isReversible=true?
□ Existe timeout em toda chamada externa?
□ Existe retry com backoff exponencial?
□ Existe healthCheck no Connector?

OBSERVABILIDADE
□ Logs estruturados com correlationId?
□ Métricas sendo publicadas?
□ Health check endpoint disponível?

MEMÓRIA
□ WorkingMemory isolado por identityContext?
□ TTL configurado apropriadamente?
□ Promoção para LongTermMemory nos casos relevantes?

PERFORMANCE
□ Steps independentes estão em paralelo?
□ Cache via WorkingMemory antes de chamar Connectors?
□ Timeouts configurados por tipo de operação?
```

---

## Referências

| Documento | Relevância para MREM |
|---|---|
| MAS | Arquitetura do sistema |
| MRS | Runtime e ciclo de vida (fonte primária) |
| MCS | Core boundaries e interfaces |
| MPAR | APIs públicas utilizadas no pipeline |
| MDH | Engineering guide para implementação |
| MQCCS | Critérios de qualidade e certificação |
| MPEGS | Processo de evolução para este documento |

---

*MREM — MemoryOS Reference Execution Model v1.0 — Official — 2026-07-10*