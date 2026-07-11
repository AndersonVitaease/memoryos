# ARCHITECTURE-DECISION-LOG.md
# MemoryOS — Registro de Decisões Arquiteturais Pendentes
**Sprint ARC-02 · Engineering First**
Date: 2026-07-11
Type: Decision Log
Status: OFFICIAL — AWAITING HUMAN APPROVAL

> Este documento contém apenas decisões que exigem aprovação humana.
> Não contém recomendações de implementação.
> Cada item é apresentado com contexto, alternativas, vantagens e desvantagens.
> Nenhuma decisão foi tomada neste documento.

---

## DAP-01 — Estratégia de Classificação da Intent Layer

**Contexto:**
A Intent Layer (EF-22) precisa classificar a intenção do usuário e determinar `query_types`, `is_list_query` e `search_keywords`. A implementação atual (`interpretIntent()`) usa uma chamada LLM completa para isso. A arquitetura EF propõe Intent Layer determinística.

**Evidência no código:**
`src/lib/memoryPipeline.js:55` — `interpretIntent()` chama `base44.integrations.Core.InvokeLLM()` com INTENT_SCHEMA, com fallback por keyword splitting.

**Alternativa A — Determinística pura (regras + keyword matching):**
- Como funciona: padrões de regex + tabela de keywords mapeiam mensagem para `query_types`
- Vantagens: zero latência, zero custo de LLM, 100% previsível, testável offline
- Desvantagens: menor cobertura semântica; mensagens ambíguas ou pouco comuns podem ser mal classificadas; manutenção manual das regras

**Alternativa B — Híbrida (determinística com fallback LLM):**
- Como funciona: classificador determinístico tenta primeiro; se confidence < threshold, chama LLM
- Vantagens: performance no caso comum; qualidade no caso difícil; mesma cobertura que hoje
- Desvantagens: latência variável; custo variável; dois caminhos a manter

**Alternativa C — LLM com cache:**
- Como funciona: mantém LLM como classificador, mas adiciona cache por hash de mensagem normalizada
- Vantagens: qualidade preservada; latência reduzida em mensagens repetidas
- Desvantagens: cache invalida com mudanças de schema; custo em novas mensagens; não é determinístico

**Recomendação técnica:** apresentada sem decisão — escolher Alternativa antes de EF-22.

---

## DAP-02 — Goal Runtime: promover v0.1 para v1.0 antes ou depois de INT-03

**Contexto:**
Goal Runtime existe como v0.1 com 21 cenários de teste. O padrão EF é 28 cenários + `GoalRuntimeTypes.ts` separado. INT-03 requer Goal Runtime integrado no produto como substituto de `detectGoal()`.

**Evidência no código:**
`src/lib/goal-runtime-v01/GoalRuntime.ts` — funcional, certificado, mas sem arquivo de tipos separado e com menos cenários que o padrão.

**Alternativa A — Promover v0.1 para v1.0 antes de INT-03:**
- Extrai `GoalRuntimeTypes.ts`, eleva cenários de 21 para 28, renomeia para `goal-runtime/`
- Vantagens: INT-03 usa módulo formalmente certificado v1.0; elimina dívida técnica antes da integração
- Desvantagens: adiciona um sprint de infra antes de INT-03; atraso na convergência

**Alternativa B — Integrar v0.1 no produto e promover em paralelo:**
- INT-03 usa v0.1 como está; promoção para v1.0 acontece em sprint separada posterior
- Vantagens: convergência mais rápida; a funcionalidade de v0.1 já é suficiente para INT-03
- Desvantagens: produto em produção com módulo v0.1 não totalmente certificado; dívida técnica acumulada

**Recomendação técnica:** apresentada sem decisão — escolher Alternativa antes de planejar INT-03.

---

## DAP-03 — Semântica de "Plano" no Produto

**Contexto:**
O produto atual produz um objeto `plan` em `runReasoningPlan()` que é informativo/analytics: `{ goal, skills, sourcesCount, capabilities, responseTimeMs }`. O Planning Engine (EF-07) produz `ExecutionPlan`: `{ steps[], complexity, estimatedMs, risk }` — plano de execução formal imutável.

**Evidência no código:**
`src/lib/reasoning/memoryReasoningPlanner.js:178-191` — objeto plan atual.
`src/lib/planning-engine/PlanningEngineTypes.ts` — ExecutionPlan EF.

**Alternativa A — Dois objetos coexistindo:**
- Produto mantém `plan` analytics; Planning Engine produz `ExecutionPlan` separado
- Vantagens: sem quebra de contrato; analytics preservados
- Desvantagens: dois objetos com nome similar; confusão semântica; duplicação de conceito

**Alternativa B — Substituição total:**
- `plan` analytics é removido; Planning Engine se torna o único produtor de planos
- Analytics são extraídos do ExecutionPlan quando necessário
- Vantagens: sem duplicação; contrato limpo
- Desvantagens: breaking change nos analytics (`base44.analytics.track` usa `plan.*`); requer migração de código existente

**Alternativa C — Renomeação:**
- Objeto atual renomeado para `executionMetrics` ou `reasoningMetadata`; Planning Engine produz `plan`
- Vantagens: sem breaking change; semântica clara
- Desvantagens: mudança de nomenclatura em múltiplos arquivos

**Recomendação técnica:** apresentada sem decisão — escolher Alternativa antes de INT-03.

---

## DAP-04 — Certificação do Capability Runtime (EF-15)

**Contexto:**
Capability Runtime existe em `src/lib/capability-runtime/` com Types, Executor, Loader, Registry próprio (duplicata). O auditor automático retornou `testCount=0` porque a estrutura dos testes é diferente do padrão EF (`testCount` regex não captura). Não está claro se existem cenários formais ou não.

**Evidência no código:**
`src/lib/capability-runtime/capabilityRuntimeTests.ts` — arquivo existe mas contagem automática retornou 0.

**Alternativa A — Auditar manualmente e certificar:**
- Ler `capabilityRuntimeTests.ts`, contar cenários manualmente, certificar se >= 28
- Se certificado: pode avançar para INT-04 sem nova implementação
- Vantagens: aproveitamento do trabalho existente; sem sprint extra
- Desvantagens: requer revisão manual; possibilidade de descobrir que cenários são insuficientes

**Alternativa B — Implementar EF-15 do zero seguindo padrão EF:**
- Nova implementação de Capability Runtime com 28 cenários formais padrão EF
- Vantagens: certeza de certificação; padrão uniforme
- Desvantagens: descarta trabalho existente; sprint completa

**Alternativa C — Completar EF-15 adicionando cenários ao existente:**
- Mantém implementação atual, adiciona cenários faltantes até atingir 28 no padrão EF
- Vantagens: preserva trabalho; adiciona apenas o necessário
- Desvantagens: pode revelar problemas na implementação existente

**Recomendação técnica:** apresentada sem decisão — Alternativa A deve ser executada antes de qualquer outra.

---

## DAP-05 — Connector Registry: consolidação antes ou após EF-16

**Contexto:**
Existem 4+ implementações de Connector Registry (confirmadas em AUDIT-Sprint0). O produto usa `src/lib/connectors/registry.js` (um quinto arquivo, diferente das 4 do audit). EF-16 planeja Connector Registry v1.0 consolidado.

**Evidência no código:**
`src/lib/connectors/registry.js` — usado pelo produto via `getConnectorsForService()` em capabilityOrchestrator.js.
`src/lib/connector-registry/` (11 arquivos JS)
`src/lib/connector-runtime/ConnectorRegistry.ts`
`src/lib/enterprise-integration/connectorRegistry.js`
`src/lib/connector-sdk/` (12 arquivos JS)

**Alternativa A — Consolidar todos antes de EF-16:**
- Criar EF-16 primeiro, migrar todas as referências para o novo registry
- Vantagens: clean state; sem fragmentação
- Desvantagens: sprint de consolidação antes de qualquer integração de Connector

**Alternativa B — Congelar o atual e consolidar somente quando integração exigir:**
- `src/lib/connectors/registry.js` (usado pelo produto) permanece o canonical até EF-16
- Outros registries ficam em standby (não removidos, mas não crescem)
- Vantagens: sem sprint bloqueante; produto continua funcionando
- Desvantagens: 5 registries coexistindo por período indeterminado

**Alternativa C — Deprecar todos exceto EF-14 oficial imediatamente:**
- `src/lib/capability-registry/` (EF-14) declarado oficial; outros marcados como deprecated
- Vantagens: clareza imediata; sem ambiguidade
- Desvantagens: `connectors/registry.js` (usado no produto) é diferente de `capability-registry` — são domains diferentes; pode estar confundindo dois conceitos

**Nota técnica:** Capability Registry e Connector Registry são conceitos distintos. A consolidação deve ser tratada separadamente para cada um.

**Recomendação técnica:** apresentada sem decisão — clarificar se Capability Registry e Connector Registry devem ser unificados ou separados antes de EF-15/EF-16.

---

## DAP-06 — Cronograma de Deprecação do Memory Engine Legado

**Contexto:**
`src/lib/memory-engine/` contém 47 arquivos JavaScript cobrindo retrieval, consolidation, lifecycle, embedding, vector index, relationships, versioning. O produto NÃO usa nenhum deles diretamente. `src/lib/memory-engine-v1/` (EF-12) é o módulo oficial certificado. Os 47 arquivos existem, mas estão desconectados do produto.

**Evidência no código:**
PRODUCT-FLOW-MAPPING confirma que o produto usa persistência direta nas entidades Base44, não os arquivos de `memory-engine/`.

**Alternativa A — Deprecar imediatamente (próximo sprint):**
- Marcar todos os 47 arquivos como deprecated; remover em sprint dedicada
- Vantagens: elimina ~47 arquivos de ruído; reduz confusão
- Desvantagens: risco de referências não detectadas; possível quebra de imports em páginas de validação

**Alternativa B — Deprecar após Memory Engine EF-12 estar integrado no produto:**
- Aguardar Fase 5 (INT-06); quando EF-12 estiver operacional no produto, deprecar legado
- Vantagens: sem risco de regressão; migração validada antes da remoção
- Desvantagens: 47 arquivos existindo por mais tempo

**Alternativa C — Arquivar (mover para pasta `_deprecated/`):**
- Mover para `src/lib/_deprecated/memory-engine/` sem deletar
- Vantagens: preserva histórico; não quebra imports; visualmente indicado
- Desvantagens: arquivos continuam existindo no bundle

**Recomendação técnica:** apresentada sem decisão.

---

## DAP-07 — Reasoning Engine como módulo EF separado ou responsabilidade distribuída

**Contexto:**
A arquitetura oficial inclui "Reasoning Engine" entre Reflection Engine e LLM Gateway. No produto atual, "raciocínio" é a responsabilidade distribuída de: Context Engine (monta contexto), Planning Engine (cria plano), Reflection Engine (avalia), e Conversation Engine (orquestra). Um Reasoning Engine separado pode duplicar responsabilidades.

**Evidência no código:**
`src/lib/reasoning/` existe com 11 arquivos JS mas é uma pasta de utilitários (goalDetector, contextBuilder, memorySynthesizer, etc.) — não um módulo EF formal com Types e tests EF padrão.

**Alternativa A — Reasoning Engine como módulo EF separado (EF-25+):**
- Implementar Reasoning Engine com responsabilidade de "raciocínio de alto nível" (meta-cognição)
- Vantagens: arquitetura oficial preservada; separação de concerns
- Desvantagens: alta chance de sobreposição com Context Engine + Planning Engine; difícil definir responsabilidade exclusiva

**Alternativa B — Distribuir responsabilidade pelos módulos existentes:**
- Não implementar Reasoning Engine como módulo separado
- Context Engine: recupera e estrutura contexto
- Planning Engine: raciocina sobre o plano de execução
- Reflection Engine: raciocina sobre o resultado
- Conversation Engine: meta-orquestração
- Vantagens: sem duplicação; cada módulo raciocina no seu domínio
- Desvantagens: "Reasoning Engine" some da arquitetura oficial — requer atualização dos docs

**Alternativa C — Renomear Reasoning Engine para Meta-Cognition Layer:**
- Manter o slot arquitetural mas redefinir responsabilidade como "integração de raciocínio entre camadas"
- Vantagens: preserva arquitetura oficial; responsabilidade diferenciada
- Desvantagens: abstração alta; difícil de testar e certificar

**Recomendação técnica:** apresentada sem decisão — esta decisão afeta diretamente o número total de módulos EF e a estrutura do pipeline oficial.

---

*Sprint ARC-02 — 2026-07-11 — Engineering First*
*Nenhuma decisão foi tomada. Todas aguardam aprovação humana.*