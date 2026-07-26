# Candidate Resolution (Sprint 5)

## Objetivo

Introduzir geração estruturada de múltiplos candidatos na RICL sem alterar decisões operacionais do sistema.

## Estrutura

Novo campo no CanonicalResourceRequest v1:

- candidateSelectors

Cada candidato inclui:

- id
- priority
- value
- source
- confidence
- strategy
- metadata

## Feature flag

Flag dedicada:

- ENABLE_MULTI_CANDIDATE_GENERATION

Com flag desligada:

- candidateSelectors permanece vazio

Com flag ligada:

- RICL gera candidatos determinísticos ordenados

## Estratégias implementadas

- literal
- descriptor_removed
- quoted_literal
- filename_only
- extension_only
- id_based
- path_based

## Ordenação e prioridade

- ordem explícita por campo priority
- ids determinísticos por posição
- deduplicação por strategy + value

## Princípio de preservação

- rawText permanece intacto
- Goal e parameters preservados
- transformações somente aditivas

## Auditoria

Para cada canonicalização:

- enabled
- candidateCount
- generationDurationMs
- strategies

## Métricas

Disponíveis via ResourceIntentCanonicalizationAuditStore.getMetrics():

- total
- candidateGenerationEnabled
- totalCandidatesGenerated
- averageCandidatesPerRequest
- averageGenerationDurationMs

Exportação de eventos:

- ResourceIntentCanonicalizationAuditStore.export()

## Compatibilidade

- Planner permanece funcionalmente equivalente
- Runtime inalterado
- Connectors inalterados
- Executors inalterados
- Candidatos ainda não são consumidos por conectores

## Preparação para Sprint 6

- introduzir seleção observacional por capability
- adicionar validação por domínio (drive/github/gmail)
- manter fallback total e rollout controlado por flags

## Status após Sprint 6

- CandidateSelectors passaram a ser consumidos funcionalmente no conector de Drive.
- Resolução em cascata implementada com interrupção após sucesso.
- Fallback legado preservado via feature flag dedicada.
- Auditoria e métricas de resolução adicionadas.
- Detalhes técnicos: docs/architecture/candidate-resolution-engine-sprint6.md.
