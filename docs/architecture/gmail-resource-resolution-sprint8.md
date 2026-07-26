# Gmail Resource Resolution (Sprint 8)

## Objetivo

Validar a reutilizacao da arquitetura de canonicalizacao em um segundo dominio operacional, migrando Gmail para uso exclusivo do ResourceResolutionEngine nos fluxos de busca de mensagens e anexos.

## Escopo

- Migracao de resolucao para operacao de busca de mensagens (searchEmails).
- Migracao de resolucao para suporte de busca de mensagem no fluxo de anexo (getAttachment quando messageId ausente).
- Implementacao de provider oficial de busca do conector.
- Sem novas capacidades e sem novas heuristicas.

## Principios preservados

- GoalRegistry inalterado.
- RICL inalterado.
- Planner inalterado.
- Runtime inalterado.
- CanonicalResourceRequest inalterado.
- CandidateSelectors inalterados.
- ResourceResolutionEngine inalterado.

## Componentes criados

### IConnectorSearchProvider

Contrato oficial para provedores de busca por candidato.

Responsabilidade unica:

- receber CandidateSelector
- executar busca
- devolver SearchResult

### GmailSearchProvider

Implementa IConnectorSearchProvider para Gmail.

Responsabilidade:

- executar searchMessages para o candidato recebido
- retornar resultado normalizado

Sem responsabilidade de cascata, fallback, ordem, auditoria ou metricas.

### GmailResolutionAuditStore

Auditoria especifica do fluxo Gmail para rastreio operacional:

- provider
- connector
- winnerCandidate
- winnerStrategy
- totalAttempts
- fallback
- success
- durationMs

### ResolutionMetricsView

Visao consolidada de metricas globais baseada no ResourceResolutionAuditStore:

- totalResolutions
- successRate
- fallbackRate
- averageAttempts
- connectorBreakdown
- strategyDistribution

Observacao:

- strategyDistribution e derivado diretamente de winnerStrategy (sem alterar o Engine).

## Fluxo operacional Gmail

1. Connector recebe operacao searchEmails/getAttachment.
2. Connector envia CandidateSelectors para ResourceResolutionEngine.
3. Engine executa cascata via GmailSearchProvider.searchCandidate().
4. Engine controla ordem, parada apos sucesso e fallback.
5. Connector recebe resultado final e apenas adapta para formato do runtime.
6. Auditoria Gmail e metricas globais sao atualizadas.

## Feature flag

Flag mantida:

- ENABLE_MULTI_CANDIDATE_RESOLUTION

Com flag desligada:

- fallback legado do Gmail (SmartQueryBuilder + SmartQueryExecutor)

Com flag ligada:

- fluxo padronizado via ResourceResolutionEngine

## Comparacao Google Drive x Gmail

Google Drive (Sprint 7):

- executa resolucao via ResourceResolutionEngine
- conector apenas fornece callback de busca/fallback

Gmail (Sprint 8):

- executa resolucao via ResourceResolutionEngine
- conector apenas fornece provider de busca + adaptacao de retorno

Resultado:

- mesmo contrato de resolucao
- mesma telemetria global
- mesmo controle de cascata/fallback

## Preparacao para Sprint 9

- Aplicar o mesmo padrao em GitHub e OneDrive.
- Evoluir dashboards globais por connectorBreakdown e strategyDistribution.
- Definir gates de rollout por fallbackRate e successRate por conector.
