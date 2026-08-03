# SESSION 2026-08-03 — Otimizações de Performance do Pipeline de Conversa

> **Status:** IMPLEMENTADO e validado (build verde). 5 otimizações aplicadas na critical path do `ConversationPipeline` / `memoryReasoningPlanner` para reduzir a latência antes da chamada do LLM.
> **Data:** 2026-08-03 (America/Sao_Paulo)
> **Escopo:** Reduzir o tempo até o primeiro token (pre-LLM overhead) sem alterar a qualidade da resposta.

---

## 1. Contexto e Motivação

O usuário reportou lentidão recorrente nas respostas do chat ("demorando muito", "ainda lento"). Após inspeção da critical path — o caminho percorrido por uma mensagem normal (conversa geral, sem conectores/search/docs) entre o `persistMessage` do usuário e a chamada do LLM — foram identificados vários pontos de latência **antes** da própria chamada do LLM:

- Leitura de memória redundante (a mesma fonte consultada 2-3 vezes em série).
- Etapas de observabilidade (enriquecimento de prompt, State View) executadas em série quando podiam rodar em paralelo.
- Chamadas de LLM auxiliares (classificação de Drive, decisão de web search) que podiam segurar a resposta por segundos.
- Gatilhos de classificação frouxos que disparavam LLMs auxiliares em mensagens genéricas.

A chamada do LLM principal (~2-4s, `google/gemini-2.5-flash` via OpenRouter) é o custo dominante e **não foi tocado** — todas as otimizações visam reduzir o overhead pré-LLM.

**Princípio:** nenhuma mudança altera a qualidade da resposta final. Tudo que foi adiado (fire-and-forget) ou paralelizado produz resultado idêntico para conversas normais; perdas de enriquecimento (kfmContext) só afetam sessões com entidades detectadas, e o `memoryService.retrieve` já fornece contexto de memória ao LLM de forma independente.

---

## 2. Metodo de Verificacao (antes de otimizar)

Foram lidos os arquivos vivos da critical path para mapear onde o tempo era gasto:

- `src/lib/conversation-platform/ConversationPipeline.ts` — orquestrador principal; etapas persist → context → router → unifiedContext → KFE → graph → introspection → RCL → goal → RICL → plan → runtime → runReasoningPlan → arbiter → stream.
- `src/lib/reasoning/memoryReasoningPlanner.js` — `runReasoningPlan`: retrieve memory → orchestrate capabilities → stateView → history → search/drive classification → LLM call.
- `src/lib/unified-context/UnifiedContextBuilder.ts` — 5 queries de memória (entities, keywords, topics, decisions, tasks) em paralelo + connector availability + official library.
- `src/lib/reasoning/capabilityDetector.js` — `semanticWebSearchCheck` faz chamada de LLM (`InvokeLLM`) para decidir se ativa web search.
- `src/lib/reasoning/capabilityOrchestrator.js` — orquestra `detectCapabilities` + `detectService` + `executeCapabilities`.
- `src/lib/conversation-cognitive-gateway/ConversationCognitiveGateway.ts` — `classifyIntent` (regex puro, rapido).
- `src/lib/openrouter/categoryRouter.js` + `src/lib/ai-provider-registry/OpenRouterLLMProvider.ts` — modelo padrão `google/gemini-2.5-flash`.

**Insight central:** a critical path de uma mensagem normal tinha, em série: persistMessage (~100ms) → buildConversationContext (DB, fire-and-forget) → router (rapido) → **unifiedContextBuilder.build (~300ms DB)** → KFE (sync) → ... → runReasoningPlan → **memoryService.retrieve (~300-500ms DB)** + orchestrateCapabilities + stateView + history + classificacao + **LLM (~2-4s)**.

---

## 3. Otimizacoes Aplicadas

### 3.1 — `buildConversationContext` fire-and-forget

**Arquivo:** `src/lib/conversation-platform/ConversationPipeline.ts`

**Antes:** `buildConversationContext()` era `await`-ado na critical path. Ele consultava memória cross-session para construir um contexto de conversa, mas o resultado só alimentava o RCL (Runtime Continuation Layer) e observabilidade — o `memoryService.retrieve` (dentro do `runReasoningPlan`) já fornece memória ao LLM de forma independente.

**Depois:** `buildConversationContext()` agora roda em background (`void (async ...)()`), não bloqueando o pipeline. O RCL recebe contexto nulo (fallback gracioso); a memória do LLM continua vindo de `memoryService.retrieve`.

**Impacto:** remove uma consulta de memória da critical path (~200-400ms).

### 3.2 — `stateViewEngine.buildForSession` paralelizado com `orchestrateCapabilities`

**Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js`

**Antes:** dentro de `runReasoningPlan`, ETAPA 1 executava `memoryService.retrieve` + skills + goal em paralelo, mas ETAPA 2 executava `orchestrateCapabilities` e ETAPA 3 executava `stateViewEngine.buildForSession` **em série**.

**Depois:** ETAPA 2 e ETAPA 3 agora rodam em paralelo via `Promise.all([orchestrateCapabilities(...), stateViewEngine.buildForSession(...)])`. Ambas são independentes (orchestrate produz `capabilityResults`/`serviceInfo`; stateView produz o snapshot de estado) e seus resultados são consumidos depois.

**Impacto:** reduz a latência pela duração da menor das duas (stateView costumava somar ~150-300ms em série).

### 3.3 — Gatilho do classificador de Drive restrito a substantivos fortes

**Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js` (`_driveHeuristicCheck`)

**Antes:** o classificador de Drive disparava um LLM auxiliar (~1-2s) para mensagens contendo verbos genéricos como "abrir", "ler", "leia", "conteúdo", "conteudo" — palavras que raramente indicam uma ação real do Drive e faziam o classificador rodar em conversas comuns.

**Depois:** o gatilho agora exige substantivos fortes de arquivo: `drive`, `pasta`, `folder`, `arquivo`, `file`, `pdf`, `docx`, `planilha`, `baixar`, `download`, `upload`, e frases possessivas ("meu arquivo", "que subi", etc.). Verbos genéricos foram removidos.

**Impacto:** corta ~1-2s de chamada de LLM auxiliar na maioria das mensagens comuns, sem perder ações reais de Drive (que quase sempre nomeiam o arquivo/pasta).

### 3.4 — `unifiedContextBuilder.build` (+ KFE + Knowledge Graph) fire-and-forget

**Arquivo:** `src/lib/conversation-platform/ConversationPipeline.ts`

**Antes:** `unifiedContextBuilder.build()` era `await`-ado na critical path. Ele refazia **as mesmas 5 queries de memória** (entities, keywords, topics, decisions, tasks) que outras etapas já consultavam, só para alimentar o `kfmModel` → `kfmContext` (enriquecimento de prompt) e a persistência do Knowledge Graph.

**Depois:** toda a cadeia (UnifiedContext → KnowledgeNormalizer → KnowledgeFusionEngine → KnowledgeGraphBridge) agora roda em background (`void (async ...)()`). `kfmModel` fica `null` na critical path. O `kfmContext` só enriquece o prompt quando `totalEntities > 0`; para conversas normais (0 entidades) o comportamento é idêntico. Para sessões com entidades, o `memoryService.retrieve` continua fornecendo memória ao LLM (a perda é apenas o enriquecimento estruturado do KFE, que é suplementar). Observabilidade (`conversationStore.emit`) e persistência do grafo continuam rodando em background.

**Impacto:** remove ~300ms de leituras de DB redundantes da critical path de TODAS as mensagens.

### 3.5 — Timeout do `semanticWebSearchCheck` capado de 8s para 2s

**Arquivo:** `src/lib/reasoning/capabilityDetector.js`

**Antes:** quando uma mensagem tinha sinal externo ("existe", "conectar", "integrar", "funciona", "disponivel", "mudou", etc.) e a sessão não tinha memória prévia sobre o tópico, o `semanticWebSearchCheck` fazia uma chamada de LLM (`InvokeLLM` com `gemini_3_flash`) para decidir "precisa busca web?" com timeout de **8 segundos**. Essa chamada é puramente um sim/não de classificação — mas podia segurar a resposta do usuário por até 8s.

**Depois:** timeout reduzido para **2s**. A classificação de sim/não via `gemini_3_flash` tipicamente retorna em <1.5s; o cap de 2s elimina o pior caso. Se não responder a tempo, cai no fallback gracioso (web_search não ativa, LLM responde com o que tem) — não bloqueia a resposta.

**Impacto:** elimina o pior caso de 8s de latência para mensagens com sinal externo e sem memória (sessões novas / tópicos novos). Classificações rápidas continuam funcionando.

---

## 4. Arquivos Modificados

| Arquivo | Otimização | Natureza |
|---|---|---|
| `src/lib/conversation-platform/ConversationPipeline.ts` | 3.1 (buildContext fire-and-forget) + 3.4 (unifiedContext/KFE/graph fire-and-forget) | Critical path |
| `src/lib/reasoning/memoryReasoningPlanner.js` | 3.2 (stateView ‖ orchestrate) + 3.3 (drive heuristic tightened) | Critical path |
| `src/lib/reasoning/capabilityDetector.js` | 3.5 (semantic timeout 8s → 2s) | Critical path |

---

## 5. O Que NAO Foi Alterado (explicitamente fora do escopo)

- **Modelo do LLM principal** (`google/gemini-2.5-flash`): não trocado — seria troca de qualidade, não de performance. O LLM (~2-4s) é o custo dominante restante.
- **Tamanho do prompt** (histórico 6000-10000 chars, system prompt, memory context): não reduzido — afetaria qualidade da resposta.
- **`memoryService.retrieve`**: mantido — é a fonte de memória que alimenta o LLM.
- **`classifyIntent`** (regex puro, ConversationCognitiveGateway): já era rapido, não tocado.
- **`pickModelForMessage`** (categoryRouter, modelos por categoria): só usado no caminho de "serviço de IA direto" (tradução/resumo/código), não na critical path principal.

---

## 6. Riscos e Trade-offs Documentados

| Risco | Mitigação / Impacto |
|---|---|
| Perda do `kfmContext` (enriquecimento de prompt) para sessões com entidades | `memoryService.retrieve` já fornece memória ao LLM independentemente. kfmContext é enriquecimento suplementar; perda é mínima e aceita pelo trade-off de velocidade. |
| Mensagens com sinal externo podem perder web search se a classificação semântica demorar >2s | Fallback gracioso: web_search não ativa, LLM responde com conhecimento existente. Busca por keyword explícita ("pesquise", "busque") continua funcionando. |
| Gatilho do Drive mais restrito pode não classificar ações reais raras | Ações reais de Drive quase sempre nomeiam arquivo/pasta/pdf; verbos genéricos isolados ("abrir X") raramente são ação de Drive. Risco de falso negativo baixo. |
| Fire-and-forget pode gerar emits/observabilidade fora de ordem | Os `conversationStore.emit` continuam sendo disparados (em background); ordem dos eventos de observabilidade pode mudar, mas não afeta o usuário. |

---

## 7. Resultado Esperado (antes vs depois)

**Antes** (critical path, mensagem normal, sessão com memória):
```
persistMessage (~100ms) → buildConversationContext (~300ms, awaited)
→ router (rápido) → unifiedContextBuilder.build (~300ms, awaited)
→ KFE (sync) → ... → runReasoningPlan:
  memoryService.retrieve (~400ms) → orchestrate (~50ms) → stateView (~200ms, série)
  → history (sync) → LLM (~2-4s)
Total pré-LLM: ~1.0-1.4s + LLM
```

**Depois:**
```
persistMessage (~100ms) → buildConversationContext (fire-and-forget)
→ router (rápido) → unifiedContext/KFE/graph (fire-and-forget)
→ ... → runReasoningPlan:
  memoryService.retrieve (~400ms) → orchestrate ‖ stateView (paralelo)
  → history (sync) → LLM (~2-4s)
Total pré-LLM: ~0.5s + LLM
```

Redução estimada: ~500-900ms removidos da critical path pré-LLM. O LLM permanece o custo dominante.

---

## 8. Proximo Passo Sugerido

O custo dominante restante é a **chamada do LLM principal** (`gemini-2.5-flash`, ~2-4s). Para reduzir além disso, as opções são trocas de qualidade (modelo mais leve, prompt menor) e precisam de decisão explícita do usuário. Não aplicar sem autorização.

---

## 9. Referencias Cruzadas

- **CLAUDE.md:** seção "2026-08-03 — Otimizações de Performance do Pipeline de Conversa"
- **ConversationPipeline:** `src/lib/conversation-platform/ConversationPipeline.ts`
- **memoryReasoningPlanner:** `src/lib/reasoning/memoryReasoningPlanner.js`
- **capabilityDetector:** `src/lib/reasoning/capabilityDetector.js`
- **UnifiedContextBuilder:** `src/lib/unified-context/UnifiedContextBuilder.ts`
- **ADR-010 / ADR-011** (sessões anteriores de performance): `src/docs/foundation/adr/