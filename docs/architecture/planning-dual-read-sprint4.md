# Planning Dual Read (Sprint 4)

## Objetivo

Permitir leitura dual entre CanonicalResourceRequest e Goal legado no Planner, com fallback completo e comportamento funcional inalterado.

## Feature flag

Flag de Dual Read:

- ENABLE_CANONICAL_RESOURCE_READ

Quando desligada:

- Planner usa leitura efetiva somente do Goal legado.

Quando ligada:

- Planner tenta ler primeiro o CanonicalResourceRequest.
- Em ausência ou inconsistência, fallback automático para Goal legado.

## Prioridade de leitura

1. CanonicalResourceRequest
2. Goal legado (fallback)

Campos auditados:

- goalType
- parameters
- rawText
- action
- selectors
- resourceHints
- metadata

## Regras de fallback

- Campo ausente no CRR: fallback para Goal
- Campo inconsistente no CRR: registrar divergência e fallback para Goal
- Nunca interromper planejamento
- Nunca alterar decisões operacionais por causa da auditoria

## Garantia de compatibilidade

- Algoritmo de planejamento preservado
- GoalRegistry inalterado
- Runtime inalterado
- Connectors inalterados
- Executors inalterados
- Nenhuma capability alterada

## Auditoria

Cada execução registra:

- fonte por campo (crr ou goal)
- fallbackCount
- missingFields
- divergences
- resolutionDurationMs
- crrCoverage

## Métricas exportáveis

- total
- withCanonicalResourceRequest
- divergences
- validComparisons
- crrReads
- goalReads
- fallbackCount
- dualReadDivergences
- averageCrrCoverage

Exportação:

- PlanningContextAuditStore.export()

## Sprint 5 (preparação)

- Expandir validações por capability
- Introduzir rollout controlado por segmento
- Consolidar painel de cobertura e divergência para governança

## Status após Sprint 5

- RICL passou a gerar candidateSelectors com ordenação e estratégias explícitas.
- O Planner continua sem alterar decisões operacionais.
- Geração de candidatos protegida por feature flag dedicada.
- Detalhes técnicos: docs/architecture/candidate-resolution-sprint5.md.
