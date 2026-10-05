# RELATÓRIO WD-FP-01-FIM — Watchdog: conclusão dos 2 pontos pendentes do fix

## Contexto
A WD-FP-01 fechou com verify pass (suíte verde) mas os 2 pontos do escopo NÃO estavam no código (verificado por grep: sem `_CYCLE_LIVE`, sem `watchdog_deriva_repeat`). Esta missão confirma que ambos os pontos foram aplicados e a suíte está verde.

## Estado do fix
Os 2 pontos já foram aplicados ao `/opt/gpu-watchdog/watchdog.py` (alterações não commitadas, backup em `watchdog.py.bak-WD-FP-01` com 147567 bytes):

### Ponto 1: `_CYCLE_LIVE = live_ledgers()`
- **Local**: `run_cycle()` linha 2491, `_CYCLE_LIVE = live_ledgers()`
- **Uso**: `active_missions(_CYCLE_LIVE, panes, mid)` na classificação D1 (linha 2351)
- **Efeito**: outras missões contam como ativas também pelo ledger vivo (não só pela aba `MISSION:<id>`)

### Ponto 2: teto de 1 interrupção por turno
- **Inicialização**: `e["deriva_turn_interrupted"] = False` (linha 2339, início de episódio)
- **Ativação**: `e["deriva_turn_interrupted"] = True` após injeção de deriva (linha 2699)
- **Reset**: volta a `False` quando `agent_status != "working"` (turno acabou, ~linha 2345)
- **Evento**: 2ª deriva no mesmo turno vira `watchdog_deriva_repeat` no bus (linhas 2583-2588), sem nova interrupção, dedupe por pane+motivo

## Provas executadas
- **Fixture 2ª deriva mesmo turno**: `test_iii_segunda_no_mesmo_turno_nao_reinterrompe` → 0 interrupções novas, 1 evento `watchdog_deriva_repeat` ✓
- **Fixture ativa só por ledger**: `test_ii_b_alheia_ativa_so_por_ledger_vivo_interrompe` → 1 interrupção contabilizada via `_CYCLE_LIVE` ✓
- **Suíte completa**: `python3 test_mission_ops.py` → Ran 139 tests, OK (~33s) ✓
- **Suíte watchdog WD-FP-01**: `python3 test_watchdog_wd_fp_01.py` → Ran 13 tests, OK ✓
- **Runner**: `python3 /opt/deliver-verify/verify.py --mission WD-FP-01-FIM` → verdict: pass ✓

## Arquivos de prova
- `/root/.hermes/plugins/mission-ops/verify.json` (mission: WD-FP-01-FIM)
- `/opt/gpu-watchdog/watchdog.py.bak-WD-FP-01` (backup 147567 bytes)
- `/opt/gpu-watchdog/test_watchdog_wd_fp_01.py` (13 testes)

## Veredito
PASS
