# Resource Resolution Engine (Sprint 7)

## Objetivo

Padronizar o consumo de CanonicalResourceRequest e CandidateSelectors em um fluxo unico de resolucao para todos os conectores, sem alterar RICL, Planner, Runtime, GoalRegistry ou contratos canonicos existentes.

## Escopo da Sprint 7

- Interface oficial criada: IResourceResolutionEngine.
- Contratos oficiais criados: ResourceResolutionRequest e ResourceResolutionResult.
- Fluxo padronizado implementado com:
  - ordem por CandidateSelectors
  - cascata
  - parada apos sucesso
  - fallback
  - auditoria
  - metricas globais
- Migracao efetiva do Google Drive para uso exclusivo da nova interface.
- Adaptadores preparados para Gmail, GitHub, OneDrive, Dropbox e SharePoint, sem logica especifica.

## Arquitetura oficial

### Modulos

- src/lib/resource-resolution-engine/ResourceResolutionTypes.ts
- src/lib/resource-resolution-engine/ResourceResolutionEngine.ts
- src/lib/resource-resolution-engine/ResourceResolutionAuditStore.ts
- src/lib/resource-resolution-engine/ConnectorAdapters.ts
- src/lib/resource-resolution-engine/index.ts

### Interface oficial

IResourceResolutionEngine

Responsabilidade:

- resolver recurso de forma padronizada
- executar cascata de CandidateSelectors
- controlar fallback
- retornar resultado canonico de resolucao

### Contrato de requisicao

ResourceResolutionRequest

Campos:

- connector
- featureEnabled
- candidateSelectors
- metadata
- searchCallback
- fallbackCallback

### Contrato de resultado

ResourceResolutionResult

Campos:

- success
- connector
- usedFallback
- exhausted
- winnerCandidate
- winnerStrategy
- result
- failure
- attempts
- durationMs

## Fluxo de execucao padrao

1. Se feature desabilitada ou sem candidatos:
   - engine executa fallbackCallback.
2. Se feature habilitada e com candidatos:
   - engine percorre candidateSelectors em ordem.
   - chama searchCallback para cada candidato.
   - para imediatamente no primeiro sucesso.
3. Se todos falharem:
   - retorna exhausted=true.
4. Em todos os casos:
   - registra auditoria.
   - agrega metricas globais.

## Responsabilidades por camada

Engine:

- ordem
- cascata
- parada apos sucesso
- fallback
- auditoria
- metricas

Connector/Executor:

- apenas fornece searchCallback e fallbackCallback.
- nao implementa algoritmo de cascata.

## Auditoria

Store global: ResourceResolutionAuditStore

Campos registrados:

- connector
- winnerCandidateId
- winnerStrategy
- totalAttempts
- durationMs
- result
- usedFallback
- exhausted
- error

## Metricas globais

Disponiveis via getMetrics():

- totalResolutions
- successRate
- fallbackRate
- averageAttempts
- winnerStrategy
- resolutionTime (averageMs, p95Ms, maxMs)
- connectorBreakdown

## Migracao Google Drive

DriveDownloadExecutor passou a utilizar resourceResolutionEngine.resolve(...) para toda decisao de resolucao por candidato e fallback.

A logica do conector permaneceu restrita a searchByName/getFileMetadata/download, sem alterar fluxo de Runtime/Planner/RICL.

## Adaptadores preparados para proximas sprints

Sem logica especifica de dominio, apenas assinatura e encapsulamento de callback:

- adapters/GmailResolutionAdapter.ts
- adapters/GitHubResolutionAdapter.ts
- adapters/OneDriveResolutionAdapter.ts
- adapters/DropboxResolutionAdapter.ts
- adapters/SharePointResolutionAdapter.ts

## Exemplo de integracao de novo connector

Exemplo (Gmail) usando o mesmo fluxo:

```ts
const adapter = createGmailResolutionAdapter(searchWithCandidate, fallback);

const result = await resourceResolutionEngine.resolve({
  connector: adapter.connector,
  featureEnabled: true,
  candidateSelectors,
  searchCallback: adapter.searchWithCandidate,
  fallbackCallback: adapter.fallback,
});
```

## Compatibilidade garantida

Sem alteracao de:

- GoalRegistry
- RICL
- Planner
- Runtime
- CanonicalResourceRequest
- CandidateSelectors

Sem quebra de contrato de entrada/saida das etapas anteriores.

## Estrategia para Sprint 8

- Migrar Gmail para consumo real da interface padronizada.
- Repetir padrao em GitHub e OneDrive.
- Habilitar rollout por ambiente com monitoramento de fallbackRate e connectorBreakdown.
- Definir SLO de resolucao por conector usando resolutionTime e successRate.

## Status apos Sprint 8

- Gmail migrado operacionalmente para uso do ResourceResolutionEngine nos fluxos de busca de mensagens e anexos.
- Provider oficial GmailSearchProvider implementado sob contrato IConnectorSearchProvider.
- Auditoria especifica de provider adicionada sem alterar contratos do engine.
- Metricas globais expostas com strategyDistribution derivado de winnerStrategy.
- Detalhes: docs/architecture/gmail-resource-resolution-sprint8.md.
