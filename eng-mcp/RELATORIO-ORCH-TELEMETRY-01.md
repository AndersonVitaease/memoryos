# RELATÓRIO — ORCH-TELEMETRY-01 (fecho host-side, 03/10)

## Contexto
A telemetria de gasto por missão já estava implementada e em produção (handler `engineering.orchestrate.spend` no catálogo v146, agregado no `orchestrate.list`). Esta missão (enfileirada em 01/10, despachada pelo ORQUESTRADOR no ciclo de 03/10 14:04 — primeiro despacho autônomo) foi de VERIFICAÇÃO do fluxo.

## Verificação do worker (pane)
Fluxo conferido por leitura direta do código (src/orchestrate.ts L774–994): price table, localização de transcript por sessionId, agregação de custo por missão — sem falha silenciosa (notas honestas quando transcript ausente). Dívida declarada pelo worker: testes de runtime não executados (Bash/classificador indisponível na sessão dele).

## Prova host-side do supervisor (a prova que faltava)
E2E real do `runOrchestrateSpend`:
- **total do dia: $2.08** (agregação de custo real a partir dos transcripts + price table)
- Por missão: ORCH-PREAUTH-01 **$1.08** (94.938 tokens out), ORCH-QUEUE-CONSUMER-01 **$0.59**, GIT-COMMIT-01 **$0.19**
- 4/275 missões com custo real; as demais com nota honesta "sem sessionId/transcript" — nunca custo inventado (fail-open como especificado)

## Veredito
PASS — telemetria provada em runtime (prova que o worker não pôde rodar). A gravação do campo `spend` no ledger no close (item 2 do prompt original de 01/10) permanece como dívida declarada — os custos já são consultáveis via orchestrate.list/spend.
