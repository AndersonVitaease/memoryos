# PlanningContext Integration (Sprint 3)

## Objetivo

Integrar o contrato CanonicalResourceRequest ao limite arquitetural entre RICL e Planner, sem alterar qualquer decisão operacional.

## Novo contrato oficial

PlanningContext:

- goal (legado)
- canonicalResourceRequest
- runtimeContext
- metadata

Fluxo:

ConversationGoalBridge -> RICL -> PlanningContext -> ConversationPlanningEngine

## Feature flag

Flag oficial: ENABLE_CANONICAL_RESOURCE_REQUEST.

Com flag desligada:

- comportamento permanece idêntico ao legado
- Planner segue com Goal apenas

Com flag ligada:

- Planner recebe PlanningContext
- Planner continua planejando apenas com Goal legado
- CRR é usado apenas para auditoria e validação de equivalência

## Equivalência Goal vs CRR

Validações passivas implementadas:

- rawText preservado
- parameters preservados
- action pass-through compatível (unknown)
- detecção de perda de informação

Divergências:

- são registradas em auditoria
- não alteram execução
- não interrompem pipeline

## Observabilidade

Store dedicado: PlanningContextAuditStore.

Cada registro contém:

- goal recebido
- canonicalResourceRequest recebido
- resultado de comparação
- divergências
- tempo de comparação
- timestamp

Métricas expostas:

- total
- withCanonicalResourceRequest
- divergences
- validComparisons

## Garantias de compatibilidade

- algoritmo de planejamento inalterado
- GoalRegistry inalterado
- Runtime inalterado
- Connectors/Executors inalterados
- respostas ao usuário inalteradas

## Estratégia para Sprint 4

- consumo opcional e não-decisório de campos derivados do CRR sob guard adicional
- ampliar validações de equivalência por capability
- somente após evidência consistente: propor uso decisório controlado

## Status após Sprint 4

- Dual Read implementado no Planner sob flag dedicada.
- Leitura com fallback completo para Goal legado.
- Métricas e auditoria expandida com fonte por campo e cobertura de CRR.
- Detalhes técnicos em docs/architecture/planning-dual-read-sprint4.md.
