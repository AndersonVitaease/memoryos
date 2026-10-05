# RELATÓRIO — gpu-cost-fix-01 (28/09/2026)

Componente: `/root/.hermes/plugins/mission-ops/`. HEAD de partida: `9151f8d`, working tree limpa nos arquivos tocados.
Patch dirigido, sem rewrite: `notify.py`, `__init__.py`, `test_gpu_cost_coerce.py`, `test_mission_ops.py` e o teste novo `test_gpu_cost_trail.py`.
Provas: `provas/gpu-cost-fix-01/`. Prova executável: `evidence/gpu-cost-fix-01/check-gpu-cost.sh`.
Não toquei: `/opt/gpu-orchestrator` (só leitura), `/opt/guardian-compute`, `/opt/gpu-watchdog`, `/root/.hermes/tools`. Sem push, sem recurso pago, sem registry/tokens.

## Resumo
| item | estado |
|---|---|
| 1. Reproduzir o TypeError | **Reproduzido nos dois pontos.** (i) Histórico: `now - readyAt` com `readyAt` ISO str dava `TypeError: unsupported operand type(s) for -: 'float' and 'str'`. Estava em `notify.mission_gpu_cost_usd` antes de `d54724d`, e o `try` externo engolia o erro e apagava o custo. (ii) **Ainda vivo no HEAD:** `probe_budget_alert(mission_cost_usd="9.5")` dava `TypeError: '>' not supported between instances of 'str' and 'float'`. |
| 2. Fix determinístico | A coerção fica na borda (`cost_coerce.num`/`epoch`). str de API vira float. None, lixo ou ausente vira **`cost_unmeasured: <motivo>`**, nunca estimativa. |
| 3. Trilha por missão | O `mission_close` grava `{missionId, instance_id, created_at, destroyed_at, tokens_proxy, cost_usd+final \| cost_unmeasured}` no ledger (`cost`) e no spool (`kind` `mission_cost`/`cost_unmeasured`, dedupe por assinatura). O `mission_completed` usa **o mesmo número**. A consulta é `nf.mission_cost_lookup(missionId)`. |
| 4. Provas red→green | RED: 17 testes, 15 erros → GREEN 23/23 (os 17 novos mais os 6 do `test_gpu_cost_coerce`). |
| 5. Suíte full isolada | **205/205 OK**, 33,3 s, scope `gpu-cost-fix-suite` (MemoryMax=2G), pico de RSS 27 MB. |
| 6. verify.json | Gerado com `mission_verify_author` (dogfood, diff revisado): **pass 18/18**, `llm_calls 0`. |
| judge.verify / memory.capture | **BLOQUEADOS por `AUTHORIZATION_SCOPE_REQUIRED`**. O grant é do operator (seção 9). |

## Achado principal (d): custo inventado no close de missão sem GPU
Antes do fix, o close chamava `nf.mission_gpu_cost_usd()`. Essa função soma o `cost_ledger` do `/opt/gpu-orchestrator/state.json`, e esse arquivo **sobrevive ao destroy**. Resultado: qualquer missão engine=gpu fechada depois recebia o custo da última sessão, mesmo que já estivesse destruída. Prova viva (`provas/gpu-cost-fix-01/prova-viva-readonly.txt`):

- Esta missão tem `engine=gpu` e `gpuUpOk=False` (`gpu_up_failed` exit 3, "nenhuma oferta RTX_4090 <=$0.5/h", 15:35:56Z).
- **ANTES:** `mission_gpu_cost_usd() = 0.618549`. O close emitiria `custo_gpu=US$0.6185`, que é o custo final da instância **53163485**, destruída às 1790598007, quase 3h antes desta missão começar.
- **DEPOIS:** `cost_unmeasured: "gpu_up_failed: missão rodou sem GPU elástica — nenhuma instância atribuível"`.
- Contrafactual com `gpuUpOk=True`: `cost_unmeasured: "instance_destroyed_before_mission: instância 53163485 destruída em 1790598007, missão iniciou em 1790609762 — no-op, custo não pertence à missão"`. Assim o no-op do gpu-down ("já destruída/sem estado") segue honesto e sem custo inventado.

## 1–2. Operação exata e fix
- `notify.probe_budget_alert`: `mission_cost_usd > limit_mission` recebia str. Agora passa por `cost_coerce.num` antes da comparação; lixo retorna `None` e não gera alerta.
- `notify.mission_cost_record(ledger)` (novo) é o custo **estrito**, avaliado nesta ordem:
  1. `gpuUpOk is False` → `gpu_up_failed`
  2. state ilegível/ausente → `gpu_state_unreadable: <Exc>`
  3. `status=down` sem `destroyedAt` → `instance_down_without_destroyedAt`
  4. `destroyedAt` < início da missão (`dispatchedAt`, senão `createdAt`) → `instance_destroyed_before_mission`
  5. status desconhecido → `gpu_state_status_unknown`
  6. qualquer entrada do `cost_ledger` com `cost_usd` None, lixo, ausente ou entrada não-dict → `cost_ledger_entry_unparseable: idx=i valor=…`. A regra antiga somava ignorando esses valores, o que subcontava o custo.
  7. `status=up`: trecho ainda cobrando = `(now − max(billed_to, último to, startedAt|readyAt)) × dph`, a mesma base do `gpu-down.sh`. Sem `dph` → `dph_usd_unparseable`; sem base → `running_segment_no_start`. Nesse caso `final=false`.
  - `tokens_proxy`: soma de `tokens_in + tokens_out` dos eventos `proxy_call` do `/opt/gpu-bridge/audit.jsonl` na janela [início da missão, close]. Os eventos `proxy_call_classifier` ficam de fora. Audit ilegível ou tokens não numéricos → `tokens_proxy=null` e `tokens_unmeasured: <motivo>`, nunca 0 inventado.
- `notify.record_mission_cost` (novo) grava no spool com assinatura `kind:missionId:close:<instance>:<destroyed_at>:<custo|motivo>`, então um close repetido e idêntico não duplica. `notify.mission_cost_lookup` devolve o último registro da missão.
- `notify.mission_completed(..., cost_unmeasured=)`: quando não há custo medido, emite `custo_gpu=unmeasured(<motivo>)`.
- `__init__.handle_mission_close`: o custo e o `mission_completed` agora rodam no **passo 6, depois do gpu-down**. Antes eram calculados antes do destroy, então o custo nunca era final. O resultado vai para `ledger["cost"]`, para o step `mission_cost` na resposta e para o spool. Missão sem engine=gpu não tem step nem campo `cost`.
- Isolamento de teste: `TempState` agora redireciona também `nf.SPOOL` e `nf.SIGNATURES_FILE` para tmp. Conferido: 0 linhas de missão de teste no `/opt/mission-events/spool.jsonl` real.
- **Mudança consciente de asserção antiga:** `test_gpu_cost_coerce.test_close_fake_gpu_mission_no_typeerror` exigia `custo_gpu=US$…` de um state com `cost_ledger` contendo `"lixo"`/`None`/`{}`. Pelo contrato, isso agora é `custo_gpu=unmeasured(cost_ledger_entry_unparseable)`. A prova de "sem TypeError/ValueError" continua lá.

## 4. Provas red→green
- RED: `provas/gpu-cost-fix-01/red-test_gpu_cost_trail.txt`, `Ran 17 tests … FAILED (errors=15)`. Inclui o `TypeError '>' str×float` vivo do budget probe. Os 2 testes que já passavam são a reprodução histórica da expressão `float − str`.
- Histórico: `provas/gpu-cost-fix-01/red-historico-pre-d54724d.txt` mostra `TypeError: unsupported operand type(s) for -: 'float' and 'str'`.
- GREEN: `provas/gpu-cost-fix-01/green-test_gpu_cost_trail.txt`, `Ran 23 tests … OK`.
  - (a) `TestTypeErrorRepro`: campos ISO/str não quebram mais e o custo é calculado (0.45).
  - (b) `TestUnmeasured`: lixo, None, `{}`, não-dict, dph None, sem início, state ausente, down sem destroyedAt, budget com str. Todos sem crash e com motivo.
  - (c) `TestMeasured`: final 0.225 (str) + 0.225 = 0.45, com timestamps create/destroy, 175 tokens e 2 chamadas só da janela. Trecho rodando a partir de `billed_to`.
  - (d) `TestNoOpHonest`: destruída antes da missão, e gpu-up falho com `instance_id=null`.
  - Trilha: `TestSpoolTrail` (dedupe e lookup). `TestCloseTrail` confirma o no-op no close real, o mesmo número em ledger, spool e `mission_completed`, e que missão não-gpu fica sem step.

## Exemplos de trilha de custo
Medido, a partir de ledger real (read-only, não gravado), `judge-restore-01` na 53163485:
```json
{"missionId": "judge-restore-01", "instance_id": "53163485", "created_at": 1790593110.0, "destroyed_at": 1790598007.0, "mission_started_at": 1790593355.0, "closed_at": 1790598007, "tokens_proxy": 1704234, "tokens_proxy_calls": 345, "cost_usd": 0.618549, "final": true}
```
Não medido (esta missão):
```json
{"missionId": "gpu-cost-fix-01", "instance_id": null, "tokens_proxy": null, "cost_unmeasured": "gpu_up_failed: missão rodou sem GPU elástica — nenhuma instância atribuível", "tokens_unmeasured": "cost_unmeasured"}
```
Linha no spool (formato, de teste): `{"ts": …, "event": "finding", "kind": "mission_cost", "missionId": "gpu-close-1", "instance_id": "53163485", …, "cost_usd": 0.45, "final": true, "source": "mission-ops:cost"}`.

## 5. Suíte full (MEM-GUARD)
```
systemd-run --scope --unit=gpu-cost-fix-suite -p MemoryMax=2G -p MemorySwapMax=0 \
  --working-directory=/root/.hermes/plugins/mission-ops bash -c 'cat /proc/self/cgroup; /usr/bin/time -v python3 -m unittest \
  test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce test_verify_json_ghost \
  test_ledger_hygiene test_watch_detector test_verify_author test_chain_dispatch test_gpu_cost_trail'
```
Resultado: cgroup `0::/system.slice/gpu-cost-fix-suite.scope`, **Ran 205 tests OK** (188 anteriores + 17 novos), 33,3 s, RSS máximo 27612 KB, exit 0. Arquivo: `provas/gpu-cost-fix-01/suite-full.txt`.

## 6. Import + self-test (boot declarado)
- `provas/gpu-cost-fix-01/selftest-load.txt`: python do gateway 3.14.7, import OK, **12 tools registradas**, API nova de notify presente.
- `provas/gpu-cost-fix-01/smoke.txt`: `smoke_mission_ops.py` → `SMOKE OK` (`SMOKE_ROLLBACK=0`, em scope).
- **Boot declarado:** o gateway em execução ainda tem o código antigo em memória. O restart que ativa o fix é do **SUPERVISOR**. Não reiniciei. Chamadas pelo pane (import do pacote) já usam o código novo.

## 7. verify.json
Prova executável read-only: `evidence/gpu-cost-fix-01/check-gpu-cost.sh` → `GPU-COST OK 23`. O script roda os 23 casos em tmp e depois confere o no-op honesto contra o state REAL. Gerado com `mission_verify_author` (dogfood, `force` sobre o verify.json da chain-dispatch-gov-01, versionado em `9151f8d`). Revisei o diff em `dryRun` antes de gravar: 18 itens com provenance `{"report": 17, "prompt": 1}`, todos arquivos e provas reais desta missão. Os 11 descartes estavam corretos (fragmentos de prosa como `now - readyAt` e paths restritos de `/opt/gpu-orchestrator`). Depois o `mission_verify` rodou: **verdict pass 18/18**, `llm_calls 0`, cmd `GPU-COST OK 23`. Diff e resultado estão em `provas/gpu-cost-fix-01/dogfood-author.json`.

## 8. Limites conhecidos / pendências
- **Achado fora do meu escopo (dono: `/opt/gpu-orchestrator`, missão concorrente):** a linha do `gpu-down.sh` que grava `kind gpu_down` no bus usa `US$$COST` dentro de aspas duplas. O bash expande `$$` para o PID, e o spool real registrou `"cost US437686COST"` (linha 7848). O echo do stdout usa `US\$$COST` e está correto. O fix é trocar para `US\$$COST` na linha do spool. **Não toquei.**
- O custo é o da **sessão GPU inteira** que se sobrepõe à missão. Se duas missões gpu compartilharem uma sessão (garfo anti-thrash), cada uma reporta o custo da sessão. Para somar sem dupla contagem, deduplicar por `instance_id` + `destroyed_at`. O rateio por janela não foi feito: as entradas do `cost_ledger` nem sempre têm `from`/`to`, e ratear seria estimar.
- `tokens_proxy` conta todo `proxy_call` da ponte 8102 na janela da missão. O proxy é compartilhado e o audit não tem missionId, então chamadas de outra origem na mesma janela entram na soma.
- `nf.mission_gpu_cost_usd()` (tolerante) continua em uso só pelo `budget_alert` do watcher, como sinal de alarme e não como relatório de custo.

## 9. Autoverificação e memória — BLOQUEADAS por credencial (ponto de parada do operator)
`engineering.judge.verify` (6 claims deste relatório contra as provas em disco) e `engineering.memory.capture` foram chamados no MCP local `engmcp-local`. A credencial foi lida do config/.env e nunca impressa. Os dois responderam:
```
{"code":"AUTHORIZATION_SCOPE_REQUIRED","category":"scope","retryable":false,
 "remediation":"Ask the operator to grant the required engineering:* scope to the calling bearer (grants are operator-issued)."}
```
O grant de scope é do operator. Não procurei outro token. Para reexecutar sem mudar nada:
```
python3 provas/gpu-cost-fix-01/mcp_call.py engineering.judge.verify provas/gpu-cost-fix-01/judge-payload.json provas/gpu-cost-fix-01/judge-response.json
python3 provas/gpu-cost-fix-01/mcp_call.py engineering.memory.capture provas/gpu-cost-fix-01/capture-payload.json provas/gpu-cost-fix-01/capture-response.json
```

## RESULT
Custo do `mission_close` sem TypeError e honesto. Os dois TypeErrors float-str foram reproduzidos e corrigidos: `float − str` (histórico) e `str > float` no budget probe (vivo até hoje). O custo alheio de US$0,6185 da 53163485 deixa de ser atribuído a missões posteriores. Cada missão engine=gpu fecha com um único registro `mission_cost` ou `cost_unmeasured: motivo` no ledger e no spool, com dedupe. Red 15 erros / 17 → green 23/23; suíte 205/205 isolada; import py3.14 com 12 tools e `SMOKE OK`. A ativação no gateway depende do restart pelo SUPERVISOR.
