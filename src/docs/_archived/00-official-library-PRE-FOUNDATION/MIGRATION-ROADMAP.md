# MIGRATION-ROADMAP.md
# MemoryOS — Plano de Migração Arquitetural
**Sprint ARC-01 · Engineering First**
Date: 2026-07-11
Type: Plano de Migração
Status: OFFICIAL

---

## Princípios do Plano

1. **Nenhuma funcionalidade do produto pode ser perdida.**
2. **Nenhuma regressão funcional é aceitável.**
3. **Cada fase é individualmente reversível.**
4. **Caminho crítico (usuário → resposta) nunca bloqueado.**
5. **Código legado removido apenas após substituto validado em produção.**

---

## Mapa de Fases

```
ATUAL          FASE 1       FASE 2       FASE 3       FASE 4       FASE 5       FASE 6
(hoje)         INT-02       INT-03       INT-04       INT-05       INT-06       INT-07
               ↓            ↓            ↓            ↓            ↓            ↓
               Intent       Goal         Capability   Context      Knowledge    Conversation
               Layer        Runtime      Runtime      Engine       Engine       Engine
```

---

## Fase 1 — Intent Layer Integration

**Sprint:** INT-02
**Módulo EF:** EF-22 (Intent Layer v1.0)
**Dependências:** Nenhuma (primeiro módulo a entrar)

### Objetivo
Substituir `interpretIntent()` em `memoryPipeline.js` pela Intent Layer determinística.
Eliminar a primeira chamada LLM (InvokeLLM #1 — intent classification).

### O que muda
- `interpretIntent(question)` → `IntentLayer.detect(message)`
- Contrato de saída mantido: `{ query_types, is_list_query, search_keywords }`
- Fallback mantido: se Intent Layer falhar, `interpretIntent()` atua como fallback (existente)

### O que NÃO muda
- Queries paralelas ao banco (`queryEntities`) — inalteradas
- `buildContext()` dentro de memoryPipeline — inalterado
- Contrato de saída de `runMemoryPipeline()` — inalterado
- ChatPage — inalterado

### Impacto
- **Latência:** redução de ~500-1500ms (elimina 1 chamada LLM)
- **Qualidade:** Intent Layer determinística é mais previsível que LLM
- **Risco:** Baixo — fallback para LLM se Intent Layer falhar

### Rollback
Reverter import de `IntentLayer.detect` para `interpretIntent()` em `memoryPipeline.js`. Uma linha.

### Critério de aprovação
- Queries paralelas continuam retornando os mesmos tipos de entidades
- Nenhuma resposta de qualidade inferior detectada
- Latência média reduzida

---

## Fase 2 — Goal Runtime Integration

**Sprint:** INT-03
**Módulo EF:** EF-01 (Goal Runtime v0.1 → v1.0 via EF-24) + EF-06 (Decision Engine)
**Dependências:** Fase 1 concluída. EF-24 (Goal Runtime v1.0) disponível.

### Objetivo
Substituir `detectGoal()` (keyword matching) pelo Goal Runtime formal.
Substituir `detectCapabilities()` + lógica `hasEnoughInfo` pelo Decision Engine.

### O que muda
- `detectGoal(userMsg)` → `GoalRuntime.createFromMessage(userMsg)`
- Contrato mantido: resultado compatível com `{ id, label, strategy, type, priority }`
- `detectCapabilities()` + `hasEnoughInfo` → `DecisionEngine.decide(goal, memory)`
- CognitivePipelineAdapter muda de fire-and-forget para semi-bloqueante (apenas Goal creation)

### O que NÃO muda
- SpecialistRouter (recebe o mesmo objeto Goal)
- CapabilityOrchestrator (ainda ativo — Fase 3 o substitui)
- Contrato de saída de `runReasoningPlan()` — inalterado
- ChatPage — inalterado

### Impacto
- **Goal tracking:** Goals agora têm ciclo de vida formal (registry, histórico)
- **Decision quality:** Decisão sobre capabilities com estrutura EF (confidence, risk)
- **Risco:** Médio — Goal Runtime v0.1 tem 21 cenários (menor que os outros módulos)

### Rollback
Reverter para `detectGoal()` e `detectCapabilities()` nos arquivos de origem. Dois arquivos.

### Critério de aprovação
- SpecialistRouter continua funcionando com o novo Goal object
- Decision Engine retorna capabilities compatíveis com o que CapabilityOrchestrator esperava
- Goal Runtime não adiciona latência perceptível ao path crítico

### Pré-requisito arquitetural
Goal Runtime deve ser promovido de v0.1 para v1.0 (EF-24) antes desta fase. Adicionar `GoalRuntimeTypes.ts` separado e elevar cenários de 21 para 28.

---

## Fase 3 — Capability Runtime Integration

**Sprint:** INT-04
**Módulo EF:** EF-15 (Capability Runtime v2.0) + EF-14 (Capability Registry — consolidação)
**Dependências:** Fase 2 concluída. EF-15 completo. EF-16 Connector Registry disponível para consolidar os 4 registries paralelos.

### Objetivo
Substituir `CapabilityOrchestrator` pelo Capability Runtime oficial.
Consolidar os 3 Capability Registries paralelos em EF-14.

### O que muda
- `orchestrateCapabilities()` → `CapabilityRuntime.execute(plan)`
- `executeCapabilities()` → interno ao Capability Runtime
- 3 Capability Registries paralelos → único EF-14
- `detectService()` + `getConnectorsForService()` → conectores via Connector Runtime (se EF-16 disponível) ou permanecem como estão

### O que NÃO muda
- Contrato de entrada do Context Builder (recebe capabilityResults no mesmo formato)
- Lógica de needsMoreInfo (movida para dentro do Capability Runtime)
- ChatPage — inalterado

### Impacto
- **Capabilities:** execução formal com Types, lifecycle e logging
- **Registry consolidation:** elimina 3 implementações paralelas
- **Risco:** Alto — EF-15 está parcial; testCount=0 no atual; consolidação de 3 registries é complexa

### Rollback
Reverter import de `CapabilityRuntime` para `orchestrateCapabilities()` em `memoryReasoningPlanner.js`. Um arquivo.

### Critério de aprovação
- Web search, calculation, official_library e documents continuam funcionando
- Resultados de capabilities chegam ao Context Builder no mesmo formato
- Nenhuma regressão nos Specialists

### Pré-requisitos arquiteturais
1. EF-15 completo com testCount > 0 e cenários formais
2. Consolidação dos 3 Capability Registries antes do merge
3. Decisão documentada sobre destino dos 4 Connector Registries (EF-16)

---

## Fase 4 — Context Engine + Reflection Engine

**Sprint:** INT-05
**Módulo EF:** EF-20 (Context Engine) + EF-08 (Reflection Engine)
**Dependências:** Fases 1-3 concluídas. EF-20 disponível.

### Objetivo
Substituir `buildReasoningContext()` pelo Context Engine.
Substituir `synthesizeResponse()` pela etapa SYNTHESIS do Reflection Engine.
Incorporar queries paralelas do memoryPipeline no Context Engine.

### O que muda
- `buildReasoningContext(params)` → `ContextEngine.build(params)`
- Queries paralelas de `runMemoryPipeline` → `ContextEngine.query(intent, sessionId, projectId)`
- `synthesizeResponse(rawResponse)` → `ReflectionEngine.evaluate(rawResponse, plan)`
- `runMemoryPipeline()` torna-se apenas um wrapper delegando para ContextEngine

### O que NÃO muda
- Conteúdo do prompt gerado (mesmo sistema de memória, mesmo estilo de resposta)
- ChatPage — inalterado
- Entidades Base44 consultadas (mesmas queries, mesmos filtros)

### Impacto
- **Contexto:** montagem formal com Types EF
- **Reflexão:** avaliação estruturada de cada resposta (confidence, verdict)
- **Risco:** Alto — Context Engine é EF-20 (não existe ainda); Reflection Engine existe mas sem integração real

### Rollback
Reverter `ContextEngine.build()` para `buildReasoningContext()` e `ReflectionEngine.evaluate()` para `synthesizeResponse()`. Dois arquivos.

### Critério de aprovação
- Qualidade das respostas mantida ou melhorada
- Reflection Engine não adiciona latência > 100ms
- Nenhuma regressão no sistema de Specialists

### Pré-requisitos arquiteturais
EF-20 (Context Engine v1.0) deve ser implementado antes desta fase.

---

## Fase 5 — Knowledge Engine + Memory Engine

**Sprint:** INT-06
**Módulo EF:** EF-10 (Knowledge Engine) + EF-12 (Memory Engine) + EF-11 (Learning Engine)
**Dependências:** Fase 4 concluída.

### Objetivo
Substituir `processConversationBatch()` como produtor direto de entidades.
Knowledge Engine como validador antes da persistência.
Memory Engine como storage formal de memórias aprovadas.

### O que muda
- `processConversationBatch()` continua fazendo extração via LLM
- Output do LLM → Knowledge Engine para validação
- Knowledge Engine aprovado → Memory Engine → entidades Base44
- Legado `memory-engine/` (47 arquivos JS) deprecado

### O que NÃO muda
- Entidades Base44 como storage final (Message, KnowledgeEntity, Decision, Task, Topic)
- Lógica de extração LLM (CONVERSATION_SCHEMA) — inalterada
- `shouldProcessBatch()` trigger — inalterado
- ChatPage — inalterado

### Impacto
- **Knowledge quality:** validação formal antes de persistência
- **Memory lifecycle:** ciclo de vida formal (PENDING → APPROVED → STORED)
- **Risco:** Médio — entidades Base44 continuam sendo o destino real; apenas o caminho muda

### Rollback
Reverter para bulkCreate direto em `processConversationBatch()`. Um arquivo.

### Critério de aprovação
- Mesmas entidades criadas (KnowledgeEntity, Decision, Task, Topic, Keyword)
- Nenhuma perda de dados de conhecimento
- Learning Engine recebe corretamente os Knowledge aprovados

---

## Fase 6 — Conversation Engine (Finalização)

**Sprint:** INT-07
**Módulo EF:** EF-21 (Conversation Engine v1.0)
**Dependências:** Fases 1-5 concluídas.

### Objetivo
Transformar `runReasoningPlan()` em Conversation Engine oficial.
Remover `CognitivePipelineAdapter` (scaffold INT-01).
Unificar gestão de sessão no Conversation Engine.

### O que muda
- `runReasoningPlan()` → `ConversationEngine.process()`
- `getOrCreateActiveSession()` → `ConversationEngine.getOrCreateSession()`
- `CognitivePipelineAdapter.execute()` removido
- ChatPage importa ConversationEngine em vez de runReasoningPlan + conversationEngine

### O que NÃO muda
- Interface do ChatPage com o usuário — completamente inalterada
- Entidades Base44
- Todos os módulos EF integrados nas fases anteriores

### Impacto
- **Arquitetura completa:** pipeline EF operacional de ponta a ponta
- **Legado removido:** runReasoningPlan, CognitivePipelineAdapter, cognitive-engine legado
- **Risco:** Baixo — todos os componentes já foram integrados nas fases anteriores; esta fase apenas reorganiza o ponto de entrada

### Rollback
Reverter import de ConversationEngine para runReasoningPlan em ChatPage. Uma linha.

### Critério de aprovação
- Toda a funcionalidade do chat preservada
- Todos os módulos EF (EF-01 a EF-22) operacionais no path real
- CognitivePipelineAdapter removido sem regressão

---

## Fase 7 — LLM Gateway (Opcional — EF-23)

**Sprint:** INT-08
**Módulo EF:** EF-23 (LLM Gateway v1.0)
**Dependências:** Fase 6 concluída.

### Objetivo
Encapsular todas as chamadas `base44.integrations.Core.InvokeLLM()` atrás de um Gateway isolado.
Adicionar circuit breaker, fallback de provider e logging centralizado.

### O que muda
- `base44.integrations.Core.InvokeLLM()` → `LLMGateway.invoke()`
- Gateway gerencia provider selection, retry, logging
- Produto desacopla-se de base44.integrations diretamente

### Impacto
- **Isolamento de dependência:** troca de provider sem alterar produto
- **Observabilidade:** todas as chamadas LLM logadas em um lugar
- **Risco:** Baixo — mudança de interface, não de comportamento

---

## Resumo de Fases

| Fase | Sprint | Módulo EF | O que substitui | Risco | Rollback |
|---|---|---|---|---|---|
| 1 | INT-02 | EF-22 Intent Layer | interpretIntent() — elimina InvokeLLM #1 | Baixo | 1 linha |
| 2 | INT-03 | EF-24 + EF-06 | detectGoal() + detectCapabilities() | Médio | 2 arquivos |
| 3 | INT-04 | EF-15 + EF-14 | CapabilityOrchestrator completo | Alto | 1 arquivo |
| 4 | INT-05 | EF-20 + EF-08 | buildReasoningContext() + synthesizeResponse() | Alto | 2 arquivos |
| 5 | INT-06 | EF-10 + EF-12 | processConversationBatch() produtor direto | Médio | 1 arquivo |
| 6 | INT-07 | EF-21 | runReasoningPlan() + CognitivePipelineAdapter | Baixo | 1 linha |
| 7 | INT-08 | EF-23 | InvokeLLM() direto | Baixo | 1 arquivo |

---

## Critérios de Aprovação Geral

### A arquitetura atual permite convergência?

**SIM.** O produto atual tem estrutura modular compatível. Cada componente tem ponto de entrada e saída bem definidos. Contratos são substituíveis individualmente.

### Quais módulos já estão prontos para integração?

| Módulo | Estado | Pronto para integração? |
|---|---|---|
| Reflection Engine (EF-08) | Certificado | SIM — Fase 4 |
| Knowledge Engine (EF-10) | Certificado | SIM — Fase 5 |
| Memory Engine (EF-12) | Certificado | SIM — Fase 5 |
| Retrieval Engine (EF-13) | Certificado | SIM — parte da Fase 4 |
| Capability Registry (EF-14) | Certificado | SIM — Fase 3 (com consolidação) |

### Quais módulos precisam apenas de integração?

| Módulo | O que falta |
|---|---|
| Goal Runtime (EF-01) | Promover v0.1 → v1.0 (EF-24) + GoalRuntimeTypes.ts |
| Goal Registry (EF-02) | GoalRegistryServiceTypes.ts separado |
| Decision Engine (EF-06) | Integração com contrato do CapabilityOrchestrator |
| Planning Engine (EF-07) | Redefinição de semântica de "plano" no produto |

### Quais módulos precisam de refatoração antes da integração?

| Módulo | Refatoração necessária |
|---|---|
| Capability Runtime (EF-15) | testCount=0 → cenários formais obrigatórios |
| Capability Registry | Consolidar 3 implementações paralelas |
| Connector Registry | Consolidar 4 implementações paralelas (EF-16) |

### Quais módulos devem permanecer como estão?

| Módulo | Motivo |
|---|---|
| `detectSkills()` | Sem substituto EF; candidato EF-25 |
| `SpecialistRouter` | Specialists de conhecimento != Capabilities EF |
| Entidades Base44 | Storage permanente — EF produz, Base44 armazena |
| `useVoicePipeline` | Camada de UI sem equivalente EF |
| `ingestKnowledge` | Pipeline de ingestão sem equivalente EF |

---

## Pré-requisitos Arquiteturais Antes de Qualquer Fase

Antes de iniciar Fase 1, os seguintes itens devem estar documentados e decididos:

1. **EF-15 Capability Runtime v2.0** — sprint EF-15 obrigatória antes de INT-04
2. **EF-16 Connector Registry** — consolidação dos 4 registries antes de INT-04
3. **EF-22 Intent Layer** — implementação obrigatória antes de INT-02
4. **EF-24 Goal Runtime v1.0** — upgrade de v0.1 antes de INT-03
5. **EF-20 Context Engine** — implementação obrigatória antes de INT-05
6. **EF-21 Conversation Engine** — implementação obrigatória antes de INT-07

---

*Sprint ARC-01 — 2026-07-11 — Engineering First*
*Nenhum código foi criado ou modificado.*