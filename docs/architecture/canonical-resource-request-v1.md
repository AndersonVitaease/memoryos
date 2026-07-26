# CanonicalResourceRequest v1 (Fase 1)

## Objetivo

Estabelecer um contrato canônico, versionado e imutável para representar pedidos de recurso originados de linguagem natural, sem alterar o comportamento atual de GoalRegistry, Planning Engine, Runtime, Connectors ou Executors.

## Escopo da Fase 1

- Criar contrato de dados CanonicalResourceRequest v1.
- Definir semântica mínima para ação, seletores, dicas, ambiguidade e confiança.
- Garantir versionamento explícito via schema + version.
- Adicionar testes estruturais do contrato.

## Fora de escopo nesta fase

- Não integrar o contrato no fluxo de produção.
- Não substituir parâmetros existentes (ex.: fileName).
- Não alterar roteamento, planejamento, execução ou síntese.

## Responsabilidades do contrato

- Preservar o texto original do usuário (`rawText`).
- Representar múltiplos candidatos de seleção (`literalNameCandidates`, `idCandidates`, `pathCandidates`, `queryCandidates`).
- Capturar hints úteis para resolução de recurso (`resourceTypes`, `mimeTypes`, `extensions`).
- Expor estado de ambiguidade e confiança.
- Permitir metadados estendidos sem quebrar compatibilidade (`metadata.extras`).

## Invariantes de compatibilidade

- `schema` fixo: `memoryos.canonical-resource-request`.
- `version` fixo na v1: `1`.
- Campos existentes da v1 não mudam de significado.
- Novos campos devem ser opcionais ou encapsulados em `metadata.extras`.

## Limitações conhecidas

- Imutabilidade em runtime depende de `Object.freeze` no produtor/consumidor.
- Contrato ainda não é emitido pelos componentes de pipeline existentes.
- Ainda não existe conversão oficial de parâmetros legados para CRR v1.

## Migração (próximas fases)

1. Introduzir builder/adaptador no Goal Bridge para emitir CRR v1 em paralelo aos parâmetros atuais.
2. Propagar CRR v1 no plano sem romper consumers atuais.
3. Adotar leitura prioritária de CRR v1 em Runtime/Executors mantendo fallback legado.
4. Consolidar deprecação gradual de campos legados somente após evidência de compatibilidade.

## Status após Sprint 2

- A camada RICL foi adicionada na pipeline como pass-through estrutural.
- O Planner continua consumindo apenas o contrato legado de goal.
- O CRR v1 é produzido em paralelo para auditoria, sem impacto funcional.
- Detalhes arquiteturais da camada: `docs/architecture/resource-intent-canonicalization-layer-sprint2.md`.
