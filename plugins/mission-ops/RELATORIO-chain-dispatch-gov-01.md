# RELATÓRIO chain-dispatch-gov-01 — governança de despacho em cadeia

**RESULT: PASS.** O `mission_dispatch` agora grava `spawned_by` e `chain_depth` em todo ledger novo. Worker só despacha sub-missão com o badge `allow_chain_dispatch: true` e até `mission.chain_depth_max` (default 1). Qualquer recusa é tier-1, zero LLM, e acontece antes de qualquer chamada herdr ou gravação de ledger. Todo despacho, aceito ou recusado, deixa trilha `chain_dispatch` no bus. Nos testes, red 17/17 virou green 17/17. A suíte full deu **188/188 OK** (171 anteriores + 17 novos), isolada em `chain-dispatch-suite.scope` com MemoryMax=2G e pico de 27 MB. Na prova viva, o meu próprio pane de worker foi recusado. Commit do código: `11f8a55`, sobre o HEAD `8edc0d9`. Patch dirigido, sem rewrite de arquivo. verify.json pass 18/18. **Pendente:** a autoverificação `engineering.judge.verify` e o `engineering.memory.capture` estão bloqueados por credencial (`AUTHORIZATION_SCOPE_REQUIRED`, o grant `engineering:*` é do operator). Ver §8.

## 1. O que mudou
Arquivos: `mission_core.py` (seção nova CHAIN-DISPATCH-GOV-01 no fim, +135), `__init__.py` (gate no `handle_mission_dispatch`, `_spool_chain_event`, `spawnedBy` no schema, +40), `test_mission_ops.py` (o `TempState` isola o spool, +6/-3) e o arquivo novo `test_chain_dispatch.py`.

- **Quem despacha** (`mc.resolve_dispatcher`), em ordem de precedência:
  1. O `HERDR_PANE_ID` do processo chamador bate com o `paneId` de um ledger vivo (status fora de closed/cancelled/failed). Então é **worker daquela missão**. Isso vence qualquer `spawnedBy` declarado, para o worker não se passar por supervisor.
  2. `spawnedBy` declarado: `operator`, `supervisor:hermes` ou o missionId de um worker.
  3. Pane herdr que não é de missão: `operator`.
  4. Sem pane: `supervisor:hermes`. Conferi no `/proc` que o processo `gateway run` roda sem `HERDR_PANE_ID`.
- **Ledger:** grava `spawned_by`, `chain_depth` (0 para supervisor/operator, pai+1 para worker) e `allow_chain_dispatch`. Esse último é lido do prompt da própria missão **no despacho**. Editar o próprio prompt depois não vale como autoconcessão.
- **Ledger legado** sem esses campos é despacho normal, profundidade 0. O badge dele é lido do prompt.
- **Badge:** `allow_chain_dispatch: true` numa linha própria do prompt, aceitando markdown em volta (mesmo estilo do `consequence:`).
- **Limite:** `mission.chain_depth_max` no `/root/.hermes/config.yaml`. O parser é mínimo porque o python do gateway (3.14.7) não tem PyYAML. Valor ausente, negativo ou inválido vira 1. Com 0, nenhum worker despacha.
- **Recusas** (`{ok:false, error, detail}`, detail cita a missão de origem):
  - `CHAIN_DEPTH_EXCEEDED`: profundidade nova > max.
  - `CHAIN_DISPATCH_NOT_ALLOWED`: pai sem badge.
  - `CHAIN_PARENT_UNKNOWN`: `spawnedBy` é um missionId sem ledger.
- **Trilha:** 1 evento `kind=chain_dispatch` no `/opt/mission-events/spool.jsonl` com `spawned_by`, `chain_depth`, `chain_depth_max`, `verdict`, `reason`, `dispatcher_kind`, `basis` e `declared`. Também vai 1 evento `chain_dispatch_accepted|refused` no `events.jsonl` da missão.
- **Supervisor e operator** nunca são bloqueados, nem com `chain_depth_max: 0`. NO_OP, retry de prompt_failed e o restante do fluxo não mudaram.

## 2. Red → green por caso (`test_chain_dispatch.py`)
Red em `provas/chain-dispatch-gov-01/red.txt`: 17 ERROR no HEAD `8edc0d9`. Green em `provas/chain-dispatch-gov-01/green.txt`: Ran 17, OK.

| caso | teste | red | green |
|---|---|---|---|
| (a) worker sem badge → recusa `CHAIN_DISPATCH_NOT_ALLOWED` citando `pai-01`, sem herdr, sem ledger, trilha no spool (`refused`, depth 1) + events.jsonl | `test_worker_pane_refused_with_trail` | ERROR | ok |
| (a) `spawnedBy=<missão>` declarado pelo gateway → mesma recusa | `test_declared_spawned_by_mission_refused` | ERROR | ok |
| (a) worker declarando `supervisor:hermes` → recusado; `declared` na trilha | `test_worker_cannot_spoof_supervisor` | ERROR | ok |
| (a) badge adicionado ao prompt DEPOIS do despacho → recusado | `test_self_grant_after_dispatch_does_not_count` | ERROR | ok |
| (a) `spawnedBy` de missão inexistente → `CHAIN_PARENT_UNKNOWN` | `test_unknown_declared_parent_refused` | ERROR | ok |
| (b) worker com badge → aceito, ledger `spawned_by=pai-01`, `chain_depth=1`, trilha `accepted` | `test_badge_accepted_and_recorded` | ERROR | ok |
| (b) badge do prompt gravado no ledger no despacho (true/false) | `test_badge_recorded_on_ledger_at_dispatch` | ERROR | ok |
| (c) neto (profundidade 2) → `CHAIN_DEPTH_EXCEEDED`, sem ledger, trilha `refused` depth 2/1 | `test_grandchild_refused_by_default` | ERROR | ok |
| (c) `chain_depth_max: 2` no config.yaml → neto aceito, depth 2 | `test_depth_configurable` | ERROR | ok |
| (c) `chain_depth_max: 0` → nenhum worker despacha | `test_depth_zero_blocks_any_worker` | ERROR | ok |
| (c) parser do config (ausente, comentário, fora do bloco, negativo, lixo) | `test_config_parser` | ERROR | ok |
| (d) supervisor sem pane → `spawned_by=supervisor:hermes`, depth 0, trilha `accepted` | `test_supervisor_default_no_pane` | ERROR | ok |
| (d) `spawnedBy=operator` → `operator` | `test_operator_declared` | ERROR | ok |
| (d) pane de missão FECHADA / pane não-missão → `operator`, aceito | `test_non_mission_pane_is_operator` | ERROR | ok |
| (d) supervisor com `chain_depth_max: 0` → aceito | `test_supervisor_unaffected_by_depth_zero` | ERROR | ok |
| (d) NO_OP idempotente continua NO_OP | `test_idempotent_no_op_keeps_working` | ERROR | ok |
| (e) ledger antigo sem campos: `load_ledger`, `list_ledgers`, `mission_status` ok; `chain_info` = depth 0, badge do prompt; filho dele nasce depth 1 | `test_legacy_ledger_loads_and_is_depth_zero` | ERROR | ok |

O red é todo ERROR porque os pontos de extensão (`_MISSION_SPOOL`, `mc.CONFIG_PATH`, `chain_gate`) não existiam no HEAD. Não havia governança nenhuma para falhar por asserção.

## 3. Suíte full (contenção obrigatória MEM-GUARD)
```
systemd-run --scope --unit=chain-dispatch-suite -p MemoryMax=2G -p MemorySwapMax=0 \
  --working-directory=/root/.hermes/plugins/mission-ops bash -c 'cat /proc/self/cgroup; /usr/bin/time -v python3 -m unittest \
  test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce test_verify_json_ghost \
  test_ledger_hygiene test_watch_detector test_verify_author test_chain_dispatch'
```
Resultado:
- cgroup `0::/system.slice/chain-dispatch-suite.scope`
- **Ran 188 tests OK**, 33,6 s
- RSS máximo 27368 KB, Exit status 0
- Arquivo: `provas/chain-dispatch-gov-01/suite-full.txt`

O bus real **não** recebeu eventos dos testes: `/opt/mission-events/spool.jsonl` tinha 8138 linhas antes e depois, com 0 `chain_dispatch`. O `TempState` agora aponta `_MISSION_SPOOL` para tmp. `test_mission_resume.py` continua fora da suíte, como na missão anterior: é untracked e já existia antes.

## 4. Prova viva (python do gateway, estado real)
Arquivo: `provas/chain-dispatch-gov-01/selftest-live.txt`. Rodei com `/root/.hermes/tools/python-3.14.7+20260901-linux-x64/bin/python3`, que tem `yaml disponível: False`.
- `chain_depth_max = 1`: o config.yaml real não tem bloco `mission:`, então vale o default.
- `resolve_dispatcher` com o pane real `w5:p1E` → `worker`, `spawned_by=chain-dispatch-gov-01`. Sem pane (gateway) → `supervisor:hermes`.
- 119 ledgers reais carregados, todos legados sem `spawned_by`, sem erro. Isso é o caso (e) ao vivo.
- `handle_mission_dispatch` da sonda `chain-gov-live-probe-01` a partir deste pane de worker (missão sem badge):
  - resposta `CHAIN_DISPATCH_NOT_ALLOWED` citando `chain-dispatch-gov-01`
  - nenhum ledger criado, nenhuma chamada herdr
  - evento real no bus em `provas/chain-dispatch-gov-01/live-spool-event.jsonl`: `verdict=refused`, `chain_depth 1/1`, `basis "pane w5:p1E"`
  - `chain_dispatch_refused` no `events.jsonl`

Esse é o cenário exato do incidente de 27/09, agora recusado e com rastro.

## 5. Import + self-test (boot declarado)
- `provas/chain-dispatch-gov-01/selftest-load.txt`: import OK no python do gateway, **12 tools registradas**, `mission_dispatch.spawnedBy` presente no schema.
- `provas/chain-dispatch-gov-01/smoke.txt`: `smoke_mission_ops.py` → `SMOKE OK`. Rodei com `SMOKE_ROLLBACK=0` por segurança, em scope isolado.
- **Boot declarado:** o gateway em execução ainda tem o código antigo em memória. A governança só vale nele depois do **restart do gateway, a cargo do SUPERVISOR na ativação**. Não fiz esse restart. Chamadas feitas a partir de pane (import do pacote) já usam o código novo.

## 6. Limites conhecidos / pendências para o supervisor
- Se um worker chamar o **gateway** por uma API sem pane e sem `spawnedBy`, ele é visto como `supervisor:hermes`. O gateway não recebe o pane do chamador. O incidente de 27/09 foi pelo caminho do pane, e esse está coberto. Fechar o caminho do gateway exige o Hermes propagar a identidade do chamador, o que está fora deste plugin.
- `mission.chain_depth_max` **não** foi escrito no `/root/.hermes/config.yaml`, porque é o config global do Hermes (`_config_version: 46`) e o default 1 é o valor pedido. Para mudar, adicione:
  ```yaml
  mission:
    chain_depth_max: 1
  ```
- Missões que devem poder despachar sub-missão precisam da linha `allow_chain_dispatch: true` no prompt **antes** do despacho.
- Não toquei em: volume-cache-awq-01, health-sentinel-fix-02, /opt/gpu-watchdog, /opt/vast-volume-watch. Também não peguei a cost fix do mission_close. Sem push.

## 7. verify.json
Prova executável read-only: `evidence/chain-dispatch-gov-01/check-chain-gov.sh` → `CHAIN-GOV OK 17`. O script roda os 17 casos com estado e spool em tmp. Depois confirma no bus real o evento `refused`/`CHAIN_DISPATCH_NOT_ALLOWED` da sonda e que a sonda não virou ledger.

Gerado com `mission_verify_author` (dogfood, `force=true` sobre o verify.json da verify-manifest-01, que está versionado em `7857646`). O diff e o resultado do runner estão em `provas/chain-dispatch-gov-01/dogfood-author.json`. Resultado na seção 8.

## 8. Autoverificação e memória — BLOQUEADAS por credencial (ponto de parada do operator)
**Resultado do verify.json:** `mission_verify_author` com `force` gravou o manifesto com provenance `{"report": 17, "prompt": 1}`. O `mission_verify` rodou logo depois: **verdict pass 18/18**, `llm_calls 0`. O check `cmd` do script de evidência terminou com `CHAIN-GOV OK 17`. Arquivos: `provas/chain-dispatch-gov-01/dogfood-author.json` (diff incluso) e `provas/chain-dispatch-gov-01/verify-final.json`.

**`engineering.judge.verify`:** chamei no MCP local `http://127.0.0.1:8787/mcp` com o bearer configurado em `mcp_servers.engmcp-local` (credencial lida do config/.env, nunca impressa). A chamada levava 6 claims deste relatório contra as provas em disco. Resposta:
```
{"code":"AUTHORIZATION_SCOPE_REQUIRED","category":"scope","retryable":false,
 "remediation":"Ask the operator to grant the required engineering:* scope to the calling bearer (grants are operator-issued)."}
```
**`engineering.memory.capture`:** mesma resposta (`AUTHORIZATION_SCOPE_REQUIRED`). A primeira tentativa foi recusada antes, por schema, porque eu tinha mandado a chave `tags`. Corrigi e a segunda bateu no scope.

A concessão de scope é do operator. Não procurei outro token nem montei credencial. Payloads prontos para reexecutar sem mudar nada:
```
python3 provas/chain-dispatch-gov-01/mcp_call.py engineering.judge.verify provas/chain-dispatch-gov-01/judge-payload.json provas/chain-dispatch-gov-01/judge-response.json
python3 provas/chain-dispatch-gov-01/mcp_call.py engineering.memory.capture provas/chain-dispatch-gov-01/capture-payload.json provas/chain-dispatch-gov-01/capture-response.json
```
As respostas de erro estão gravadas em `judge-response.json` e `capture-response.json`.
