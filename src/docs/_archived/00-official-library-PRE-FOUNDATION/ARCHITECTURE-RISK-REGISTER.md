# ARCHITECTURE-RISK-REGISTER.md
# MemoryOS — Registro de Riscos Arquiteturais
**Sprint ARC-02 · Engineering First**
Date: 2026-07-11
Type: Risk Register
Status: OFFICIAL

> Baseado em: AUDIT-Sprint0, PRODUCT-FLOW-MAPPING, ARCHITECTURE-VALIDATION-REPORT.
> Riscos ordenados por severidade (Impacto × Probabilidade).

---

## Escala de Avaliação

**Impacto:** CRÍTICO (produto para) · ALTO (funcionalidade degradada) · MÉDIO (qualidade reduzida) · BAIXO (técnico sem efeito visível)

**Probabilidade:** ALTA (> 70%) · MÉDIA (30-70%) · BAIXA (< 30%)

**Severidade:** CRÍTICO = Impacto CRÍTICO + Prob. ALTA/MÉDIA

---

## Riscos Críticos

### RC-01 — Pipeline EF desconectado do produto em produção

**Risco:** Os 14 módulos EF certificados existem apenas como unidades de teste isoladas. Nenhum está ativo no fluxo do produto. O CognitivePipelineAdapter (INT-01) é fire-and-forget e não afeta respostas.

**Impacto:** CRÍTICO — A arquitetura Engineering First não gera valor ao produto enquanto desconectada. Investimento de 329 cenários certificados sem retorno operacional.

**Probabilidade:** ALTA — Estado atual confirmado por PRODUCT-FLOW-MAPPING §9.

**Evidência:** `ChatPage.jsx:73` — `pipelineAdapter.execute().catch(() => {})` — falha silenciosa, não afeta resposta.

**Recomendação:** Iniciar INT-02 (Intent Layer) como primeira integração real. É a de menor risco e maior impacto imediato.

---

### RC-02 — Triplicação de Capability Registry bloqueia EF-15

**Risco:** Existem 3 implementações paralelas de Capability Registry. Capability Runtime (EF-15) usa sua própria cópia interna em vez do EF-14 oficial. Sem consolidação, EF-15 não pode ser integrado corretamente no produto.

**Impacto:** CRÍTICO — EF-15 (Capability Runtime) é o substituto do CapabilityOrchestrator. Sem ele, INT-04 não pode ser executada. A integração de capabilities no pipeline EF fica bloqueada.

**Probabilidade:** ALTA — Confirmado por AUDIT-Sprint0 §5.1 e ARCHITECTURE-VALIDATION-REPORT §2.10.

**Evidência:** `src/lib/capability-runtime/CapabilityRegistry.ts` existe como duplicata de `src/lib/capability-registry/CapabilityRegistry.ts` (EF-14).

**Recomendação:** Consolidar antes de EF-15. Definir `src/lib/capability-registry/` como canonical único. Remover `src/lib/capability-runtime/CapabilityRegistry.ts`.

---

### RC-03 — Intent Layer ausente bloqueia convergência real

**Risco:** Intent Layer (EF-22) é o primeiro elo entre a UI de chat e o pipeline EF. Sem ela, o pipeline EF continua recebendo goals apenas via fire-and-forget, sem poder influenciar a resposta real ao usuário.

**Impacto:** CRÍTICO — Todas as integrações INT-02 em diante dependem de Intent Layer para tornar o pipeline EF bloqueante no path crítico.

**Probabilidade:** ALTA — Intent Layer não existe no codebase. Precisa ser criada do zero.

**Evidência:** Nenhum arquivo `intent-layer/` existe no codebase. Confirmado por AUDIT-Sprint0 §4.

**Recomendação:** EF-22 deve ser implementado antes de INT-02. É o desbloqueador central.

---

## Riscos Altos

### RA-01 — Quadruplicação de Connector Registry

**Risco:** Existem 4+ implementações de Connector Registry. O produto usa `src/lib/connectors/registry.js` (não contabilizado nas 4 do AUDIT-Sprint0 — um quinto arquivo). EF-16 planeja consolidação, mas sem cronograma definido.

**Impacto:** ALTO — Connector Runtime não pode ser integrado sem Connector Registry consolidado. Qualquer desenvolvimento de novos conectores pode criar mais duplicatas se o canonical não for declarado.

**Probabilidade:** MÉDIA — EF-16 está no roadmap mas não iniciado.

**Evidência:** `src/lib/connectors/registry.js` referenciado em `capabilityOrchestrator.js`. Separado das 4 implementações do AUDIT-Sprint0.

**Recomendação:** Declarar `src/lib/connectors/registry.js` como canonical temporário até EF-16. Congelar crescimento dos outros 4.

---

### RA-02 — Memory Engine legado (47 arquivos JS) coexistindo com EF-12

**Risco:** `src/lib/memory-engine/` (47 arquivos) e `src/lib/memory-engine-v1/` (EF-12) coexistem com nomes similares. Nenhum está ativo no produto. Qualquer desenvolvimento futuro pode acidentalmente usar o legado em vez do oficial.

**Impacto:** ALTO — Contribuições futuras podem reativar código legado sem perceber. Aumenta a probabilidade de regressão durante INT-06.

**Probabilidade:** MÉDIA — O produto atual não usa nenhum dos dois, então impacto imediato é baixo. Risco cresce com INT-06.

**Evidência:** AUDIT-Sprint0 §5.4. PRODUCT-FLOW-MAPPING confirma que o produto usa persistência direta.

**Recomendação:** Declarar `src/lib/memory-engine-v1/` como canonical. Marcar `src/lib/memory-engine/` como deprecated no próximo sprint editorial.

---

### RA-03 — Goal Runtime em v0.1 (sub-certificado)

**Risco:** Goal Runtime v0.1 tem 21 cenários. Todos os módulos que dependem dele (Registry, Scheduler, Dispatcher, Queue) têm 22-28 cenários. O módulo fundacional tem menos cobertura que seus dependentes.

**Impacto:** ALTO — Se Goal Runtime for integrado no produto como v0.1, bugs na criação/ciclo de vida de Goals afetam todos os módulos downstream.

**Probabilidade:** MÉDIA — v0.1 pode ser funcional para os casos de uso de INT-03, mas sem garantia formal de cobertura completa.

**Evidência:** AUDIT-Sprint0 §2 — Goal Runtime v0.1 com 21 cenários. EF padrão: 28.

**Recomendação:** Promover para v1.0 (EF-24) antes de INT-03. Adicionar `GoalRuntimeTypes.ts` e 7 cenários adicionais.

---

### RA-04 — Semântica divergente de "Plano"

**Risco:** O objeto `plan` em `runReasoningPlan()` é analytics (`{ skills, sourcesCount, responseTimeMs }`). O `ExecutionPlan` do Planning Engine é executável (`{ steps[], complexity, risk }`). Se INT-03 introduz Planning Engine sem resolver essa divergência, o produto terá dois objetos chamados `plan` com semânticas incompatíveis.

**Impacto:** ALTO — Confusão de API; possível erro silencioso se código usar o `plan` errado para decidir behavior.

**Probabilidade:** MÉDIA — A divergência é conhecida (DAP-03), mas pode ser ignorada na implementação sem cuidado.

**Evidência:** `memoryReasoningPlanner.js:178-191` vs `PlanningEngineTypes.ts`.

**Recomendação:** Resolver DAP-03 antes de INT-03. Renomear objeto analytics para `executionMetrics`.

---

## Riscos Médios

### RM-01 — Capability Runtime sem cenários EF formais

**Risco:** `capabilityRuntimeTests.ts` existe mas auditoria automática retornou `testCount=0`. Não está claro se há cenários de aceitação formais ou apenas testes informais.

**Impacto:** MÉDIO — Se EF-15 não tem cobertura formal, a substituição do CapabilityOrchestrator pode introduzir regressões não detectadas em INT-04.

**Probabilidade:** MÉDIA — testCount=0 pode ser falso negativo da auditoria (estrutura diferente) ou pode indicar ausência real.

**Evidência:** AUDIT-Sprint0 §3 — Capability Runtime, testCount retorna 0.

**Recomendação:** Resolver DAP-04 — auditar manualmente antes de planejar INT-04.

---

### RM-02 — `runMemoryPipeline()` com 3 responsabilidades viola SRP

**Risco:** `runMemoryPipeline()` faz: (1) intent detection via LLM, (2) queries paralelas ao banco, (3) montagem de contexto estruturado. Quando Context Engine (EF-20) for criado, qual parte do `runMemoryPipeline()` ele substitui? A ambiguidade pode causar substituição parcial incorreta.

**Impacto:** MÉDIO — Risco de substituição incompleta em INT-05; parte do processamento pode ficar duplicada.

**Probabilidade:** MÉDIA — A separação está documentada em ARC-01, mas a implementação pode errar os boundaries.

**Evidência:** `src/lib/memoryPipeline.js` — confirmado em PRODUCT-FLOW-MAPPING §1 e ARCHITECTURE-VALIDATION-REPORT §2.16.

**Recomendação:** Definir boundaries exatos de EF-20 antes de INT-05: `ContextEngine` recebe intent pronta + produz contexto final; não faz intent detection.

---

### RM-03 — `processConversationBatch()` sem coordenação com Knowledge Engine

**Risco:** processConversationBatch extrai conhecimento via LLM e persiste diretamente nas entidades Base44 sem validação. Quando Knowledge Engine (EF-10) for integrado, haverá período em que dois produtores gravam nas mesmas entidades.

**Impacto:** MÉDIO — Possível duplicação de KnowledgeEntity, Decision, Task, Topic durante o período de transição da Fase 5.

**Probabilidade:** BAIXA — A Fase 5 trata exatamente disto, mas sem plano de migração dos dados existentes.

**Recomendação:** Fase 5 deve incluir strategy de deduplicação para dados já existentes nas entidades.

---

### RM-04 — Sidebar com 59+ itens sem separação produto/engenharia

**Risco:** Interface de produto e interface de engenharia coexistem na mesma sidebar sem distinção. Usuários finais veem itens como "Goal Runtime", "Execution Dispatcher", "FCE — Compliance" junto com "Chat" e "Memória".

**Impacto:** MÉDIO — Experiência de produto degradada; confusão para usuários não-técnicos.

**Probabilidade:** ALTA — Estado atual confirmado por AUDIT-Sprint0 §5.5.

**Evidência:** `src/components/layout/Sidebar.jsx` — 59 itens sem agrupamento.

**Recomendação:** Separar em dois modos: `/app/*` (produto) e `/eng/*` (engenharia). Não bloqueia v2.0 arquitetural.

---

### RM-05 — Entidades redundantes: ChatMessage/Message e Conversation/ChatSession

**Risco:** Existem duas entidades que parecem duplicadas: `ChatMessage` e `Message`; `Conversation` e `ChatSession`. O produto usa `Message` e `ChatSession`. `ChatMessage` e `Conversation` podem ser legados.

**Impacto:** MÉDIO — Se código futuro usar `ChatMessage` em vez de `Message`, dados ficam fragmentados. Não há constraint arquitetural impedindo isso.

**Probabilidade:** BAIXA — O produto atual usa consistentemente `Message` e `ChatSession`.

**Evidência:** AUDIT-Sprint0 §7 — ChatMessage e Conversation marcados como "possivelmente redundantes".

**Recomendação:** Confirmar desuso e deprecar `ChatMessage` e `Conversation` em sprint editorial.

---

## Riscos Baixos

### RB-01 — GoalRegistryService sem arquivo de Types separado

**Impacto:** BAIXO — Tipos inline são funcionais. Viola padrão EF mas não bloqueia integração.

**Probabilidade:** ALTA — Confirmado por AUDIT-Sprint0 §5.7.

**Recomendação:** Criar `GoalRegistryServiceTypes.ts` em sprint editorial antes de EF-24.

---

### RB-02 — Módulos legados sem destino documentado

`connector-simulator` (14 arquivos), `enterprise-integration` (13 arquivos), `autonomous-executive-engine` (5 arquivos), `universal-event-bus` (14 arquivos) existem sem plano de migração ou deprecação.

**Impacto:** BAIXO — Não são usados pelo produto. Aumentam o noise no codebase.

**Probabilidade:** ALTA — Sem plano, continuarão existindo indefinidamente.

**Recomendação:** Sprint editorial para declarar destino formal de cada um.

---

### RB-03 — `base44.analytics.track()` acoplado ao objeto `plan` legado

**Impacto:** BAIXO — Analytics usa `plan.*` (goal, skills, sourceCount). Se `plan` for renomeado (DAP-03), analytics quebra silenciosamente.

**Probabilidade:** MÉDIA — Depende da resolução de DAP-03.

**Evidência:** `memoryReasoningPlanner.js:194-209` — `base44.analytics.track({ eventName: "mrp_reasoning_executed", properties: { goal: plan.goal, ... } })`.

**Recomendação:** Resolver DAP-03 antes de INT-03; atualizar analytics junto com a renomeação.

---

## Resumo Priorizado

| # | Risco | Severidade | Fase Afetada |
|---|---|---|---|
| RC-01 | Pipeline EF desconectado | CRÍTICO | Todas |
| RC-02 | Triplicação Capability Registry | CRÍTICO | INT-04 |
| RC-03 | Intent Layer ausente | CRÍTICO | INT-02 |
| RA-01 | Quadruplicação Connector Registry | ALTO | INT-04+ |
| RA-02 | Memory Engine legado coexistindo | ALTO | INT-06 |
| RA-03 | Goal Runtime em v0.1 | ALTO | INT-03 |
| RA-04 | Semântica divergente de "Plano" | ALTO | INT-03 |
| RM-01 | Capability Runtime sem cenários EF | MÉDIO | INT-04 |
| RM-02 | runMemoryPipeline com 3 responsabilidades | MÉDIO | INT-05 |
| RM-03 | processConversationBatch sem coordenação | MÉDIO | INT-06 |
| RM-04 | Sidebar 59 itens sem separação | MÉDIO | Produto |
| RM-05 | Entidades redundantes | MÉDIO | Dados |
| RB-01 | GoalRegistryServiceTypes ausente | BAIXO | EF-24 |
| RB-02 | Módulos legados sem destino | BAIXO | Qualidade |
| RB-03 | analytics acoplado a plan legado | BAIXO | INT-03 |

---

*Sprint ARC-02 — 2026-07-11 — Engineering First*
*Nenhuma alteração foi realizada.*