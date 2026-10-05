# RELATÓRIO — MISSION-BATCH-01 (despacho em lote determinístico + ready fail-fast)

Data: 2026-09-29 · worker: pane w6:pA · branch local `mission-batch-01` (sem push/merge) ·
gateway **não** reiniciado (a ativação fica com o supervisor, ver §5).

## 1. O que mudou

| Arquivo | Mudança |
|---|---|
| `__init__.py` `handle_mission_batch` (+ helpers `_batch_*`) | Tool nova `mission_batch`: recebe `manifest` (caminho .json/.yaml, ou o texto JSON/YAML) ou `missions` (lista inline). Topo aceito: lista ou `{missions: [...]}`. Lote de **2-6** missões, `missionId` repetido recusado, item sem `missionId`/`promptFile` recusado — validação ANTES de qualquer despacho. Chama `handle_mission_dispatch` por item, **em sequência** (herdr single-writer; teste prova concorrência máxima = 1). Falha ou exceção de um item não derruba o lote. |
| idem, anti-fantasma | Antes de cada item: ledger `dispatching`/`failed`/`interrupted` **com pane comprovadamente morto** (`pane_exists=False`) vira `cancelled` (`cancelReason` automática, `cancelledBy=mission_batch`, `previousStatus`, evento `batch_ghost_cancelled`), o supervisor órfão desse fantasma (se houver) é encerrado, e o item é re-despachado no mesmo lote. Pane vivo ou herdr indisponível (`None`) = **não mexe** (o dispatch decide: no_op). `dispatching` sem `paneId` só conta como fantasma se o ledger tiver ≥900s (pior dispatch possível: gpu-up 720s + ready 180s). Antes disso pode ser um dispatch ainda em curso. |
| idem, saída | `{ok, total, despachadas, falhas, fantasmasLimpos, tempoTotalS, tempoPorMissao{id: s}, itens[{missionId, result: ok\|erro\|fantasma-limpo, status, paneId, tabId, ghost?, error?, detail?, seconds}]}`. |
| `__init__.py` ready-loop do dispatch | Deadline passa a depender do caminho: **180s** só quando o claude nasce apontado na ponte Qwen (`gpu_up_ok`). Em qualquer outro caminho (sonda `_qwen_bridge_alive()` morta → 8103, `engine=openrouter`, ou gpu-up falho) o deadline cai para **45s**. Constantes `_READY_DEADLINE_S`/`_READY_DEADLINE_FAST_S`. O ledger grava `readyDeadlineS` e a mensagem `CLAUDE_START_TIMEOUT` mostra o valor real. |
| `register()` + `plugin.yaml` | `mission_batch` registrada no toolset `mission-ops` (schema `manifest`/`missions`). Docstring: 11 tools. |
| `test_mission_batch.py` (novo, 11 testes) | Ver §3. |
| `provas/mission-batch-01/` | red/green/suíte, runner e coletor do E2E, lote dos canários, snapshots de créditos. |

Decisões de escopo técnico (minhas, conforme regra de condução):
- `2-6` é aplicado de forma estrita. 1 missão é `mission_dispatch`; mais de 6 × ~15-60s estoura o orçamento de uma chamada síncrona do gateway.
- Chaves repassadas por item: `missionId, promptFile, cwd, consequence, paneTitle, engine, spawnedBy, operatorChannel`. O **gate de cadeia** continua valendo por item dentro do `handle_mission_dispatch`, então o lote não é atalho de governança.
- Fantasma de pane morto não tenta `tab close`: pane morto = aba já foi embora. O close do fantasma é só no ledger.

## 2. Antes × depois

| Caminho | Antes (supervisor Hermes via LLM) | Depois (`mission_batch`, 1 chamada) |
|---|---|---|
| Despachar N missões | N turnos LLM (1 `mission_dispatch` por turno) + handler síncrono por missão. **Medido hoje no gateway (código em memória, pré-dispatch-fast-03): 723s por missão** (`models-roles-01b`, `dispatch-fast-03`, `watchdog02-detectores-02`, `mission-batch-01`: `supervisor_spawned`→`pane_created` = 720s do timeout do gpu-up) | 1 turno LLM, N despachos sequenciais sem LLM no meio. Pelo código do disco: **12-15s por missão** no caminho 8103 (medido hoje: `dispatch-fast03-canario-01` 12s, `batch-e2e-canario-01/02` 12s/15s) → lote de 3 ≈ 45s |
| Fantasma `dispatching`/`failed`/`interrupted` sem pane | 3 turnos manuais por fantasma (status → editar ledger/cancelar → re-dispatch). 3 casos hoje | Automático dentro do item (`result: fantasma-limpo`), 0 turnos extras |
| Pane que nunca fica pronto, sem ponte Qwen | 180s de ready-loop (a ponte morta já é detectada em 0,16s) | 45s (`readyDeadlineS: 45`) |
| Falha de 1 missão no meio | O LLM decide, turno a turno, se segue | Lote segue; `falhas` + `error/detail` por item |

## 3. Provas red → green

- **Red** (`provas/mission-batch-01/red.txt`): a mesma suíte nova contra uma cópia do plugin com esta missão revertida (estado exato dispatch-fast-03, em `/tmp/mb01-before`): `Ran 11 tests … FAILED (failures=2, errors=9)`, ou seja, 11/11 vermelhos (sem `handle_mission_batch`; ready-loop com 12 waits de 15s = 180s no caminho morto).
- **Green** (`provas/mission-batch-01/green.txt`): `Ran 11 tests … OK`.
  - `test_three_missions_sequential_one_failure_one_ghost`: lote de 3 (TempState, herdr mockado). Ordem b1→b2→b3, concorrência máx. 1. b2 falha (`HERDR_TAB_CREATE_FAILED`) e o lote segue. b3 era `interrupted` com pane morto: sem o lote seria `no_op` eterno; com o lote vira `fantasma-limpo` e é re-despachado com o `consequence` do manifesto. Resumo `total=3 despachadas=2 falhas=1 fantasmasLimpos=1` + `tempoPorMissao` com os 3.
  - `test_ghost_statuses_dispatching_and_failed`, `test_live_or_unknown_pane_is_not_a_ghost`, `test_dispatching_without_pane_only_ghost_when_stale`, `test_item_exception_does_not_abort_batch`.
  - `TestBatchManifest`: tamanhos 0/1/7 recusados, duplicata/itens inválidos/arquivo ausente, JSON-arquivo, YAML-arquivo e JSON-texto.
  - `TestBatchRegistered`: `mission_batch` no catálogo com o handler certo.
  - `TestReadyFailFast`: com relógio falso, ponte morta = 3 waits (45s), `readyDeadlineS=45`, mensagem "45s"; ponte viva = 12 waits (180s).
- **Suíte completa** (`provas/mission-batch-01/suite-full.txt`): `Ran 247 tests in 34.5s — OK` (236 + 11), pico RSS 33 MB.

## 4. E2E real: EXECUTADO (29/09 ~12:16, pelo supervisor Hermes — autorização única do operator)

~OP-UPDATE 12:16: o gate de cadeia foi respeitado (despacho a partir de pane de worker, correto).
O supervisor Hermes rodou o runner acima carregando o plugin do disco:

- **Runner**: `provas/mission-batch-01/run_e2e.py` — lote de 2 canários (`mission-batch-01-canario-a/b`) numa ÚNICA chamada: **tempoTotalS 25,52s** (`tempoPorMissao`: 12,92s + 12,60s), despachadas 2 / falhas 0.
- **Coletor**: `collect_e2e.py` exit 0 — **verdict 5/5 verde** (`a_batch, b_panes, c_answer, d_closed, e_credits`): 2 despachadas com tempos, panes vivos, respostas, 2 closed, créditos (antes 1004,4152 → depois 1005,3155; delta $0,90 da conta compartilhada).
- E2E adicional do supervisor (caminho direto, sem runner): lote `batch-e2e-canario-01/02` — 27,3s, ambos executaram de verdade (`/tmp/batch-e2e-01.txt` = "ok-01", `/tmp/batch-e2e-02.txt` = "ok-02"); achado F1 (banner de billing pós-prompt não dançado) registrado e corrigido em READY_DANCE (mission_core.py) com teste.
- A linha do verify.json correspondente fica verde com estas provas.

Este worker (missão `mission-batch-01`, pane w6:pA) **não** tem `allow_chain_dispatch: true` no prompt. Qualquer despacho a partir daqui é recusado pelo gate tier-1 (`CHAIN_DISPATCH_NOT_ALLOWED`). Rodei o runner uma vez daqui: ele checa o gate **antes** de despachar e saiu com exit 3 sem criar nada (`provas/mission-batch-01/e2e-run-from-worker-pane.txt`). Não contornei o gate (ex.: limpar `HERDR_PANE_ID`), porque isso seria despacho em cadeia não autorizado.

Tudo pronto para **um comando** do supervisor Hermes/operator. Funciona antes do restart do gateway, porque o runner carrega o plugin do disco:

```
python3 /root/.hermes/plugins/mission-ops/provas/mission-batch-01/run_e2e.py
python3 /root/.hermes/plugins/mission-ops/provas/mission-batch-01/collect_e2e.py   # exit 0 = provado
```

O runner: credits antes → `handle_mission_batch(lote-canarios.json)` numa chamada (canários `mission-batch-01-canario-a/b`, prompts de 1 linha em `/tmp/mb01-canarios/{a,b}`, `consequence:false`, caminho 8103/gpt-oss-120b) → observa até 90s os 2 panes (vivo, `agent_status` working/idle/done, resposta `CANARIO-X OK`) → `mission_close acceptUnverified` nos 2 → credits depois. Grava `e2e-result.json` com `tempoTotalS`/`tempoPorMissao`. O coletor valida (a) 2 despachadas / 0 falhas com tempos, (b) panes vivos com status, (c) respostas, (d) 2 `closed`, (e) créditos. A linha correspondente do `verify.json` fica **vermelha até lá**, de propósito.

Observação: os ledgers `batch-e2e-canario-01/02` (`spawned_by=operator`, 12:06Z, `dispatched`) **não** são desta missão. Não saíram do meu código nem do meu pane, e não mexi neles. Fechá-los é com quem os despachou.

## 5. Ativação (no close, pelo supervisor Hermes)

1. Rodar o E2E do §4 (antes ou depois do restart, tanto faz).
2. `mission_close` desta missão: `verify.json` no cwd (cópia em `verify-mission-batch-01.json`; o manifesto da dispatch-fast-03, já `closed`, está preservado em `verify-dispatch-fast-03.json`).
3. **Restart do gateway Hermes** (consequência externa: supervisor/operator, fora deste escopo). Só aí a tool `mission_batch` aparece no catálogo em memória. De quebra, ativa também o fail-fast da dispatch-fast-03: o gateway ainda paga os 720s do gpu-up por dispatch (§2).
4. Uso: `mission_batch(manifest="/caminho/lote.json")` ou `mission_batch(missions=[{missionId, promptFile, cwd, consequence?}, …])`.

## 6. Guardas e custos

- Zero restart do gateway; `or-worker-bridge` (8103) intocado (`systemctl is-active` = active); judge do gpu-watchdog intocado; zero create/destroy vast (suíte com `vast_sandbox` guard; ponte morta = gpu-up nem é tentado); zero push/merge (só commits locais no branch `mission-batch-01`).
- Lote sequencial dentro da chamada (teste prova concorrência 1).
- Créditos OpenRouter ANTES (12:06Z): `total_credits=1026 total_usage=1003.5906` (`provas/mission-batch-01/credits-before.json`). Esta missão fez **zero** chamadas OR próprias (testes 100% mock). O E2E grava `credits-e2e-before/after.json` na hora em que rodar. DEPOIS (12:09Z): `total_usage=1004.4152` (`credits-after.json`). O delta de $0,82 é da conta toda, compartilhada com os outros workers no 8103 (entre eles os canários `batch-e2e-*` do operator), e não desta missão.
