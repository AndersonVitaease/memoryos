# RFC-005 — Watch Engine (Proactive Monitoring Layer)

**Status:** Accepted  
**Categoria:** New Epic  
**Prioridade:** High  
**Foundation:** v1.0  
**Data:** 2026-08-02  
**Autor:** MemoryOS Engineering  
**Rastreabilidade:** MES §21 (Eventos), MES §12 (Policy Engine), MES §4 (Pipeline Oficial), MEB EPIC-017

---

## Objetivo

Definir formalmente o **Watch Engine** como a camada de monitoramento proativo do MemoryOS — responsável por detectar mudanças de estado em fontes externas e internas, e disparar eventos ao sistema quando condições definidas pelo usuário são satisfeitas.

---

## Contexto

O MemoryOS é hoje um sistema **reativo** — responde a perguntas, executa tarefas, recupera memória. Não possui capacidade de **observação contínua** de estado externo.

Casos de uso que exigem monitoramento proativo:
- "Me avise quando o preço de X mudar"
- "Detecte novos emails de Y e processe automaticamente"
- "Monitore mudanças no Drive de uma pasta específica"
- "Alerta quando uma tarefa no Calendar estiver próxima do prazo"

Esses casos exigem:
1. Definição persistente de condições de monitoramento
2. Polling ou webhook de fontes externas via ConnectorRuntime
3. Avaliação de lógica booleana complexa (AND/OR/NOT recursivo)
4. Controle de estado de transição (somente disparar na mudança `false → true`)
5. Entrega garantida de eventos (sem perda em caso de falha)

---

## Princípio

> O Watch Engine **observa** o mundo externo em nome do usuário.  
> Ele nunca interpreta intenção — apenas verifica condições e notifica.  
> Todo disparo é rastreável, auditável e idempotente.

---

## Arquitetura Proposta

```
WatchIntent (input do usuário/Planner)
  ↓
WatchRegistry (persistência + validação + deduplicação)
  ↓
WatchScheduler (coordena execução por prioridade e frequência)
  ↓
WatchEvaluator (compila lógica booleana + executa via ConnectorGateway)
  ↓
StateTracker (detecta transição false → true)
  ↓
PendingActions (Durable Outbox — garantia de entrega)
  ↓
CognitiveEventBus (dispara WatchTriggered)
  ↓
Planner / Usuário
```

---

## Componentes Definidos

| Componente | Responsabilidade | Localização |
|---|---|---|
| `WatchRegistry` | CRUD de Watches, validação, deduplicação via KnowledgeGraph | `src/lib/watch-engine/WatchRegistry.ts` |
| `WatchScheduler` | Coordena execução, prioridade, frequência, batching | `src/lib/watch-engine/WatchScheduler.ts` |
| `WatchEvaluator` | Compila ConditionTree → função JS pura, executa pipeline | `src/lib/watch-engine/WatchEvaluator.ts` |
| `WatchStateTracker` | Mantém last_result, detecta transição de estado | `src/lib/watch-engine/WatchStateTracker.ts` |
| `ConnectorGateway` | Abstrai execução de providers com rate limiting (Token Bucket) | `src/lib/watch-engine/ConnectorGateway.ts` |
| `WatchOutbox` | Durable Outbox — persistência antes do disparo de evento | `src/lib/watch-engine/WatchOutbox.ts` |
| `WatchTypes` | Todos os tipos TypeScript imutáveis | `src/lib/watch-engine/WatchTypes.ts` |
| `watchEngineTests` | Suite MDS §2.16 — mínimo 10 cenários | `src/lib/watch-engine/watchEngineTests.ts` |

---

## Entidades Necessárias

| Entidade | Propósito |
|---|---|
| `Watch` | Definição persistente de uma condição de monitoramento |
| `WatchExecution` | Log de cada execução do Evaluator (auditoria) |
| `PendingWatchAction` | Outbox — ações pendentes de despacho ao EventBus |

---

## Contratos de Interface

### WatchIntent
```typescript
interface WatchIntent {
  name: string;
  description?: string;
  condition: ConditionTree;       // árvore booleana (AND/OR/NOT recursiva)
  frequency_minutes: number;      // intervalo de polling
  priority: "critical"|"high"|"normal"|"low";
  on_trigger: TriggerAction;      // o que fazer quando disparar
}
```

### ConditionTree (lógica booleana recursiva)
```typescript
type ConditionTree =
  | { op: "AND"; conditions: ConditionTree[] }
  | { op: "OR";  conditions: ConditionTree[] }
  | { op: "NOT"; condition: ConditionTree }
  | LeafCondition;

interface LeafCondition {
  provider: string;     // ex: "gmail", "drive", "calendar"
  action: string;       // ex: "count_unread", "get_price"
  params: Record<string, unknown>;
  comparator: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"contains"|"matches";
  value: unknown;
}
```

### CompiledWatch
```typescript
interface CompiledWatch {
  watchId: string;
  pipeline: ExecutionStep[];              // passos linearizados
  evaluate: (results: Record<string, unknown>) => boolean;
  compiledAt: number;
}
```

---

## Regras de Segurança

1. Todo Watch pertence a um `created_by_id` — nunca visível a outros usuários (RLS por padrão)
2. `ConnectorGateway` exige que o provider esteja autorizado antes de executar
3. `WatchEvaluator` nunca usa `eval()` — compila para função JS pura no momento de criação
4. Status `error` após 3 falhas consecutivas — Watch pausado automaticamente
5. `PendingWatchAction` nunca deletado antes do ACK do receptor

---

## Relação com Pipeline Oficial (MES §4)

O Watch Engine **não quebra** o pipeline oficial. Ele opera em paralelo, de forma assíncrona:
- Não intercepta conversas do usuário
- Dispara eventos no `CognitiveEventBus` → consumidos pelo Planner quando relevante
- O Planner pode criar Watches via `WatchRegistry` como parte de um `ExecutionPlan`

---

## Critérios de Aceitação

- [ ] `WatchRegistry.create()` valida e persiste um Watch simples (leaf condition)
- [ ] `WatchRegistry.create()` valida e persiste um Watch com ConditionTree AND/OR/NOT aninhado
- [ ] `WatchEvaluator.compile()` retorna `CompiledWatch` sem usar `eval()`
- [ ] `WatchEvaluator.evaluate()` retorna `true` apenas quando condição satisfeita
- [ ] `WatchStateTracker` só dispara `WatchTriggered` na transição `false → true`
- [ ] `WatchOutbox` persiste antes de disparar evento
- [ ] `ConnectorGateway` respeita rate limit (Token Bucket) por provider
- [ ] Circuit Breaker pausa execução após 3 falhas consecutivas de um provider
- [ ] Suite `watchEngineTests` passa com 10+ cenários
- [ ] MQCCS score ≥ 85%

---

## Referências

- `MES §4` — Pipeline Oficial
- `MES §21` — Eventos obrigatórios
- `MES §12` — Policy Engine
- `MEB EPIC-017` — Watch Engine no backlog oficial
- `ADR-012` — Watch Engine Architecture Decision
- `RFC-001` — Foundation v1.0 Baseline

---

*RFC-005 — Watch Engine — 2026-08-02 — Accepted*