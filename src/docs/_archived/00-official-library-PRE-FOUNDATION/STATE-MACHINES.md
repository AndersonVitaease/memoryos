# STATE-MACHINES.md
# MemoryOS — Máquinas de Estado Oficiais
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## 1. Goal State Machine

```
                    ┌──────────┐
                    │  PENDING  │◄─────────────────────────────────────────┐
                    └────┬──────┘                                          │
                         │ activate()                                       │
                         ▼                                                  │
                    ┌──────────┐                                            │
                    │  ACTIVE   │─────────────── timeout ──────────────► FAILED
                    └────┬──────┘
                    ┌────┴────┐────────────────────────────────────────┐
                    │         │                                         │
                    ▼         ▼                                         ▼
              ┌──────────┐ ┌──────────┐                          ┌──────────┐
              │COMPLETED │ │  FAILED  │                          │CANCELLED │
              └──────────┘ └──────────┘                          └──────────┘
```

| Estado | Descrição | Transições de entrada | Transições de saída |
|---|---|---|---|
| `PENDING` | Goal criado, aguardando ativação | createGoal() | activate() → ACTIVE |
| `ACTIVE` | Goal em execução | activate() | complete() → COMPLETED, fail() → FAILED, cancel() → CANCELLED, timeout → FAILED |
| `COMPLETED` | Goal concluído com sucesso | complete() | — (terminal) |
| `FAILED` | Goal falhou ou expirou | fail(), timeout | — (terminal) |
| `CANCELLED` | Goal cancelado explicitamente | cancel() | — (terminal) |

**Timeout padrão:** 300s para Goals interativos, 3600s para Goals background.
**Rollback:** FAILED → cleanup de resources alocados. CANCELLED → rollback de side effects reversíveis.

---

## 2. Execution State Machine

```
                    ┌──────────────┐
                    │  NOT_STARTED  │
                    └──────┬────────┘
                           │ dispatch()
                           ▼
                    ┌──────────────┐
                    │   QUEUED     │◄─── retry (se FAILED e retryable)
                    └──────┬───────┘
                           │ dequeue()
                           ▼
                    ┌──────────────┐
                    │  PROCESSING  │──────── timeout ─────────────────► TIMED_OUT
                    └──────┬───────┘
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
             ┌──────────┐    ┌──────────────┐
             │COMPLETED │    │    FAILED    │─── retryable? ──► QUEUED
             └──────────┘    └──────────────┘
                                    │
                                    └── not retryable ──► ABORTED
```

| Estado | Owner | Max Duração |
|---|---|---|
| `NOT_STARTED` | Execution Dispatcher (EF-05) | N/A |
| `QUEUED` | Goal Execution Queue (EF-04) | 600s |
| `PROCESSING` | Capability Runtime (EF-15) | definido no ExecutionPlan |
| `COMPLETED` | — terminal | — |
| `FAILED` | — | — |
| `TIMED_OUT` | — terminal | — |
| `ABORTED` | — terminal (max retries) | — |

---

## 3. Planning State Machine

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │ plan()
                           ▼
                    ┌──────────────┐
                    │   CREATED    │──────── invalid input ──► INVALID
                    └──────┬───────┘
                           │ execute()
                           ▼
                    ┌──────────────┐
                    │    ACTIVE    │──────── timeout ─────────► FAILED
                    └──────┬───────┘
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
             ┌──────────┐    ┌──────────────┐
             │COMPLETED │    │    FAILED    │
             └──────────┘    └──────────────┘
```

**Imutabilidade:** Um `ExecutionPlan` no estado `CREATED` é completamente imutável. Nenhum campo pode ser alterado após criação. A transição CREATED → ACTIVE é apenas uma atualização de status em runtime, não altera o plano.

---

## 4. Capability State Machine

```
                    ┌──────────────┐
                    │     DRAFT    │
                    └──────┬───────┘
                           │ validate()
                           ▼
                    ┌──────────────┐
                    │  VALIDATED   │
                    └──────┬───────┘
                           │ register()
                           ▼
                    ┌──────────────┐
                    │  REGISTERED  │──────── deprecate() ────► DEPRECATED
                    └──────┬───────┘
                           │ activate()
                           ▼
                    ┌──────────────┐
                    │    ACTIVE    │──────── deprecate() ────► DEPRECATED
                    └──────────────┘
```

**Por instância de execução:**

```
IDLE ──► EXECUTING ──► SUCCEEDED
                  └──► FAILED ──► RETRYING ──► EXECUTING (retry loop)
                  └──► TIMED_OUT
```

---

## 5. Connector State Machine

```
                    ┌──────────────┐
                    │ UNREGISTERED │
                    └──────┬───────┘
                           │ register()
                           ▼
                    ┌──────────────┐
                    │  REGISTERED  │
                    └──────┬───────┘
                           │ connect()
                           ▼
                    ┌──────────────┐
              ┌────►│  CONNECTED   │◄──── reconnect()
              │     └──────┬───────┘
              │            │ disconnect() / auth_expired
              │            ▼
              │     ┌──────────────┐
              └─────┤DISCONNECTED  │
                    └──────┬───────┘
                           │ fail() (max retries)
                           ▼
                    ┌──────────────┐
                    │    FAILED    │──────► alert + manual intervention
                    └──────────────┘

Por execução de ação:
IDLE ──► EXECUTING ──► SUCCESS
                  └──► RATE_LIMITED ──► WAITING ──► EXECUTING
                  └──► AUTH_FAILED ──► DISCONNECTED
                  └──► TIMEOUT ──► FAILED
```

---

## 6. Knowledge State Machine

```
                    ┌──────────────┐
                    │   PENDING    │ (avaliação ainda não chegou)
                    └──────┬───────┘
                           │ extract()
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
             ┌──────────┐    ┌──────────────┐
             │  ACTIVE  │    │   REJECTED   │ (score insuficiente)
             └────┬─────┘    └──────────────┘
                  │
             ┌────┴────┐
             │         │
             ▼         ▼
        ┌─────────┐ ┌──────────────┐
        │ARCHIVED │ │  SUPERSEDED  │ (nova versão disponível)
        └─────────┘ └──────────────┘
```

---

## 7. Learning State Machine

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │ learn()
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
             ┌──────────┐    ┌──────────────┐
             │  ACTIVE  │    │   REJECTED   │ (Knowledge fraco)
             └────┬─────┘    └──────────────┘
                  │ (learningScore >= 70 → Memory Gate passa)
             ┌────┴─────────────┐
             │                  │
             ▼                  ▼
        ┌─────────┐      ┌──────────────┐
        │ARCHIVED │      │  SUPERSEDED  │
        └─────────┘      └──────────────┘
```

**Memory Gate:** ACTIVE + learningScore >= 70 → triggers memory.stored.v1 event.

---

## 8. Memory State Machine

```
                    ┌──────────────┐
                    │  [Learning]  │ (input)
                    └──────┬───────┘
                           │ store() — Memory Gate check
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
             ┌──────────┐    ┌──────────────┐
             │  ACTIVE  │    │   REJECTED   │ (score < 70)
             └────┬─────┘    └──────────────┘
                  │ archive() (explícito)
                  ▼
             ┌──────────┐
             │ ARCHIVED │
             └──────────┘
```

**Princípio:** Memory não tem UPDATE. Arquivamento é a única transição após ACTIVE. Objeto é Object.freeze() em runtime.

**Imutabilidade total:** Nenhum campo de uma Memory ACTIVE pode ser modificado. Não existe transição UPDATE.

---

## 9. Conversation State Machine

```
                    ┌──────────────┐
                    │    ACTIVE    │◄─── nova mensagem
                    └──────┬───────┘
                           │ inactivity (> 24h sem mensagem)
                           ▼
                    ┌──────────────┐
                    │  HISTORICAL  │◄─── pode ser reativado por nova mensagem
                    └──────┬───────┘
                           │ explicit archive()
                           ▼
                    ┌──────────────┐
                    │   ARCHIVED   │ (terminal)
                    └──────────────┘
```

**Transições reversíveis:** HISTORICAL → ACTIVE (nova mensagem).
**Transição irreversível:** ARCHIVED (terminal).

---

## 10. Session State Machine

```
                    ┌──────────────┐
                    │    ACTIVE    │◄─── nova mensagem
                    └──────┬───────┘
                           │ inactivity (> 2h) ou nova sessão criada
                           ▼
                    ┌──────────────┐
                    │  HISTORICAL  │
                    └──────┬───────┘
                           │ parent Conversation archived
                           ▼
                    ┌──────────────┐
                    │   ARCHIVED   │ (terminal)
                    └──────────────┘
```

---

## Timeouts por Módulo

| Módulo | Operação | Timeout Padrão | Ação no Timeout |
|---|---|---|---|
| Goal Runtime | Goal lifetime (interativo) | 300s | FAILED |
| Goal Runtime | Goal lifetime (background) | 3600s | FAILED |
| Goal Execution Queue | Entry na fila | 600s | REMOVED |
| Capability Runtime | Execução de Capability | definido no manifest | TIMED_OUT |
| Connector Runtime | Ação de Connector | definido no manifest | TIMEOUT |
| Reflection Engine | Reflection | 30s | INCONCLUSIVE |
| Retrieval Engine | Query | 5s | FAILED |
| LLM Gateway | LLM call | 60s | FAILED |

---

## Retry Policies

| Módulo | Estratégia | Max Retries | Backoff |
|---|---|---|---|
| Goal Scheduler | Exponential | 3 | 100ms base |
| Execution Dispatcher | Linear | 2 | 500ms |
| Capability Runtime | Definida no manifest | manifest.retryPolicy | manifest.retryPolicy |
| Connector Runtime | Definida no manifest | manifest.retryPolicy | manifest.retryPolicy |
| Memory Engine | Exponential | 3 | 200ms base |
| Knowledge Engine | Exponential | 3 | 100ms base |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- DOMAIN-MODEL.md
- OFFICIAL-CONTRACTS.md
- EVENT-CATALOG.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*