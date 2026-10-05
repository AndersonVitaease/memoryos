# LEDGER-HYGIENE-03 — higiene do ledger mission-events (paralela, escopo /opt/mission-events)

## Problema
mission_list reporta 177 registros no ledger; dezenas são sujeira wd02-t1..t7,
registros sem missionId, e arquivos que não são mission-records aparecendo como
"ignorados" (verify-ledger-hygiene-02.json etc. misturados no diretório de ledgers).

## Contrato
1. Inventário: contar registros reais de missão vs sujeira (sem missionId/status reconhecível).
2. Mover NÃO-RECORDS (jsons de prova/relatório) para /opt/mission-events/archive/ (criar).
3. Registros wd02-* e fantasmas: NÃO deletar — mover para archive/ também (auditável).
4. Registros de missão LEGÍTIMOS ficam intocados (ai-cost-01, audio-link, e todos os de hoje).
5. Prova: mission_list do plugin volta a listar só missões reais; ledger carrega sem erro.
6. Zero LLM; operação determinística de arquivos.

## Provas (verify-ledger-hygiene-03.json no cwd /opt/mission-events)
- cmd: python3 -c contar registros no ledger antes/depois, print inventário
- cmd: python3 -c importar mission_core e carregar ledger sem erro
- file: RELATORIO-ledger-hygiene-03.md

## NÃO tocar
- spool.jsonl, subscribers.json, event_bus.py, /opt/gpu-bridge/**, /opt/memoryos/**