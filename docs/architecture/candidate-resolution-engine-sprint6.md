# Candidate Resolution Engine (Sprint 6)

## Objetivo

Consumir CandidateSelectors produzidos pela RICL no fluxo de execução do conector, com resolução em cascata e fallback legado.

## Escopo desta sprint

- Consumo funcional de candidateSelectors no caminho de drive.downloadFile.
- Tentativa em cascata por prioridade de entrada.
- Interrupção imediata ao encontrar sucesso.
- Auditoria detalhada por tentativa.
- Métricas agregadas de resolução.

## Feature flag

Flag dedicada:

- ENABLE_MULTI_CANDIDATE_RESOLUTION

Com flag desligada:

- comportamento legado por fileName/query/rawText

Com flag ligada:

- usa candidateSelectors quando disponíveis
- fallback legado quando lista ausente

## Fluxo de resolução em cascata

1. Recebe lista de CandidateSelectors (ordem preservada).
2. Para cada candidato:
   - normaliza query via policy existente
   - executa searchByName
   - aplica filtros/ranking já existentes
3. Se houver resultado válido:
   - seleciona vencedor
   - encerra iteração
4. Se todos falharem:
   - retorna NOT_FOUND com exaustão de candidatos

## Garantias de compatibilidade

- GoalRegistry inalterado
- Planner inalterado
- Runtime inalterado
- Connectors não geram candidatos
- Executors/Connectors apenas consomem lista ordenada
- contratos existentes preservados

## Auditoria registrada

- candidato tentado
- estratégia
- prioridade
- sucesso/falha
- motivo da falha
- tempo por tentativa
- total de tentativas
- candidato vencedor
- fallback utilizado
- exaustão

## Métricas disponíveis

- totalResolutions
- firstCandidateSuccess
- secondCandidateSuccess
- thirdCandidateSuccess
- averageCandidatesUsed
- successRate
- fallbackRate
- exhaustedCandidates

## Preparação para Sprint 7

- expandir consumo para outras operações de Drive
- adicionar dashboards por estratégia e domínio
- iniciar rollout por ambiente com gates adicionais

## Status apos Sprint 7

- A resolucao em cascata do Drive foi migrada para o engine padronizado ResourceResolutionEngine.
- O DriveDownloadExecutor passou a consumir a interface oficial de resolucao.
- Auditoria e metricas foram consolidadas em store global com breakdown por connector.
- Base reutilizavel preparada para Gmail, GitHub, OneDrive, Dropbox e SharePoint.
- Detalhes: docs/architecture/resource-resolution-engine-sprint7.md.
