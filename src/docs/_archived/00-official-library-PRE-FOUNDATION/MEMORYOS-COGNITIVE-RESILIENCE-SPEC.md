# MEMORYOS-COGNITIVE-RESILIENCE-SPEC.md
# MemoryOS — Arquitetura de Resiliência Cognitiva (v2.0)
**Sprint CRS-01 · Engineering First**
Date: 2026-08-01
Version: 2.0
Status: OFFICIAL

---

## 1. Princípio Fundamental

O MemoryOS não trata dados como registros estáticos, mas como **Observações Imutáveis** (`Evidence`, `Inference`, `Hypothesis`). O sistema é baseado em **Fail-Safe Architecture**: se o sistema não puder garantir a integridade de um dado ou a convergência de um raciocínio, ele deve travar (excecao) em vez de alucinar ou corromper o estado do usuário.

**Regra-mãe:** O sistema protege a *memória*. A qualidade do *raciocínio* é responsabilidade do Planner (Prompt Engineering).

---

## 2. O Ciclo de Vida da Informação (Knowledge Registry)

### 2.1. Escrita — Ingestão (Write Model)

Todo dado que entra no sistema passa obrigatoriamente pelo `Knowledge Registry` antes de qualquer leitura.

**Contrato mínimo de uma Observação (`ObservationSchema`):**

```json
{
  "id":              "obs-uuid-v4",
  "targetObjectId":  "kobj-uuid",
  "nature":          "Evidence | Inference | Hypothesis",
  "payloadType":     "string (chave do Schema Registry)",
  "data":            {},
  "dependencyIds":   ["obs-uuid-anteriores"],
  "contextScope":    "financeiro | rh | github | ...",
  "confidence":      0.0,
  "isRefuted":       false,
  "createdAt":       "ISO-8601",
  "producerId":      "engine-id ou user-id"
}
```

**Regras de Governança na Escrita:**

| Regra | Mecanismo | Erro Retornado |
|---|---|---|
| Schema-on-Write | Payload validado contra `schemas/{payloadType}.json` | `UnknownSchemaError` |
| Imutabilidade | Nenhum UPDATE. Correções geram nova observação com `isRefuted: true` na antiga | N/A (append-only) |
| Detecção de Ciclos | Busca em profundidade (DFS) no grafo de `dependencyIds` antes do commit | `CircularDependencyError` |
| Scope Obrigatorio | `contextScope` deve ser um valor registrado no `ScopeRegistry` | `UnknownScopeError` |

### 2.2. Leitura — Governança de Escopo (Read Model)

O acesso ao `StateView` é mediado por um `contextToken`. O Planner nunca lê o Registry diretamente.

```
Planner → [contextToken] → StateView Filter → KnowledgeObjectState
```

**Filtro aplicado:**
```
WHERE scope IN contextToken.authorizedScopes
  AND isRefuted = false
  AND status != 'archived'
```

Isso garante **isolamento de domínio**: um Planner do escopo `vendas` nunca vê dados do escopo `rh`, mesmo que estejam no mesmo banco.

---

## 3. O Fluxo de Sincronização (StateView)

O `StateView` é o **Read Model materializado** — a visão consolidada e otimizada para o Planner. Ele não é o banco de dados de observações; é uma projeção performática.

### 3.1. Fluxo Completo

```
[Nova Observacao]
       |
       v
[Registry] — Append-Only — valida Schema + Ciclo + Scope
       |
       v
[Event Buffer] — acumula ate 50 obs ou 10 segundos
       |
       v
[Fusion Engine] — le obs nao-refutadas, resolve conflitos
       |
       v
[StateView] — KnowledgeObjectState atualizado (Read Model)
       |
       v
[Planner] — le StateView (fast) + Merge pontual (critical)
```

### 3.2. Gatilho de Sincronizacao (Batch-Processing)

O Registry usa **Gatilho em Lote** por motivos de eficiência:

- Disparo: a cada **10 segundos** OU a cada **50 observações** acumuladas (o que vier primeiro).
- Vantagem: sem picos de carga; o Planner raramente opera em dados com mais de 10s de atraso.
- Aceito: para perguntas conversacionais simples, 10s de consistência eventual é imperceptível.

### 3.3. Acesso Híbrido (Latência Inteligente)

O Planner controla o nível de consistência baseado no risco da ação:

| Tipo de Acao | Modo de Leitura | Latencia Esperada |
|---|---|---|
| Resposta conversacional | `StateView` disponivel (Dirty Read) | ~200ms |
| Acao critica (escrita, pagamento, decisao) | `StateView` + Merge de pendentes (Strict Read) | ~1.5s a 2s |

---

## 4. Política de Poda Cognitiva (Cognitive Pruning)

Sem poda, o sistema acumula "lixo cognitivo" que polui o raciocínio e degrada a performance ao longo do tempo.

### 4.1. Poda de Hipóteses (TTL)

- **Regra:** Observações do tipo `HYPOTHESIS` que não forem confirmadas por uma `EVIDENCE` dentro de **X dias** (configurável por domínio) são movidas automaticamente para o status `archived`.
- **Efeito:** Saem do `StateView` e param de influenciar o Planner. Permanecem auditáveis no Registry.

### 4.2. Janela de Memória de Trabalho (StateView Purge)

- **Regra:** O `StateView` mantém apenas o **estado atual** + **histórico dos últimos 30 dias**.
- **Efeito:** Observações fora dessa janela são movidas para *Cold Storage* (entidade Base44 de baixa prioridade `ObservationArchive`). Não são deletadas; apenas removidas da visão ativa do Planner.

### 4.3. Gestão de Conflitos (Conflict Resolution Protocol)

Conflitos são a ameaca mais grave à integridade cognitiva.

```
[EVIDENCE A: pagamento=feito] + [EVIDENCE B: pagamento=nao_feito]
                         |
                         v
              [CONFLICT_ALERT gerado]
                         |
                         v
         [Planner recebe ForbiddenActionException]
         ate que [RESOLUTION_OBSERVATION] seja escrita
```

- **CONFLICT_ALERT:** É uma observação de natureza especial gerada automaticamente pelo `Fusion Engine` quando duas `EVIDENCE` com `targetObjectId` idêntico e `payloadType` idêntico apresentam valores contraditórios.
- **Bloqueio:** Enquanto o `CONFLICT_ALERT` existir, qualquer Planner que tentar ler aquele `KnowledgeObject` para uma ação critica recebe `ForbiddenActionException: UnresolvedConflict`.
- **Resolução:** Uma `RESOLUTION_OBSERVATION` (com referência ao `CONFLICT_ALERT`) deve ser escrita por um agente ou usuário autorizado.

---

## 5. Estratégia de Resiliência (Fail-Safe Mechanisms)

### 5.1. Circuit Breaker (Anti-FeedbackLoop)

- **Monitoramento:** O Registry rastreia a taxa de escrita por `targetObjectId` em janelas de 60 segundos.
- **Gatilho:** Se um único objeto receber mais de **N escritas** em 60s (N configurável), o Registry emite `FeedbackLoopDetected` e bloqueia novas escritas naquele objeto por 30s.
- **Propósito:** Prevenir que motores entrem em loop de auto-reescrita (um motor lê o estado, discorda, escreve, relê, discorda novamente, infinitamente).

### 5.2. Default Knowledge (Open World Assumption)

- **Regra:** O estado `NULL` ou ausência de observação é interpretado como `UNKNOWN`, nunca como `false` ou `empty`.
- **Instrucao de Planner (System Prompt obrigatorio):**
  > "Se o StateView de um KnowledgeObject retornar NULL ou nenhuma observacao para um campo, trate como DESCONHECIDO. Nao infira, nao assuma, nao complete. Declare explicitamente que nao ha informacao suficiente."

---

## 6. Tabela de Contratos Consolidados

| Componente | Responsabilidade | Restricoes |
|---|---|---|
| `Knowledge Registry` | Persistencia imutavel de observacoes | Append-Only, Schema-on-Write, DAG check |
| `Fusion Engine` | Gera `StateView` a partir de observacoes | Nao escreve no Registry; apenas le |
| `StateView` | Read Model performatico para o Planner | Janela de 30 dias, filtrado por scope |
| `Planner` | Raciocinio e tomada de decisao | Le via StateView com contextToken; nunca acessa Registry direto |
| `CONFLICT_ALERT` | Bloqueio de acoes em objetos conflitantes | Bloqueia leituras criticas ate resolucao |
| `Cognitive Pruning` | Remocao de hipoteses vencidas e dados frios | Nao deleta; apenas arquiva |

---

## 7. Restricoes de Implementacao

1. **Nenhum modulo pode escrever diretamente no banco** — toda escrita passa pelo `Knowledge Registry`.
2. **Nenhum modulo pode ler observacoes brutas** — toda leitura passa pelo `StateView` com `contextToken`.
3. **O `Fusion Engine` e read-only** — ele nunca gera observacoes; apenas projeta.
4. **`CONFLICT_ALERT` nao pode ser invalidado diretamente** — apenas uma `RESOLUTION_OBSERVATION` o neutraliza.
5. **Schemas devem ser versionados** — `schemas/payment_status_v1.json`, `schemas/payment_status_v2.json`. Schemas antigos sao mantidos para auditoria de observacoes historicas.

---

## 8. Historico de Versoes

| Versao | Data | Descricao |
|---|---|---|
| 1.0 | 2026-07-11 | Definicao inicial: Epistemic Triad, dual-store strategy |
| 1.5 | 2026-07-21 | Observation Schema, CQRS sync strategy, namespace patterns |
| **2.0** | **2026-08-01** | **Cognitive Resilience: Pruning, Circuit Breaker, Conflict Protocol, Scoped Reading** |

---

*CRS-01 · 2026-08-01 · Status: OFFICIAL*