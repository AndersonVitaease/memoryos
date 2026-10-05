# Relatório final — WATCH-DETECTOR-FIX-01 (needs_supervisor sem falso positivo)

Data: 2026-09-28. Contrato: `missao-watch-detector-fix-01.md`.

## Resumo

| # | Falso positivo | Causa raiz medida | Fix (patch dirigido) | red → green |
|---|---|---|---|---|
| 1 | snapshot flaggeia missão `closed` | `_watch_one` usava o ledger listado ANTES da leitura dos panes (corrida com `mission_close`) e o watch single nunca olhava o status; `_on_event` mandava todo evento sem receita (`turn_done`, `monitor_wait`…) para `needs_supervisor` | `_watch_one` relê o ledger; status terminal (≠ `delivered`) → `verdict=closed`, sem evento, sem flag, sem mutação | 2 FAIL (`'needs_supervisor' == 'needs_supervisor'`) → 2 ok |
| 2 | `last_content_line` não descarta linhas separadoras | no `/opt/gpu-watchdog/watchdog.py`, uma linha só de `─`/`━`/`═` (régua do input box do claude) virava "última linha de conteúdo" | `SEPARATOR_RE = [─━═\s]+` com fullmatch → pula (texto com régua no meio segue valendo) | 3 FAIL → 3 ok (+1 caso na suíte do próprio watchdog) |
| 3 | `turn_done` + relatório + verify.json lido como needs_supervisor | não existia verificação de conclusão em disco | `_supervisor_verdict`: `turn_done` + relatório final (`reportPath` ou `RELATORIO-/relatorio-/report-*<missionId>*.md` no cwd) + `verify.json` no cwd → `verdict=awaiting_close` (não fecha sozinho; o close segue sendo do supervisor) | 3 FAIL → 3 ok (inclui os controles: sem relatório / sem verify.json → segue `needs_supervisor`) |
| 4 | snapshot defasado vira flag "AGORA" | o horário do evento não era comparado com nada | horário do rodapé `· done H:MM AM/PM` comparado com a última intervenção do supervisor (`nudges.json`, gravado por `mission_nudge`) → `verdict=stale`. Conservador: só é stale se o **minuto inteiro** do rodapé precede o nudge | 4 FAIL → 4 ok (inclui os controles: mesmo minuto / sem intervenção / evento posterior) |

Todo evento sem receita agora sai com um campo `verdict` ∈ `closed | awaiting_close | stale | observed | needs_supervisor`.
- `note` continua `"needs_supervisor"` literal quando é o caso, então quem consome o campo não quebra.
- `observed` = status ≠ `dispatched` (needs_supervisor só existe para `dispatched` com pane vivo; o pane morto já retornava `pane_closed`/`tab_closed` antes).

## Provas (`provas/watch-detector-fix-01/`)
- `red.txt` — `test_watch_detector.py` ANTES do fix: **12/12 FAIL** (o FP1 reproduz o misfire real: `note == 'needs_supervisor'` em missão closed).
- `green.txt` — DEPOIS: **Ran 12 tests — OK**.
- `suite-full.txt` — **suíte FULL do plugin: Ran 161 tests in 32.788s — OK, EXIT=0, PEAK=43499520 (43 MB)**.
- `suite-gpu-watchdog.txt` / `suite-gpu-watchdog-baseline.txt` — watchdog: 83 testes. Falham só 2, `test_gpu_watchdog.TestGPUDetectors` (legado, fora da lista canônica do `run_suites.py`). O baseline sem meu patch falha nas **mesmas 2**, logo são pré-existentes. Os módulos canônicos (`test_watchdog_02/02b/d9/lane2/infra`) passam todos, inclusive o caso novo.
- `live-judge-deploy-01.txt` — prova viva, só leitura, no ledger REAL da `judge-deploy-01` (closed): `verdict=closed`, `run_herdr` substituído por um que aborta (zero chamada herdr), `events.jsonl` 1078 → 1078 linhas (nenhuma escrita).
- `verify-run.json` — runner canônico `/opt/deliver-verify/verify.py --mission watch-detector-fix-01 --manifest verify.json` → **pass, 11/11 checks** (6 cmd, 1 service, 4 file).
- `judge-payload.json` / `judge-response.json` — autoverificação `engineering.judge.verify` → **JUDGED, ALL_SUPPORTED (5/5 claims)**, modelo Qwen2.5-Coder-32B-Instruct-AWQ via jev-1.13.

## Contenção de memória (obrigatória)
Comando exato da suíte FULL (fora do cgroup herdr; este pane roda em `/system.slice/herdr-server.service`):

```
systemd-run --scope --unit=watch-detector-fix-suite -p MemoryMax=2G -p MemorySwapMax=0 \
  --working-directory=/root/.hermes/plugins/mission-ops bash -c 'python3 -m unittest \
  test_mission_ops test_lane2 test_mission_list_compacto test_gpu_cost_coerce \
  test_verify_json_ghost test_ledger_hygiene test_watch_detector ...'
```

Achado e decisão técnica:
1. A 1ª rodada, com `MemoryMax=12G`, foi **OOM-morta em ~100s** (journal: `oom-kill`). A causa do leak de 4,3G+ era o `TestDispatch.test_start_timeout_records_state`.
2. O loop real de 180s de ready do dispatch gira **sem sleep** quando `wait_output`/`read_output` são mocks com `return_value`. O `unittest.mock` grava cada chamada em `mock_calls`, então são milhões de registros e a memória cresce sem teto. Por isso nenhum cap segurava a suíte (a ledger-hygiene-01 viu o mesmo com 2G e 6G).
3. Fix **só no teste**: relógio falso (`PKG.time.time` avança 16s por chamada, o equivalente a um wait de 15s). O código de produção não mudou.
4. Resultado: o teste roda em 0,11s com RSS de 27 MB, e a suíte inteira cai de 213–323s para **33s, com pico de 43 MB sob o teto duro de 2G**.

## Carga só no boot — o que precisa de restart para valer
| Fix | Onde roda | Precisa de | Estado |
|---|---|---|---|
| 1, 3, 4 (`__init__.py`: `_watch_one`/`_on_event`/`_supervisor_verdict`) | tool `mission_watch` do **gateway Hermes** (PID 566969) | restart do gateway | **NÃO reiniciado** (consequência externa: sessões vivas do operator) |
| 2 (`/opt/gpu-watchdog/watchdog.py`: `last_content_line`) | daemon `gpu-watchdog.service` (ativo desde 12:58:06Z) | `systemctl restart gpu-watchdog` | **NÃO reiniciado** |
| — | `mission-watcher.service` e `gpu-watchdog` importam o pacote `mission-ops` (`importlib.import_module("mission-ops.mission_core")` executa o `__init__`) | nada (eles não chamam `mission_watch`) | import provado limpo |

O plugin carrega sem erro:
- `importlib.import_module('mission-ops')` + `register(ctx)` → **11 tools registradas**, `import OK`.
- `SMOKE_ROLLBACK=0 python3 smoke_mission_ops.py` → **SMOKE OK**. Este é o mesmo smoke que o watchdog roda pós-ciclo com rollback automático; meus diffs sobreviveram aos ciclos e já estão commitados.

## Regras de condução
- vast-volume-watch-01 (`/opt/vast-volume-watch`): **zero toque**.
- Nenhuma missão fechada ou alterada no ledger; formato do ledger inalterado (o `verdict` é campo de **resposta** do `mission_watch`, não do ledger).
- Nenhum comando negado pelo classificador.
- Arquivos tocados:
  - plugin: `__init__.py` (+91/-1), `test_mission_ops.py` (1 teste, relógio falso), `test_watch_detector.py` (novo), `verify.json`, este relatório, `provas/`;
  - watchdog: `watchdog.py` (+3), `test_watchdog_02.py` (+6).

Nota sobre o `verify.json` no cwd do plugin: o DELIVER-VERIFY do `mission_close` roda o manifesto do cwd. Uma missão futura despachada com cwd `/root/.hermes/plugins/mission-ops` herdaria este `verify.json` se não o sobrescrever. As missões anteriores deste cwd não deixaram manifesto, e ele fica aqui por exigência do contrato.

## Commits
- `/opt/gpu-watchdog` `0dbe73e` — watch-detector-fix-01: last_content_line descarta linhas separadoras ─/━/═
- `/root/.hermes/plugins/mission-ops` `dc59b64` — watch-detector-fix-01: needs_supervisor sem falso positivo; red→green 12/12; leak do TestDispatch corrigido no teste; suíte 161/161 OK
- relatório/provas/verify.json: commit seguinte

## Pendente (para o operator)
- [ ] Reiniciar o gateway Hermes e o `gpu-watchdog.service` quando for conveniente. Até lá, os fixes estão no disco, testados, mas **não vigentes**.

RESULT: SUCESSO — os 4 falsos positivos corrigidos por patch dirigido, red→green 12/12, suíte FULL do plugin 161/161 OK isolada (`MemoryMax=2G`, pico 43 MB, leak do TestDispatch eliminado na raiz), prova viva na judge-deploy-01 real, plugin carrega limpo; vigência depende de restart (gateway + gpu-watchdog), não executado.
