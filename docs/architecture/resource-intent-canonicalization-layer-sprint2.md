# Resource Intent Canonicalization Layer (Sprint 2)

## Objetivo

Introduzir a Resource Intent Canonicalization Layer (RICL) na arquitetura como camada estrutural pass-through, sem alterar o comportamento funcional do sistema.

## Posição na pipeline

ConversationGoalBridge

-> RICL (pass-through)

-> ConversationPlanningEngine

Nesta sprint, a saída da RICL é gerada em paralelo e não altera decisões de planejamento, execução ou síntese.

## Responsabilidades nesta sprint

- Receber userMessage, goal e goal.parameters.
- Construir CanonicalResourceRequest v1 mínimo.
- Preservar integralmente rawText, goal e parameters.
- Não modificar fileName, query ou qualquer campo legado.
- Registrar auditoria diagnóstica da canonicalização.

## O que a RICL não faz nesta sprint

- Não executa heurísticas.
- Não executa parsing semântico.
- Não remove descritores.
- Não gera múltiplos candidatos.
- Não gera resourceHints semânticos.
- Não gera confidence semântica.
- Não interfere em Planner, Runtime, Connectors ou Executors.

## Design de DI

Componentes adicionados:

- Interface oficial: IResourceIntentCanonicalizer
- Implementação padrão: PassThroughResourceIntentCanonicalizer
- Ponto de injeção: ResourceIntentCanonicalizationProvider
- Auditoria: ResourceIntentCanonicalizationAuditStore

A pipeline resolve o canonicalizer via provider e executa a camada em modo non-blocking.

## Observabilidade adicionada

Para cada canonicalização:

- timestamp
- contractVersion
- durationMs
- input recebido (userMessage, goalType, goalId, parameters)
- CanonicalResourceRequest produzido

## Compatibilidade garantida nesta sprint

- Planner continua usando apenas goal legado.
- Nenhuma decisão operacional depende da saída da RICL.
- Falha da RICL não interrompe pipeline (bloco non-blocking).
- GoalRegistry, PlanningEngine, RuntimeEngine, Connector Runtime, Connectors e Executors permanecem sem alteração funcional.

## Estratégia para Sprint 3

- Introduzir consumo opcional do CRR em paralelo, ainda com fallback legado.
- Iniciar enriquecimento semântico sob feature guard explícito.
- Medir impacto por auditoria comparativa antes de qualquer mudança decisória.

## Status após Sprint 3

- O Planner passou a receber `PlanningContext` sob feature flag.
- O CRR permanece passivo: somente validação e auditoria de equivalência.
- O algoritmo de planejamento continua baseado exclusivamente no Goal legado.
- Detalhamento da Sprint 3: `docs/architecture/planning-context-sprint3.md`.
